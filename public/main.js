import { initRender, startGame, getCamera, getScene, getMode } from './render.js';
import { initInput, isMobile } from './input.js';
import { initUI, ann } from './ui.js';
import * as Room from './room.js';

// ── 全局状态 ──
let engine = null;
let selectedRole = 'ntf_private';
let selectedTeam = 'ntf';

// ── 启动 Babylon 引擎 ──
const canvas = document.getElementById('renderCanvas');
engine = new BABYLON.Engine(canvas, true, { stencil: true, preserveDrawingBuffer: true });

initRender(engine, canvas);
initInput(canvas);
initUI();

// 全局引用（供其他模块读取）
window.__getMode = getMode;

// 移动端：显示摇杆/按钮
if (isMobile()) {
  document.getElementById('mobile-controls').classList.remove('hidden');
}

// ── URL 邀请码自动填入 ──
const params = new URLSearchParams(location.search);
const codeFromUrl = params.get('code');
if (codeFromUrl) {
  const joinInput = document.getElementById('join-code');
  if (joinInput) joinInput.value = codeFromUrl.toUpperCase();
  // 切到"加入房间"页
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.tab-btn[data-tab="join"]').classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-join').classList.add('active');
  ann('检测到邀请链接，已自动填入房间码');
}

// ── Tab 切换 ──
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById('tab-' + btn.dataset.tab);
    if (panel) panel.classList.add('active');
    // 进入浏览房间时拉一次列表
    if (btn.dataset.tab === 'list') loadRoomList();
  });
});

// ── 单人开局 ──
document.getElementById('btn-single').addEventListener('click', () => {
  document.getElementById('main-menu').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  startGame({ mode: 'single', role: selectedRole, ai: true });
  ann('单人 AI 模式启动');
});

// ── 创建房间 ──
document.getElementById('btn-create-room').addEventListener('click', () => {
  const name = document.getElementById('room-name').value.trim();
  const password = document.getElementById('room-pwd').value;
  Room.createRoom(name, password);
});

// ── 加入房间 ──
document.getElementById('btn-join-room').addEventListener('click', () => {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  const password = document.getElementById('join-pwd').value;
  const errEl = document.getElementById('join-error');
  if (code.length !== 6) {
    errEl.textContent = '房间码必须是 6 位';
    errEl.classList.remove('hidden');
    return;
  }
  errEl.classList.add('hidden');
  Room.joinRoom(code, password);
});

// 房间码自动转大写
document.getElementById('join-code').addEventListener('input', e => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
});

// ── 刷新房间列表 ──
document.getElementById('btn-refresh-rooms').addEventListener('click', loadRoomList);

async function loadRoomList() {
  const container = document.getElementById('room-list-container');
  container.innerHTML = '<p class="hint">连接中…</p>';
  try {
    const ws = await Room.ensureConnection();
    // 临时监听一次 room_list
    const onList = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'room_list') {
        renderRoomList(msg.rooms);
        ws.removeEventListener('message', onList);
      }
    };
    ws.addEventListener('message', onList);
    ws.send(JSON.stringify({ type: 'list_rooms' }));
  } catch (e) {
    container.innerHTML = '<p class="error">无法连接服务器，请确认已双击 start.bat 启动</p>';
  }
}

function renderRoomList(rooms) {
  const container = document.getElementById('room-list-container');
  if (!rooms || !rooms.length) {
    container.innerHTML = '<p class="hint">暂无可用房间，去创建一个吧</p>';
    return;
  }
  container.innerHTML = rooms.map(r =>
    `<div class="room-item">
       <div>
         <div class="ri-name">${escapeHtml(r.name)}</div>
         <div class="ri-meta">${r.players}/${r.maxPlayers} 人${r.locked ? ' · 🔒 有密码' : ''}</div>
       </div>
       <button class="btn btn-small btn-info" data-quick-join="${r.code}">加入</button>
     </div>`
  ).join('');
  container.querySelectorAll('[data-quick-join]').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = btn.dataset.quickJoin;
      document.getElementById('join-code').value = c;
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelector('.tab-btn[data-tab="join"]').classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById('tab-join').classList.add('active');
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── 阵营与角色选择 ──
const ROLE_DATA = {
  ntf: [
    { id: 'ntf_private', name: 'NTF 列兵', weapon: 'hk416', card: 2 },
    { id: 'ntf_sergeant', name: 'NTF 中士', weapon: 'hk416', card: 3 },
    { id: 'facility_guard', name: '设施保安', weapon: 'mp7', card: 2 }
  ],
  chaos: [
    { id: 'chaos_marauder', name: '混沌掠夺者', weapon: 'ak12', card: 2 },
    { id: 'chaos_rep', name: '混沌游击兵', weapon: 'ak12', card: 1 },
    { id: 'd_class', name: 'D 级人员', weapon: null, card: 1 }
  ],
  scp: [
    { id: 'scp_173', name: 'SCP-173 雕像', weapon: null, card: 0 },
    { id: 'scp_096', name: 'SCP-096 害羞的人', weapon: null, card: 0 },
    { id: 'scp_049', name: 'SCP-049 瘟疫医生', weapon: null, card: 0 },
    { id: 'scp_106', name: 'SCP-106 老男人', weapon: null, card: 0 },
    { id: 'scp_939', name: 'SCP-939 多声之兽', weapon: null, card: 0 }
  ]
};

function renderRoleSelect(faction) {
  selectedTeam = faction;
  const container = document.getElementById('role-select');
  container.innerHTML = ROLE_DATA[faction].map((r, i) =>
    `<div class="role-card${i === 0 ? ' selected' : ''}" data-role="${r.id}">${r.name}</div>`
  ).join('');
  selectedRole = ROLE_DATA[faction][0].id;
  container.querySelectorAll('.role-card').forEach(card => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedRole = card.dataset.role;
    });
  });
}
renderRoleSelect('ntf');

document.querySelectorAll('.faction-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.faction-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderRoleSelect(btn.dataset.faction);
  });
});

// 暴露给 room.js
window.__selectedRole = selectedRole;
window.__selectedTeam = selectedTeam;
export function getSelectedRole() { return selectedRole; }
export function getSelectedTeam() { return selectedTeam; }
