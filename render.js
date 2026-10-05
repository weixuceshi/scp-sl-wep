import { updateAI, spawnAI, getAIs } from './ai.js';
import { updateSCP } from './scp.js';
import { updateHUD, ann, showSpectate, hideSpectate } from './ui.js';
import * as Room from './room.js';

let engine, scene, camera, canvas;
let player = null;
let gameMode = 'single';
let gameRunning = false;
let lastSync = 0;

// 让 room.js 能拿到场景引用
window.__scene = { value: null };

export function initRender(eng, cv) {
  engine = eng;
  canvas = cv;
  scene = createScene();
  window.__scene.value = scene;

  camera = new BABYLON.UniversalCamera('cam', new BABYLON.Vector3(0, 1.7, 0), scene);
  camera.fov = 1.2;
  camera.minZ = 0.05;
  camera.speed = 0.2;
  camera.angularSensibility = 1500;
  camera.inertia = 0.6;
  camera.checkCollisions = true;
  camera.applyGravity = true;
  camera.ellipsoid = new BABYLON.Vector3(0.5, 0.85, 0.5);

  scene.collisionsEnabled = true;
  scene.gravity = new BABYLON.Vector3(0, -0.5, 0);

  window.__camera = camera;

  engine.runRenderLoop(() => {
    if (gameRunning) tick();
    scene.render();
  });
  window.addEventListener('resize', () => engine.resize());
}

function createScene() {
  const s = new BABYLON.Scene(engine);
  s.clearColor = new BABYLON.Color4(0.025, 0.025, 0.04, 1);
  s.ambientColor = new BABYLON.Color3(0.15, 0.15, 0.2);

  // 灯光
  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0, 1, 0), s);
  hemi.intensity = 0.35;
  hemi.groundColor = new BABYLON.Color3(0.08, 0.08, 0.12);

  const spot = new BABYLON.PointLight('spot', new BABYLON.Vector3(0, 6, 0), s);
  spot.diffuse = new BABYLON.Color3(1, 0.92, 0.78);
  spot.intensity = 0.7;
  spot.range = 40;

  // 地面
  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 200, height: 200 }, s);
  const groundMat = new BABYLON.StandardMaterial('gm', s);
  groundMat.diffuseColor = new BABYLON.Color3(0.13, 0.13, 0.16);
  groundMat.specularColor = new BABYLON.Color3(0, 0, 0);
  ground.material = groundMat;
  ground.checkCollisions = true;

  // 网格线（增加空间感）
  const gridMat = new BABYLON.StandardMaterial('grid', s);
  gridMat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.15);

  // 外围围墙
  const wallH = 4;
  const wallMat = new BABYLON.StandardMaterial('wm', s);
  wallMat.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.24);
  wallMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);

  const walls = [
    { p: [0, wallH / 2, -60], s: [120, wallH, 2] },
    { p: [0, wallH / 2, 60], s: [120, wallH, 2] },
    { p: [-60, wallH / 2, 0], s: [2, wallH, 120] },
    { p: [60, wallH / 2, 0], s: [2, wallH, 120] }
  ];
  walls.forEach((w, i) => {
    const box = BABYLON.MeshBuilder.CreateBox('wall' + i, { width: w.s[0], height: w.s[1], depth: w.s[2] }, s);
    box.position = new BABYLON.Vector3(w.p[0], w.p[1], w.p[2]);
    box.material = wallMat;
    box.checkCollisions = true;
  });

  // 内部隔间（模拟收容区）
  const innerMat = new BABYLON.StandardMaterial('im', s);
  innerMat.diffuseColor = new BABYLON.Color3(0.25, 0.22, 0.2);
  innerMat.emissiveColor = new BABYLON.Color3(0.02, 0.02, 0.03);
  const cells = [
    { p: [-20, 2, -20], s: [16, 4, 2] },
    { p: [-20, 2, -10], s: [2, 4, 20] },
    { p: [20, 2, 20], s: [16, 4, 2] },
    { p: [20, 2, 10], s: [2, 4, 20] },
    { p: [0, 2, 0], s: [2, 4, 30] },
    { p: [-10, 2, 15], s: [20, 4, 2] },
    { p: [10, 2, -15], s: [20, 4, 2] }
  ];
  cells.forEach((c, i) => {
    const box = BABYLON.MeshBuilder.CreateBox('cell' + i, { width: c.s[0], height: c.s[1], depth: c.s[2] }, s);
    box.position = new BABYLON.Vector3(c.p[0], c.p[1], c.p[2]);
    box.material = innerMat;
    box.checkCollisions = true;
  });

  // 雾
  s.fogMode = BABYLON.Scene.FOGMODE_EXP2;
  s.fogColor = new BABYLON.Color3(0.025, 0.025, 0.04);
  s.fogDensity = 0.035;

  return s;
}

export function startGame(opts) {
  return new Promise((resolve) => {
    gameMode = opts.mode;
    gameRunning = true;
    canvas.classList.remove('hidden');
    document.getElementById('spectate').classList.add('hidden');

    // 创建玩家
    player = createPlayer(opts.role, opts.team || teamOfRole(opts.role));

    // 单人模式生成 AI
    if (gameMode === 'single') {
      spawnAI(scene, 16);
    }

    // 设置角色显示
    const roleDef = getRoleDef(opts.role);
    document.getElementById('role-display').textContent = roleDef ? roleDef.name : opts.role;
    document.getElementById('card-display').textContent = roleDef && roleDef.card > 0 ? `门卡 Lv.${roleDef.card}` : '';

    // 桌面端点击锁定指针
    if (!matchMedia('(pointer:coarse)').matches) {
      canvas.addEventListener('click', () => {
        if (!gameRunning) return;
        canvas.requestPointerLock();
      });
    }

    resolve();
  });
}

