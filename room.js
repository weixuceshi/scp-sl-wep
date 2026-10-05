import { ann } from './ui.js';

let ws = null;
let roomCode = null;
let isHost = false;
let myId = null;
let myName = null;
let connected = false;

// 已连接的 peer：id -> { mesh, name, role, team }
const peers = new Map();

function connect() {
  return new Promise((resolve, reject) => {
    if (ws && ws.readyState === 1) { resolve(ws); return; }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    let resolved = false;
    try {
      ws = new WebSocket(url);
    } catch (e) {
      reject(new Error('创建连接失败'));
      return;
    }
    ws.onopen = () => { connected = true; if (!resolved) { resolved = true; resolve(ws); } };
    ws.onerror = () => { if (!resolved) { resolved = true; reject(new Error('无法连接服务器')); } };
    ws.onmessage = (e) => handleMessage(JSON.parse(e.data));
    ws.onclose = () => {
      connected = false;
      ann('与服务器断开连接');
    };
  });
}

export function ensureConnection() {
  return connect();
}

function send(msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'connected':
      myId = msg.id;
      break;

    case 'room_created':
      roomCode = msg.code;
      isHost = true;
      myName = (document.getElementById('room-name').value.trim()) || '房主';
      document.getElementById('room-created-info').classList.remove('hidden');
      document.getElementById('display-code').textContent = msg.code;
      document.getElementById('display-invite-url').value = msg.inviteUrl;
      document.getElementById('waiting-room-name').textContent = msg.room.name;
      document.getElementById('waiting-code').textContent = msg.code;
      document.getElementById('btn-start-game').classList.remove('hidden');
      showRoomWaiting();
      updatePlayerList(msg.room.players);
      ann('房间创建成功：' + msg.code);
      break;

    case 'room_joined':
      roomCode = msg.code;
      isHost = msg.isHost;
      if (isHost) document.getElementById('btn-start-game').classList.remove('hidden');
      else document.getElementById('btn-start-game').classList.add('hidden');
      document.getElementById('waiting-room-name').textContent = msg.room.name;
      document.getElementById('waiting-code').textContent = msg.code;
      document.getElementById('join-error').classList.add('hidden');
      showRoomWaiting();
      updatePlayerList(msg.players);
      ann('已加入房间 ' + msg.code);
      break;

    case 'player_joined':
      updatePlayerList(msg.players);
      ann((msg.name || msg.id) + ' 加入了房间');
      break;

    case 'player_left':
      updatePlayerList(msg.players);
      ann('一名玩家离开了房间');
      break;

    case 'host_changed':
      isHost = (msg.newHost === myId);
      document.getElementById('btn-start-game').classList.toggle('hidden', !isHost);
      ann(isHost ? '你已成为房主' : '房主已转移');
      break;

    case 'game_starting':
      ann(`游戏将在 ${msg.countdown} 秒后开始`);
      document.getElementById('btn-start-game').disabled = true;
      break;

    case 'game_started':
      startMultiplayerGame();
      break;

    case 'room_list':
      // 由调用方监听
      break;

    case 'error':
      const err = document.getElementById('join-error');
      if (err) {
        err.textContent = msg.msg;
        err.classList.remove('hidden');
      }
      ann('错误：' + msg.msg);
      break;

    // ── 多人游戏同步 ──
    case 'peer_pos':
      updatePeer(msg.id, msg);
      break;

    case 'peer_shoot':
      spawnPeerMuzzle(msg.id, msg.pos, msg.dir);
      break;

    case 'peer_interact':
      ann('队友触发了互动');
      break;

    case 'peer_damage':
      if (msg.fatal && msg.target === myId) {
        // 自己被击杀
        window.__playerKilled && window.__playerKilled();
      }
      break;
  }
}

function showRoomWaiting() {
  document.getElementById('room-waiting').classList.remove('hidden');
}

