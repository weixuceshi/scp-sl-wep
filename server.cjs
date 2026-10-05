const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080; // 改默认8080匹配日志
const publicDir = path.join(__dirname, 'public');

// 👇 新增调试日志（定位404核心）
console.log('__dirname:', __dirname);
console.log('publicDir:', publicDir);
console.log('index exists:', fs.existsSync(path.join(publicDir, 'index.html')));
console.log('public contents:', fs.existsSync(publicDir) ? fs.readdirSync(publicDir) : 'NOT FOUND');

// —— HTTP 静态文件服务 ——
const mimeTypes = {
// ── HTTP 静态文件服务 ──────────────────────────
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  let filePath = decodeURIComponent(req.url.split('?')[0]);
  if (filePath === '/') filePath = '/index.html';
  const fullPath = path.join(publicDir, filePath);

  // 防越界
  if (!fullPath.startsWith(publicDir)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  // 健康检查（Railway 探活用）
  if (filePath === '/health' || filePath === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, uptime: process.uptime(), rooms: rooms.size, clients: clients.size }));
    return;
  }
  // 部署信息
  if (filePath === '/api/info') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ name: 'SCP:SL Web Edition', version: '0.4.1', mode: 'railway' }));
    return;
  }

  fs.readFile(fullPath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not found: ' + filePath); return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

// ── WebSocket 服务器 ──────────────────────────
const wss = new WebSocketServer({ server });

// 捕获最近一次 upgrade 请求的 headers（用于生成邀请链接）
let lastReqHeaders = null;
server.on('upgrade', (request) => {
  lastReqHeaders = request.headers || {};
});

// 房间表：code -> room
const rooms = new Map();
// 客户端表：ws -> client
const clients = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.random() * chars.length | 0];
  if (rooms.has(s)) return generateCode();
  return s;
}

function broadcast(roomCode, msg) {
  const room = rooms.get(roomCode);
  if (!room) return;
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => {
    const cl = clients.get(c);
    if (cl && cl.room === roomCode && c.readyState === 1) {
      c.send(data);
    }
  });
}

function getLocalIP() {
  try {
    const os = require('os');
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        if (net.family === 'IPv4' && !net.internal) return net.address;
      }
    }
  } catch (e) {}
  return 'localhost';
}

