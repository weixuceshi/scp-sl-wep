import { fire, reload as doReload, interact } from './weapons.js';

let keys = {};
let joyActive = false;
let joyVec = { x: 0, y: 0 };
let lookTouchId = null;
let lookLastX = 0;
let lookLastY = 0;

export function initInput(canvas) {
  // ── 键盘 ──
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') doReload();
    if (e.code === 'KeyE') interact();
    if (e.code === 'Escape') {
      if (document.exitPointerLock) document.exitPointerLock();
    }
  });
  window.addEventListener('keyup', e => keys[e.code] = false);

  // ── 鼠标锁定视角 ──
  document.addEventListener('mousemove', e => {
    if (document.pointerLockElement === canvas) {
      const cam = window.__camera;
      if (cam) {
        cam.rotation.y += e.movementX * 0.0022;
        cam.rotation.x = Math.max(-1.5, Math.min(1.5, cam.rotation.x + e.movementY * 0.0022));
      }
    }
  });

  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) fire();
  });

  // ── 键盘移动（60Hz 轮询）──
  setInterval(() => {
    const pl = window.__player;
    if (!pl || pl.dead) return;
    if (document.pointerLockElement !== canvas && !isMobile()) {
      // 未锁定鼠标时仍允许 WASD 移动
    }
    if (keys['KeyW']) pl.moveForward(1);
    if (keys['KeyS']) pl.moveForward(-1);
    if (keys['KeyA']) pl.moveRight(-1);
    if (keys['KeyD']) pl.moveRight(1);
    if (joyActive) {
      if (Math.abs(joyVec.y) > 0.15) pl.moveForward(-joyVec.y);
      if (Math.abs(joyVec.x) > 0.15) pl.moveRight(joyVec.x);
    }
  }, 16);

  // ── 手机摇杆 ──
  const joy = document.getElementById('joystick');
  const knob = document.getElementById('joystick-knob');
  if (joy) {
    joy.addEventListener('pointerdown', e => {
      joyActive = true;
      try { joy.setPointerCapture(e.pointerId); } catch (err) {}
    });
    joy.addEventListener('pointermove', e => {
      if (!joyActive) return;
      const rect = joy.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const max = rect.width / 2 - 12;
      const len = Math.hypot(dx, dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      joyVec.x = dx / max;
      joyVec.y = dy / max;
    });
    const endJoy = () => {
      joyActive = false;
      joyVec.x = 0; joyVec.y = 0;
      knob.style.transform = 'translate(-50%, -50%)';
    };
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);
  }

  // ── 手机视角 ──
  const lookArea = document.getElementById('touch-look');
  if (lookArea) {
    lookArea.addEventListener('pointerdown', e => {
      lookTouchId = e.pointerId;
      lookLastX = e.clientX;
      lookLastY = e.clientY;
      try { lookArea.setPointerCapture(e.pointerId); } catch (err) {}
    });
    lookArea.addEventListener('pointermove', e => {
      if (e.pointerId !== lookTouchId) return;
      const dx = e.clientX - lookLastX;
      const dy = e.clientY - lookLastY;
      lookLastX = e.clientX;
      lookLastY = e.clientY;
      const cam = window.__camera;
      const pl = window.__player;
      if (cam) {
        cam.rotation.y += dx * 0.005;
        cam.rotation.x = Math.max(-1.5, Math.min(1.5, cam.rotation.x + dy * 0.005));
      }
      if (pl) {
        // 触屏视角同时驱动 WASD 前进方向
      }
    });
    const endLook = () => lookTouchId = null;
    lookArea.addEventListener('pointerup', endLook);
    lookArea.addEventListener('pointercancel', endLook);
  }

  // ── 手机按钮 ──
  bindBtn('btn-fire', () => fire());
  bindBtn('btn-reload', () => doReload());
  bindBtn('btn-interact', () => interact());
  bindBtn('btn-jump', () => {
    const pl = window.__player;
    if (pl) pl.jump();
  });

  // ── 双击跳跃（手机）──
  let lastTap = 0;
  if (canvas) {
    canvas.addEventListener('touchend', e => {
      const now = Date.now();
      if (now - lastTap < 300) {
        const pl = window.__player;
        if (pl) pl.jump();
      }
      lastTap = now;
    });
  }
}

function bindBtn(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('pointerdown', e => { e.preventDefault(); fn(); });
}

export function isMobile() {
  return matchMedia('(pointer:coarse)').matches;
}