function updatePlayerList(players) {
  const ul = document.getElementById('players-ul');
  if (!ul) return;
  ul.innerHTML = players.map((p, i) =>
    `<li class="${i === 0 ? 'host' : ''}">${i === 0 ? '👑 ' : ''}${escapeHtml(p.name)} <small>${p.id === myId ? '(你)' : ''}</small></li>`
  ).join('');
  const el = document.getElementById('player-count');
  if (el) el.textContent = players.length;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── 对外接口 ──
export function createRoom(name, password) {
  connect().then(() => send({ type: 'create_room', name, password })).catch(e => ann(e.message));
}

export function joinRoom(code, password) {
  connect().then(() => {
    myName = '玩家' + Math.floor(Math.random() * 900 + 100);
    send({ type: 'join_room', code, password, name: myName });
  }).catch(e => ann(e.message));
}

export function leaveRoom() {
  send({ type: 'leave_room' });
  roomCode = null;
  isHost = false;
  document.getElementById('room-waiting').classList.add('hidden');
  document.getElementById('main-menu').classList.remove('hidden');
  document.getElementById('hud').classList.add('hidden');
}

export function startMultiGame() {
  if (!isHost) return;
  send({ type: 'start_game' });
}

// ── 同步 ──
export function syncPosition(pos, rot, role, team) {
  if (!connected || !roomCode) return;
  send({ type: 'sync_pos', pos, rot, role, team });
}

export function syncShoot(pos, dir, weapon) {
  if (!connected || !roomCode) return;
  send({ type: 'shoot', pos, dir, weapon });
}

export function syncDamage(targetId, amount, fatal) {
  if (!connected || !roomCode) return;
  send({ type: 'damage', target: targetId, amount, fatal });
}

// ── 启动多人游戏 ──
function startMultiplayerGame() {
  document.getElementById('main-menu').classList.add('hidden');
  document.getElementById('room-waiting').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');

  const role = window.__selectedRole || 'ntf_private';
  const team = window.__selectedTeam || 'ntf';
  startGame({ mode: 'multi', role, ai: false, myId, team }).then(() => {
    ann('多人游戏开始！');
  });
}

// ── 渲染 peer ──
function updatePeer(id, data) {
  if (!window.__scene || !window.__scene.value) return;
  const scene = window.__scene.value;
  let peer = peers.get(id);
  if (!peer) {
    const box = BABYLON.MeshBuilder.CreateBox('peer_' + id, { size: 1.2 }, scene);
    const mat = new BABYLON.StandardMaterial('pm_' + id, scene);
    mat.diffuseColor = data.team === 'scp' ? new BABYLON.Color3(0.8, 0, 0)
      : data.team === 'ntf' ? new BABYLON.Color3(0.2, 0.4, 0.9)
      : new BABYLON.Color3(0.8, 0.5, 0.1);
    box.material = mat;
    peer = { mesh: box, name: data.name, role: data.role, team: data.team };
    peers.set(id, peer);
  }
  if (data.pos) {
    peer.mesh.position.x = data.pos.x;
    peer.mesh.position.y = data.pos.y;
    peer.mesh.position.z = data.pos.z;
  }
  if (data.rot) peer.mesh.rotation.y = data.rot.y || 0;
}

function spawnPeerMuzzle(id, pos, dir) {
  if (!window.__scene || !window.__scene.value) return;
  const scene = window.__scene.value;
  const flash = BABYLON.MeshBuilder.CreateSphere('mz_' + id, { diameter: 0.25 }, scene);
  if (pos) flash.position = new BABYLON.Vector3(pos.x, pos.y, pos.z);
  const mat = new BABYLON.StandardMaterial('mzm', scene);
  mat.emissiveColor = new BABYLON.Color3(1, 0.8, 0.3);
  mat.disableLighting = true;
  flash.material = mat;
  setTimeout(() => { try { flash.dispose(); } catch(e){} }, 60);
}

export function clearPeers() {
  peers.forEach(p => { try { p.mesh.dispose(); } catch(e){} });
  peers.clear();
}

export function getRoomCode() { return roomCode; }
export function getIsHost() { return isHost; }
export function getMyId() { return myId; }