wss.on('connection', (ws) => {
  const clientId = Math.random().toString(36).slice(2, 10);
  const client = { id: clientId, room: null, role: null, name: '玩家' };
  clients.set(ws, client);

  ws.send(JSON.stringify({ type: 'connected', id: clientId }));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (!msg || !msg.type) return;

    switch (msg.type) {

      // ── 创建房间 ──
      case 'create_room': {
        const code = generateCode();
        const room = {
          code,
          name: (msg.name || '').trim() || '未命名房间',
          host: clientId,
          players: [],
          maxPlayers: 20,
          state: 'waiting',
          password: msg.password || '',
          createdAt: Date.now()
        };
        rooms.set(code, room);
        room.players.push({ id: clientId, name: client.name });
        client.room = code;

        // 邀请链接使用实际访问的 host；Railway 上走 https 域名
        const host = lastReqHeaders && lastReqHeaders.host ? lastReqHeaders.host : `${getLocalIP()}:${PORT}`;
        const fwdProto = lastReqHeaders && lastReqHeaders['x-forwarded-proto'];
        const proto = (fwdProto && /https/i.test(fwdProto)) ? 'https' : 'http';
        const inviteUrl = `${proto}://${host}/?code=${code}`;
        ws.send(JSON.stringify({
          type: 'room_created',
          code,
          inviteUrl,
          room: { code, name: room.name, players: room.players.length, maxPlayers: room.maxPlayers, state: room.state }
        }));
        break;
      }

      // ── 加入房间 ──
      case 'join_room': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms.get(code);
        if (!room) { ws.send(JSON.stringify({ type: 'error', msg: '房间不存在' })); break; }
        if (room.state === 'playing') { ws.send(JSON.stringify({ type: 'error', msg: '游戏进行中，无法加入' })); break; }
        if (room.players.length >= room.maxPlayers) { ws.send(JSON.stringify({ type: 'error', msg: '房间已满' })); break; }
        if (room.password && room.password !== (msg.password || '')) { ws.send(JSON.stringify({ type: 'error', msg: '密码错误' })); break; }

        const displayName = (msg.name || '玩家').toString().slice(0, 16) || '玩家';
        client.name = displayName;

        // 断线重连：同一 id 回原位
        const existing = room.players.find(p => p.id === clientId);
        if (!existing) room.players.push({ id: clientId, name: displayName });
        client.room = code;

        broadcast(code, {
          type: 'player_joined',
          id: clientId,
          name: displayName,
          players: room.players.map(p => ({ id: p.id, name: p.name }))
        });

        ws.send(JSON.stringify({
          type: 'room_joined',
          code,
          room: { code, name: room.name, players: room.players.length, maxPlayers: room.maxPlayers, state: room.state },
          isHost: room.host === clientId,
          players: room.players.map(p => ({ id: p.id, name: p.name }))
        }));
        break;
      }

      // ── 离开房间 ──
      case 'leave_room': {
        const room = rooms.get(client.room);
        if (room) {
          room.players = room.players.filter(p => p.id !== clientId);
          if (room.players.length === 0) {
            rooms.delete(client.room);
          } else if (room.host === clientId) {
            room.host = room.players[0].id;
            broadcast(client.room, { type: 'host_changed', newHost: room.host });
          }
          broadcast(client.room, {
            type: 'player_left',
            id: clientId,
            players: room.players.map(p => ({ id: p.id, name: p.name }))
          });
        }
        client.room = null;
        ws.send(JSON.stringify({ type: 'room_left' }));
        break;
      }

      // ── 开始游戏 ──
      case 'start_game': {
        const room = rooms.get(client.room);
        if (!room) break;
        if (room.host !== clientId) { ws.send(JSON.stringify({ type: 'error', msg: '只有房主能开始游戏' })); break; }
        if (room.state !== 'waiting') break;
        room.state = 'starting';
        broadcast(client.room, { type: 'game_starting', countdown: 5 });
        setTimeout(() => {
          const r = rooms.get(client.room);
          if (r) {
            r.state = 'playing';
            broadcast(client.room, { type: 'game_started' });
          }
        }, 5000);
        break;
      }

      // ── 列出房间 ──
      case 'list_rooms': {
        const list = [];
        rooms.forEach(r => {
          if (r.state === 'waiting') {
            list.push({ code: r.code, name: r.name, players: r.players.length, maxPlayers: r.maxPlayers, locked: !!r.password });
          }
        });
        ws.send(JSON.stringify({ type: 'room_list', rooms: list }));
        break;
      }

      // ── 位置同步 ──
      case 'sync_pos': {
        if (!client.room) break;
        broadcast(client.room, {
          type: 'peer_pos',
          id: clientId,
          name: client.name,
          pos: msg.pos,
          rot: msg.rot,
          role: msg.role,
          team: msg.team
        });
        break;
      }

      // ── 射击同步 ──
      case 'shoot': {
        if (!client.room) break;
        broadcast(client.room, {
          type: 'peer_shoot',
          id: clientId,
          pos: msg.pos,
          dir: msg.dir,
          weapon: msg.weapon
        });
        break;
      }

      // ── 互动/伤害同步 ──
      case 'interact': {
        if (!client.room) break;
        broadcast(client.room, {
          type: 'peer_interact',
          id: clientId,
          action: msg.action,
          target: msg.target
        });
        break;
      }

      // ── 伤害/击杀 ──
      case 'damage': {
        if (!client.room) break;
        broadcast(client.room, {
          type: 'peer_damage',
          from: clientId,
          target: msg.target,
          amount: msg.amount,
          fatal: !!msg.fatal
        });
        break;
      }
    }
  });

  ws.on('close', () => {
    const room = rooms.get(client.room);
    if (room) {
      room.players = room.players.filter(p => p.id !== clientId);
      if (room.players.length === 0) {
        rooms.delete(client.room);
      } else if (room.host === clientId) {
        room.host = room.players[0].id;
        broadcast(client.room, { type: 'host_changed', newHost: room.host });
      }
      broadcast(client.room, {
        type: 'player_left',
        id: clientId,
        players: room.players.map(p => ({ id: p.id, name: p.name }))
      });
    }
    clients.delete(ws);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  SCP:SL Web Edition v0.4.1 (Railway)');
  console.log('  Local:   http://localhost:' + PORT);
  console.log('  LAN:     http://' + getLocalIP() + ':' + PORT);
  console.log('  Press Ctrl+C to stop');
  console.log('');
});
