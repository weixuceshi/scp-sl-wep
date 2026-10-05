import * as Room from './room.js';
import { getSelectedRole, getSelectedTeam } from './main.js';

// 暴露给 room.js 读取当前选择
window.__selectedRole = null;
window.__selectedTeam = null;

export function initUI() {
  // 离开房间
  const leaveBtn = document.getElementById('btn-leave-room');
  if (leaveBtn) leaveBtn.addEventListener('click', () => Room.leaveRoom());

  // 开始游戏
  const startBtn = document.getElementById('btn-start-game');
  if (startBtn) startBtn.addEventListener('click', () => Room.startMultiGame());

  // 复制房间码
  const copyCode = document.getElementById('btn-copy-code');
  if (copyCode) copyCode.addEventListener('click', () => {
    const code = document.getElementById('display-code').textContent;
    copyText(code, '房间码已复制');
  });

  // 复制邀请链接
  const copyInvite = document.getElementById('btn-copy-invite');
  if (copyInvite) copyInvite.addEventListener('click', () => {
    const url = document.getElementById('display-invite-url').value;
    copyText(url, '邀请链接已复制');
  });

  // 同步角色选择到全局
  setInterval(() => {
    window.__selectedRole = getSelectedRole();
    window.__selectedTeam = getSelectedTeam();
  }, 200);
}

function copyText(text, tip) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => ann(tip)).catch(() => fallbackCopy(text, tip));
  } else {
    fallbackCopy(text, tip);
  }
}

function fallbackCopy(text, tip) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); ann(tip); }
  catch (e) { ann('复制失败，请手动长按选中'); }
  document.body.removeChild(ta);
}

export function ann(text, duration) {
  const container = document.getElementById('announcements');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'ann-item';
  div.textContent = text;
  container.appendChild(div);
  setTimeout(() => div.remove(), duration || 3000);
}

// HUD 更新
export function updateHUD(state) {
  const hpFill = document.getElementById('hp-fill');
  if (hpFill) {
    const pct = Math.max(0, Math.min(100, state.hp / state.maxHp * 100));
    hpFill.style.width = pct + '%';
    hpFill.style.background = pct > 50 ? 'linear-gradient(90deg,#0a0,#4f4)'
      : pct > 25 ? 'linear-gradient(90deg,#aa0,#ff4)' : 'linear-gradient(90deg,#a00,#f44)';
  }
  const hpText = document.getElementById('hp-text');
  if (hpText) hpText.textContent = Math.max(0, Math.ceil(state.hp));

  const ammo = document.getElementById('ammo-display');
  if (ammo) {
    if (state.weapon) ammo.textContent = `${state.ammo} / ${state.reserve}`;
    else ammo.textContent = '徒手';
  }

  const roleEl = document.getElementById('role-display');
  if (roleEl) roleEl.textContent = state.roleName || '';

  const cardEl = document.getElementById('card-display');
  if (cardEl) cardEl.textContent = state.card > 0 ? `门卡 Lv.${state.card}` : '';
}

export function showSpectate(text) {
  const el = document.getElementById('spectate');
  if (el) el.classList.remove('hidden');
  const t = document.getElementById('spec-text');
  if (t) t.textContent = text || '正在观战中…';
  const canvas = document.getElementById('renderCanvas');
  if (canvas) canvas.classList.add('hidden');
  if (document.exitPointerLock) document.exitPointerLock();
}

export function hideSpectate() {
  const el = document.getElementById('spectate');
  if (el) el.classList.add('hidden');
  const canvas = document.getElementById('renderCanvas');
  if (canvas) canvas.classList.remove('hidden');
}
