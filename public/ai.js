const ais = [];
let aiTick = 0;

export function spawnAI(scene, count) {
  const ROLE_POOL = [
    { role: 'd_class', name: 'D 级人员', team: 'chaos', color: new BABYLON.Color3(0.6, 0.6, 0.6), hp: 100 },
    { role: 'scientist', name: '科学家', team: 'ntf', color: new BABYLON.Color3(0.4, 0.8, 0.5), hp: 100 },
    { role: 'facility_guard', name: '设施保安', team: 'ntf', color: new BABYLON.Color3(0.2, 0.5, 0.9), hp: 100 },
    { role: 'chaos_marauder', name: '混沌掠夺者', team: 'chaos', color: new BABYLON.Color3(0.8, 0.5, 0.1), hp: 100 },
    { role: 'scp_173', name: 'SCP-173', team: 'scp', color: new BABYLON.Color3(0.85, 0.8, 0.7), hp: 1200 },
    { role: 'scp_096', name: 'SCP-096', team: 'scp', color: new BABYLON.Color3(0.95, 0.95, 0.95), hp: 1200 },
    { role: 'scp_049', name: 'SCP-049', team: 'scp', color: new BABYLON.Color3(0.35, 0.4, 0.55), hp: 1200 },
    { role: 'scp_939', name: 'SCP-939', team: 'scp', color: new BABYLON.Color3(0.6, 0.15, 0.15), hp: 1200 }
  ];

  for (let i = 0; i < count; i++) {
    const def = ROLE_POOL[Math.floor(Math.random() * ROLE_POOL.length)];
    // 随机位置（避开中心出生点）
    let x, z, tries = 0;
    do {
      x = (Math.random() - 0.5) * 100;
      z = (Math.random() - 0.5) * 100;
      tries++;
    } while (Math.hypot(x, z) < 8 && tries < 10);

    const mesh = BABYLON.MeshBuilder.CreateBox('ai', { width: 1, height: 1.8, depth: 1 }, scene);
    mesh.position = new BABYLON.Vector3(x, 0.9, z);
    mesh.checkCollisions = true;

    const mat = new BABYLON.StandardMaterial('aim_' + i, scene);
    mat.diffuseColor = def.color;
    mat.emissiveColor = def.color.scale(0.12);
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    mesh.material = mat;

    // 头顶标记
    const head = BABYLON.MeshBuilder.CreateBox('aihead_' + i, { width: 0.9, height: 0.3, depth: 0.9 }, scene);
    head.parent = mesh;
    head.position.y = 1.05;
    const headMat = new BABYLON.StandardMaterial('aihm_' + i, scene);
    headMat.diffuseColor = def.team === 'scp' ? new BABYLON.Color3(0.9, 0, 0)
      : def.team === 'ntf' ? new BABYLON.Color3(0.2, 0.6, 1)
      : new BABYLON.Color3(1, 0.6, 0.1);
    head.material = headMat;

    const ai = {
      mesh,
      head,
      role: def.role,
      roleName: def.name,
      team: def.team,
      hp: def.hp,
      maxHp: def.hp,
      state: 'idle',
      stateTime: 0,
      target: null,
      blink: 0,
      enraged: false,
      speed: def.team === 'scp' ? 0.08 : 0.05
    };
    ais.push(ai);
  }

  window.__getAIByMesh = (mesh) => ais.find(a => a.mesh === mesh);
  window.__removeAI = (ai) => {
    const idx = ais.indexOf(ai);
    if (idx >= 0) {
      try { ai.head.dispose(); } catch (e) {}
      ais.splice(idx, 1);
    }
  };
  window.__ais = ais;

  console.log('[AI] 已生成 ' + count + ' 个单位');
  return ais;
}

export function getAIs() { return ais; }

export function updateAI(player, scene) {
  aiTick++;
  if (!player) return;

  for (const ai of ais) {
    if (!ai.mesh) continue;
    ai.stateTime++;

    const dx = player.mesh.position.x - ai.mesh.position.x;
    const dz = player.mesh.position.z - ai.mesh.position.z;
    const dist = Math.hypot(dx, dz);

    // SCP 有自己的逻辑，跳过通用 AI
    if (ai.team === 'scp') continue;

    // 找目标
    if (!ai.target || ai.target.dead) {
      ai.target = findEnemy(ai);
    }

    if (ai.target && !ai.target.dead) {
      const tdx = ai.target.mesh.position.x - ai.mesh.position.x;
      const tdz = ai.target.mesh.position.z - ai.mesh.position.z;
      const tdist = Math.hypot(tdx, tdz);
      if (tdist > 2.2) {
        ai.mesh.position.x += (tdx / tdist) * ai.speed;
        ai.mesh.position.z += (tdz / tdist) * ai.speed;
      }
      ai.mesh.rotation.y = Math.atan2(tdx, tdz);
      // 简单开火
      if (tdist < 20 && ai.stateTime % 40 === 0) {
        ai.target.takeDamage && ai.target.takeDamage(4);
      }
    } else {
      // 随机巡逻
      if (ai.stateTime % 120 === 0) {
        ai.wanderAng = Math.random() * Math.PI * 2;
      }
      if (ai.wanderAng !== undefined) {
        ai.mesh.position.x += Math.sin(ai.wanderAng) * 0.03;
        ai.mesh.position.z += Math.cos(ai.wanderAng) * 0.03;
      }
    }
  }
}

function findEnemy(ai) {
  let best = null, bestD = 30;
  for (const other of ais) {
    if (other === ai || other.dead) continue;
    if (other.team === ai.team) continue;
    const d = Math.hypot(other.mesh.position.x - ai.mesh.position.x, other.mesh.position.z - ai.mesh.position.z);
    if (d < bestD) { bestD = d; best = other; }
  }
  // 玩家也是目标
  const pd = Math.hypot(window.__player.mesh.position.x - ai.mesh.position.x, window.__player.mesh.position.z - ai.mesh.position.z);
  if (pd < bestD && window.__player.team !== ai.team && !window.__player.dead) {
    return { mesh: window.__player.mesh, dead: false, takeDamage: (a) => window.__player.takeDamage(a) };
  }
  return best;
}