function teamOfRole(role) {
  if (role && role.startsWith('scp')) return 'scp';
  if (role && role.startsWith('chaos')) return 'chaos';
  if (role === 'd_class') return 'chaos';
  return 'ntf';
}

function getRoleDef(role) {
  const all = [
    ...ROLES.ntf, ...ROLES.chaos, ...ROLES.scp
  ];
  return all.find(r => r.id === role);
}

const ROLES = {
  ntf: [
    { id: 'ntf_private', name: 'NTF 列兵', weapon: 'hk416', hp: 100, card: 2 },
    { id: 'ntf_sergeant', name: 'NTF 中士', weapon: 'hk416', hp: 100, card: 3 },
    { id: 'facility_guard', name: '设施保安', weapon: 'mp7', hp: 100, card: 2 }
  ],
  chaos: [
    { id: 'chaos_marauder', name: '混沌掠夺者', weapon: 'ak12', hp: 100, card: 2 },
    { id: 'chaos_rep', name: '混沌游击兵', weapon: 'ak12', hp: 100, card: 1 },
    { id: 'd_class', name: 'D 级人员', weapon: null, hp: 100, card: 1 }
  ],
  scp: [
    { id: 'scp_173', name: 'SCP-173 雕像', weapon: null, hp: 1200, card: 0 },
    { id: 'scp_096', name: 'SCP-096 害羞的人', weapon: null, hp: 1200, card: 0 },
    { id: 'scp_049', name: 'SCP-049 瘟疫医生', weapon: null, hp: 1200, card: 0 },
    { id: 'scp_106', name: 'SCP-106 老男人', weapon: null, hp: 1200, card: 0 },
    { id: 'scp_939', name: 'SCP-939 多声之兽', weapon: null, hp: 1200, card: 0 }
  ]
};

function createPlayer(role, team) {
  const def = getRoleDef(role) || { weapon: null, hp: 100, card: 1, name: role };
  const isSCP = team === 'scp';

  // 玩家不可见本体（第一人称）
  const mesh = BABYLON.MeshBuilder.CreateCapsule('player', { radius: 0.4, height: 1.7 }, scene);
  mesh.position = new BABYLON.Vector3(0, 0.85, 0);
  mesh.checkCollisions = true;
  mesh.isVisible = false; // 第一人称不显示自己

  camera.parent = mesh;
  camera.position = new BABYLON.Vector3(0, 0.5, 0);
  camera.rotation = new BABYLON.Vector3(0, 0, 0);

  const p = {
    mesh,
    camera,
    role,
    roleName: def.name,
    team,
    hp: def.hp,
    maxHp: def.hp,
    weapon: def.weapon,
    ammo: def.weapon ? WEAPONS[def.weapon].mag : 0,
    reserve: def.weapon ? WEAPONS[def.weapon].res : 0,
    card: def.card,
    isSCP,
    vy: 0,
    onGround: true,
    fireCD: 0,
    moveForward(v) {
      const fwd = camera.getForwardRay().direction;
      fwd.y = 0; fwd.normalize();
      mesh.moveWithCollisions(fwd.scale(v * 0.18));
    },
    moveRight(v) {
      const fwd = camera.getForwardRay().direction;
      const right = BABYLON.Vector3.Cross(fwd, BABYLON.Vector3.Up());
      right.y = 0; right.normalize();
      mesh.moveWithCollisions(right.scale(v * 0.18));
    },
    jump() {
      if (this.onGround) { this.vy = 0.18; this.onGround = false; }
    },
    takeDamage(amt) {
      this.hp -= amt;
      if (this.hp <= 0 && !this.dead) {
        this.dead = true;
        onPlayerDeath();
      }
    }
  };

  window.__player = p;
  window.__mode = gameMode;
  return p;
}

const WEAPONS = {
  mp7:   { mag: 30, res: 120, dmg: 12, rate: 100, spread: 0.02, name: 'MP7', range: 50 },
  ak12:  { mag: 30, res: 90,  dmg: 20, rate: 120, spread: 0.04, name: 'AK-12', range: 60 },
  hk416: { mag: 30, res: 90,  dmg: 18, rate: 90,  spread: 0.02, name: 'HK416', range: 55 }
};

// 暴露给 weapons.js 使用
window.__WEAPONS = WEAPONS;

function onPlayerDeath() {
  gameRunning = false;
  showSpectate('你已阵亡，正在观战中… 等待支援或回合结束');
  ann('你已阵亡');
}

function tick() {
  if (!player) return;

  // 重力
  player.vy -= 0.012;
  player.mesh.moveWithCollisions(new BABYLON.Vector3(0, player.vy, 0));
  if (player.mesh.position.y <= 0.85) {
    player.mesh.position.y = 0.85;
    player.vy = 0;
    player.onGround = true;
  }

  // HUD
  updateHUD({
    hp: player.hp,
    maxHp: player.maxHp,
    ammo: player.ammo,
    reserve: player.reserve,
    weapon: player.weapon,
    roleName: player.roleName,
    card: player.card
  });

  // AI 更新
  updateAI(player, scene);

  // SCP 能力更新
  updateSCP(player, scene, getAIs());

  // 多人位置同步（5Hz）
  const now = Date.now();
  if (gameMode === 'multi' && now - lastSync > 200) {
    lastSync = now;
    Room.syncPosition(
      { x: player.mesh.position.x, y: player.mesh.position.y, z: player.mesh.position.z },
      { x: camera.rotation.x, y: camera.rotation.y },
      player.role,
      player.team
    );
  }
}

export function getCamera() { return camera; }
export function getScene() { return scene; }
export function getMode() { return gameMode; }
export function getPlayer() { return player; }
export { WEAPONS };
