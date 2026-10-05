import * as Room from './room.js';
import { ann } from './ui.js';

export function fire() {
  const pl = window.__player;
  if (!pl || pl.dead) return;
  if (!pl.weapon) {
    // 徒手：近战
    melee();
    return;
  }

  const W = window.__WEAPONS;
  const w = W[pl.weapon];
  if (!w) return;

  const now = Date.now();
  if (pl.fireCD && pl.fireCD > now) return;
  pl.fireCD = now + w.rate;

  if (pl.ammo <= 0) { doReload(); return; }
  pl.ammo--;

  // 枪口闪光
  spawnMuzzle();

  // 射线检测
  const scene = window.__scene ? window.__scene.value : null;
  const cam = window.__camera;
  if (scene && cam) {
    const ray = cam.getForwardRay(w.range || 50);
    const hit = scene.pickWithRay(ray, m => m.name === 'ai' || (m.name && m.name.startsWith('peer_')));

    if (hit && hit.pickedMesh) {
      const name = hit.pickedMesh.name;
      if (name === 'ai') {
        // AI 单位
        const ai = window.__getAIByMesh && window.__getAIByMesh(hit.pickedMesh);
        if (ai) {
          ai.hp -= w.dmg;
          // 受击反馈
          flashAI(ai);
          if (ai.hp <= 0) {
            hit.pickedMesh.dispose();
            if (window.__removeAI) window.__removeAI(ai);
            ann('击杀 ' + (ai.roleName || '目标'));
          }
        }
      } else if (name.startsWith('peer_')) {
        // 多人：通知服务器
        const id = name.replace('peer_', '');
        Room.syncDamage(id, w.dmg, false);
      }
    }
  }

  // 多人同步射击
  if (window.__mode === 'multi') {
    const pos = cam.position.clone();
    const dir = cam.getForwardRay().direction.clone();
    Room.syncShoot(
      { x: pos.x, y: pos.y, z: pos.z },
      { x: dir.x, y: dir.y, z: dir.z },
      pl.weapon
    );
  }

  // 后坐力
  cam.rotation.x += 0.01;
}

function melee() {
  const pl = window.__player;
  const scene = window.__scene ? window.__scene.value : null;
  const cam = window.__camera;
  if (!scene || !cam) return;
  const ray = cam.getForwardRay(2.5);
  const hit = scene.pickWithRay(ray, m => m.name === 'ai');
  if (hit && hit.pickedMesh && window.__getAIByMesh) {
    const ai = window.__getAIByMesh(hit.pickedMesh);
    if (ai) {
      ai.hp -= 40;
      if (ai.hp <= 0) {
        hit.pickedMesh.dispose();
        if (window.__removeAI) window.__removeAI(ai);
        ann('近战击杀');
      }
    }
  }
}

function spawnMuzzle() {
  const scene = window.__scene ? window.__scene.value : null;
  const cam = window.__camera;
  if (!scene || !cam) return;
  const flash = BABYLON.MeshBuilder.CreateSphere('muzzle', { diameter: 0.22 }, scene);
  const fwd = cam.getForwardRay(1.6).direction;
  flash.position = cam.position.add(fwd.scale(1.4));
  const mat = new BABYLON.StandardMaterial('mzm', scene);
  mat.emissiveColor = new BABYLON.Color3(1, 0.75, 0.25);
  mat.disableLighting = true;
  flash.material = mat;
  setTimeout(() => { try { flash.dispose(); } catch (e) {} }, 55);
}

function flashAI(ai) {
  if (!ai.mesh || !ai.mesh.material) return;
  const orig = ai.mesh.material.emissiveColor;
  ai.mesh.material.emissiveColor = new BABYLON.Color3(0.8, 0.8, 0.8);
  setTimeout(() => {
    if (ai.mesh && ai.mesh.material) ai.mesh.material.emissiveColor = orig;
  }, 60);
}

export function doReload() {
  const pl = window.__player;
  if (!pl || pl.dead || !pl.weapon) return;
  const W = window.__WEAPONS;
  const w = W[pl.weapon];
  if (!w) return;
  if (pl.ammo >= w.mag || pl.reserve <= 0) return;
  const need = w.mag - pl.ammo;
  const take = Math.min(need, pl.reserve);
  pl.ammo += take;
  pl.reserve -= take;
  ann('换弹完成');
}

export function interact() {
  ann('交互（门禁系统开发中）');
}
