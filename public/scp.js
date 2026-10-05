// SCP 特殊能力系统

export function updateSCP(player, scene, ais) {
  if (!player) return;

  for (const ai of ais) {
    if (ai.team !== 'scp' || !ai.mesh) continue;
    switch (ai.role) {
      case 'scp_173': scp173(ai, player); break;
      case 'scp_096': scp096(ai, player); break;
      case 'scp_049': scp049(ai, player); break;
      case 'scp_106': scp106(ai, player); break;
      case 'scp_939': scp939(ai, player); break;
    }
  }
}

// SCP-173：不被直视时瞬移，近身秒杀
function scp173(ai, player) {
  const cam = window.__camera;
  if (!cam) return;
  const dx = player.mesh.position.x - ai.mesh.position.x;
  const dz = player.mesh.position.z - ai.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 35) return;

  const fwd = cam.getForwardRay().direction;
  fwd.y = 0; fwd.normalize();
  const toAI = new BABYLON.Vector3(dx, 0, dz);
  if (toAI.lengthSquared() > 0) toAI.normalize();
  const dot = BABYLON.Vector3.Dot(fwd, toAI);

  // 不被直视 + 有视线
  if (dot < 0.3 && dist < 18 && ai.stateTime % 10 === 0) {
    // 瞬移到玩家附近
    const ang = Math.random() * Math.PI * 2;
    ai.mesh.position.x = player.mesh.position.x + Math.sin(ang) * 3;
    ai.mesh.position.z = player.mesh.position.z + Math.cos(ang) * 3;
    ai.blink = 60;
  }

  ai.blink--;
  if (dist < 2.2 && ai.blink <= 0) {
    player.takeDamage(9999);
  }
  if (dist < 2.2) {
    ai.mesh.material.emissiveColor = new BABYLON.Color3(1, 0, 0);
  }
}

// SCP-096：看到脸就暴怒追击并秒杀
function scp096(ai, player) {
  const cam = window.__camera;
  if (!cam) return;
  const dx = player.mesh.position.x - ai.mesh.position.x;
  const dz = player.mesh.position.z - ai.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 40) return;

  const fwd = cam.getForwardRay().direction;
  fwd.y = 0; fwd.normalize();
  const toAI = new BABYLON.Vector3(dx, 0, dz);
  if (toAI.lengthSquared() > 0) toAI.normalize();
  const dot = BABYLON.Vector3.Dot(fwd, toAI);

  if (dot > 0.96 && dist < 30) ai.enraged = true;
  if (ai.enraged) ai.mesh.material.emissiveColor = new BABYLON.Color3(1, 0, 0);

  const speed = ai.enraged ? 0.22 : 0.04;
  if (dist > 2) {
    ai.mesh.position.x += (dx / dist) * speed;
    ai.mesh.position.z += (dz / dist) * speed;
  }
  ai.mesh.rotation.y = Math.atan2(dx, dz);

  if (dist < 2.5 && ai.enraged) player.takeDamage(9999);
}

// SCP-049：近距离触手致死，把人变僵尸
function scp049(ai, player) {
  const dx = player.mesh.position.x - ai.mesh.position.x;
  const dz = player.mesh.position.z - ai.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 30) return;

  if (dist > 2.5) {
    ai.mesh.position.x += (dx / dist) * 0.07;
    ai.mesh.position.z += (dz / dist) * 0.07;
  } else {
    player.takeDamage(25);
    if (player.hp <= 0) {
      // 变僵尸（简单处理：直接死亡）
      player.takeDamage(9999);
    }
  }
  ai.mesh.rotation.y = Math.atan2(dx, dz);
}

// SCP-106：穿墙追击，持续腐蚀扣血
function scp106(ai, player) {
  const dx = player.mesh.position.x - ai.mesh.position.x;
  const dz = player.mesh.position.z - ai.mesh.position.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 32) return;

  // 穿墙：忽略碰撞缓慢逼近
  const step = 0.05;
  ai.mesh.position.x += (dx / dist) * step;
  ai.mesh.position.z += (dz / dist) * step;
  ai.mesh.rotation.y = Math.atan2(dx, dz);

  if (dist < 2.8) player.takeDamage(2);
}

// SCP-939：听声辨位，移动时更易被发现，扑杀
function scp939(ai, player) {
  const dx = player.mesh.position.x - ai.mesh.position.x;
  const dz = player.mesh.position.z - ai.mesh.position.z;
  const dist = Math.hypot(dx, dz);

  // 玩家移动检测（粗略）
  const moving = player.mesh.position.lengthSquared() > 0;
  const senseRange = moving ? 32 : 18;

  if (dist > senseRange) return;

  const speed = moving ? 0.14 : 0.05;
  if (dist > 2.2) {
    ai.mesh.position.x += (dx / dist) * speed;
    ai.mesh.position.z += (dz / dist) * speed;
  }
  ai.mesh.rotation.y = Math.atan2(dx, dz);

  if (dist < 2.5) player.takeDamage(50);
}
