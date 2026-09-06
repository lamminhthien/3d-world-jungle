import * as THREE from 'three';
import { isBuildableSurface, sampleFootprint, SURFACES } from '../world/procedural.js';

const VILLAGE_HALF_X = 21;
const VILLAGE_HALF_Z = 19;
const VILLAGE_CORE_HALF_X = 12;
const VILLAGE_CORE_HALF_Z = 10;
const VILLAGE_MAX_SLOPE = 0.55;

const NPCS = [
  { id: 'merchant', name: 'Mai · Người bán hàng', color: 0xc47a3c, text: 'Chào bạn! Mình đang chuẩn bị cửa hàng nhỏ cho làng. Hãy mang thêm tài nguyên về nhé.', route: [[-8, 1], [-3, 1], [-3, 6]] },
  { id: 'gardener', name: 'Linh · Người trồng cây', color: 0x5d9b55, text: 'Ruộng là nguồn sống của làng. Bạn có thể giúp mình chăm những luống cây không?', route: [[-8, -6], [-2, -6], [-2, -2], [-8, -2]] },
  { id: 'fisher', name: 'Bình · Ngư dân', color: 0x4c83ad, text: 'Mình thường đi dọc con đường phía đông để kiểm tra bờ sông.', route: [[5, -1], [10, -1], [10, 5], [5, 5]] },
  { id: 'farmer', name: 'An · Nông dân', color: 0x8a6b3f, text: 'Mùa này ruộng được mùa! Cứ tự nhiên đi quanh làng nhé.', route: [[-9, -8], [-4, -8], [-4, -4], [-9, -4]] },
  { id: 'child', name: 'Na · Trẻ trong làng', color: 0xd15f88, text: 'Mình thích chạy chơi trên con đường làng!', route: [[-1, 0], [3, 0], [3, 4], [-1, 4]] },
  { id: 'elder', name: 'Ông Tư · Trưởng làng', color: 0x7560a3, text: 'Làng cần một nơi bình yên cho mọi người. Cảm ơn bạn đã ghé thăm.', route: [[5, 6], [15, 6], [15, 12], [5, 12]] },
  { id: 'baker', name: 'Hà · Thợ làm bánh', color: 0xb56b47, text: 'Bánh mì nóng đây! Mùi lúa từ ruộng làm cả làng vui hơn.', route: [[-14, 5], [-10, 5], [-10, 9], [-14, 9]] },
  { id: 'woodworker', name: 'Sơn · Thợ mộc', color: 0x587c68, text: 'Mình sửa hàng rào và làm đồ gỗ cho mọi nhà.', route: [[12, -8], [17, -8], [17, -3], [12, -3]] },
  { id: 'herbalist', name: 'Vy · Người chữa bệnh', color: 0x9c5c88, text: 'Ruộng sạch và đường làng thông thoáng giúp mọi người khỏe mạnh.', route: [[-14, -2], [-10, -2], [-10, 2], [-14, 2]] },
  { id: 'trader', name: 'Khoa · Người giao hàng', color: 0x667f9d, text: 'Mình đem hàng từ ngoài rừng vào qua cổng phía nam.', route: [[-3, -16], [3, -16], [3, -12], [-3, -12]] },
];

const mat = (color) => new THREE.MeshLambertMaterial({ color });

function makePerson(color) {
  const group = new THREE.Group();
  const skin = mat(0xffd8a8);
  const shirt = mat(color);
  const pants = mat(0x4d78b5);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.85, 7), shirt);
  body.position.y = 1.15;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), skin);
  head.position.y = 1.95;
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.35, 8), mat(0xe9c46a));
  hat.position.y = 2.28;
  const mkLimb = (w, h, material, x, y) => {
    const limb = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), material);
    limb.geometry.translate(0, -h / 2, 0);
    limb.position.set(x, y, 0);
    return limb;
  };
  const parts = {
    legL: mkLimb(0.2, 0.75, pants, -0.16, 0.75),
    legR: mkLimb(0.2, 0.75, pants, 0.16, 0.75),
    armL: mkLimb(0.16, 0.65, shirt, -0.5, 1.5),
    armR: mkLimb(0.16, 0.65, shirt, 0.5, 1.5),
  };
  group.add(body, head, hat, parts.legL, parts.legR, parts.armL, parts.armR);
  group.userData.parts = parts;
  return group;
}

function makeHouse(color, roofColor) {
  const group = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.6), mat(color));
  wall.position.y = 0.9;
  group.add(wall);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.85, 0.06), mat(0x70452c));
  door.position.set(0, 0.43, 1.33);
  group.add(door);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.35, 1.35, 4), mat(roofColor));
  roof.position.y = 2.42;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  return group;
}

function makeFence(length, horizontal = true) {
  const group = new THREE.Group();
  const posts = Math.max(2, Math.floor(length / 2.5));
  for (let i = 0; i <= posts; i++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.05, 6), mat(0x70452c));
    const p = -length / 2 + (length * i) / posts;
    post.position.set(horizontal ? p : 0, 0.52, horizontal ? 0 : p);
    group.add(post);
  }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? length : 0.12, 0.13, horizontal ? 0.12 : length), mat(0x9a673c));
  rail.position.y = 0.7;
  group.add(rail);
  return group;
}

function makeBoard() {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.7, 0.18), mat(0x70452c));
  post.position.y = 0.85;
  group.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.85, 0.12), mat(0xd7a861));
  board.position.y = 1.45;
  group.add(board);
  return group;
}

function makeFarm() {
  const group = new THREE.Group();
  for (let row = 0; row < 3; row++) {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.08, 0.7), mat(0x8b5a35));
    bed.position.set(0, 0.04, row * 1.35);
    group.add(bed);
    for (let i = 0; i < 5; i++) {
      const crop = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 5), mat(0x6fae42));
      crop.position.set(-2 + i, 0.3, row * 1.35);
      group.add(crop);
    }
  }
  return group;
}

function makePath(width, length, horizontal = true) {
  const path = new THREE.Mesh(new THREE.BoxGeometry(horizontal ? length : width, 0.035, horizontal ? width : length), mat(0xc69a62));
  path.position.y = 0.025;
  return path;
}

function makeCandle() {
  const group = new THREE.Group();
  const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.42, 7), mat(0xffe8b0));
  wax.position.y = 0.25;
  const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.08, 8), mat(0x6d4936));
  holder.position.y = 0.05;
  const flame = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 7, 5),
    new THREE.MeshBasicMaterial({ color: 0xffb52e, transparent: true, opacity: 0.95 }),
  );
  flame.scale.set(0.72, 1.45, 0.72);
  flame.position.y = 0.58;
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0xffa52f, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  glow.position.y = 0.58;
  const light = new THREE.PointLight(0xffa43a, 0, 4.5, 2);
  light.position.y = 0.58;
  group.add(holder, wax, flame, glow, light);
  return { group, flame, glow, light, phase: Math.random() * Math.PI * 2 };
}

function makeVillageCandles() {
  const group = new THREE.Group();
  // Clustered around the central paths, board and entrances so the village
  // reads as warm and inhabited from the isometric camera.
  const offsets = [
    [-3.4, 1.0], [3.4, 1.0], [-3.4, 5.1], [3.4, 5.1],
    [-5.0, -3.5], [5.0, -3.5], [-3.0, -15.8], [3.0, -15.8],
  ];
  const candles = offsets.map(([x, z]) => {
    const candle = makeCandle();
    candle.group.position.set(x, 0, z);
    group.add(candle.group);
    return candle;
  });
  group.userData.candles = candles;
  return group;
}

function makeVillagePad() {
  // Geometry is offset down so its top face lands exactly at the validated
  // hubY. It masks terrain steps beneath the settlement without changing the
  // procedural terrain or adding another terrain draw call.
  const pad = new THREE.Mesh(new THREE.BoxGeometry(VILLAGE_HALF_X * 2, 0.12, VILLAGE_HALF_Z * 2), mat(0xb88a55));
  pad.position.y = -0.06;
  return pad;
}

export function createVillage(scene, spawn) {
  const root = new THREE.Group();
  root.name = 'village-hub';
  scene.add(root);
  let currentHub = { x: spawn.x + 16, z: spawn.z + 14 };
  let hubY = 0;
  const features = [];
  const houseColliders = [];
  const addFeature = (object, offset) => { features.push({ object, offset }); root.add(object); };

  // Houses are deliberately a little larger than the visible walls so the
  // player's 0.45u body radius cannot clip through corners or the doorway.
  const HOUSE_HALF_X = 1.72;
  const HOUSE_HALF_Z = 1.42;

  function findVillageHub(nextSpawn) {
    const baseX = nextSpawn.x + 16;
    const baseZ = nextSpawn.z + 14;
    let best = null;
    // Search a deterministic raster around the intended hub. The core must
    // be soil and reasonably level; the outer footprint is covered by a
    // shallow village pad so houses cannot straddle exposed rock steps.
    for (let ring = 0; ring <= 30; ring += 2) {
      for (let dx = -ring; dx <= ring; dx += 2) {
        for (let dz = -ring; dz <= ring; dz += 2) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
          const x = baseX + dx;
          const z = baseZ + dz;
          const core = sampleFootprint(x, z, VILLAGE_CORE_HALF_X, VILLAGE_CORE_HALF_Z);
          const footprint = sampleFootprint(x, z, VILLAGE_HALF_X, VILLAGE_HALF_Z);
          const onlyBuildable = [...core.surfaces].every(isBuildableSurface);
          if (!onlyBuildable || core.deltaY > VILLAGE_MAX_SLOPE || footprint.surfaces.has(SURFACES.WATER)) continue;
          const distance = Math.abs(dx) + Math.abs(dz);
          if (!best || distance < best.distance) {
            best = { x, z, y: footprint.maxY + 0.06, distance };
          }
        }
      }
      if (best) break;
    }
    if (best) return best;
    // Keep a deterministic fallback if a seed has no large flat clearing.
    const fallback = sampleFootprint(baseX, baseZ, VILLAGE_HALF_X, VILLAGE_HALF_Z);
    return { x: baseX, z: baseZ, y: fallback.maxY + 0.06, distance: Infinity };
  }

  const houseColors = [[0xe6c28f, 0x9a513d], [0xd9b47e, 0x4e7753], [0xe2b989, 0x6e5948], [0xcfae7e, 0x76533c], [0xe8c99b, 0x7b4d56]];
  const houseLayout = [[-16, 12], [-8, 12], [0, 12], [8, 12], [16, 12], [-16, 3], [16, 3], [-16, -7], [16, -7], [0, 8]];
  addFeature(makeVillagePad(), [0, 0]);
  houseLayout.forEach((offset, index) => {
    const colors = houseColors[index % houseColors.length];
    addFeature(makeHouse(colors[0], colors[1]), offset);
  });
  addFeature(makeFarm(), [-9, -12]);
  addFeature(makeFarm(), [9, -12]);
  addFeature(makePath(2.4, 42, false), [0, 0]);
  addFeature(makePath(1.7, 34), [0, 5]);
  addFeature(makePath(1.5, 28), [0, -8]);
  addFeature(makePath(1.3, 22, false), [-9, -4]);
  addFeature(makePath(1.3, 22, false), [9, -4]);
  addFeature(makeBoard(), [3, 3]);
  const villageCandles = makeVillageCandles();
  addFeature(villageCandles, [0, 0]);

  // Fence with an open gate at the south entrance.
  addFeature(makeFence(19), [-12.5, -19]);
  addFeature(makeFence(19), [12.5, -19]);
  addFeature(makeFence(50), [0, 19]);
  addFeature(makeFence(38, false), [-21, 0]);
  addFeature(makeFence(14, false), [21, -12]);
  addFeature(makeFence(14, false), [21, 12]);
  const gate = new THREE.Group();
  [-1.5, 1.5].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.7, 6), mat(0x5d3a26));
    post.position.set(x, 0.85, 0);
    gate.add(post);
  });
  addFeature(gate, [0, -19]);
  const camp = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 12), mat(0x9b6b35));
  addFeature(camp, [0, 2]);

  const npcs = NPCS.map((data, index) => ({ ...data, object: makePerson(data.color), routeIndex: 0, routeTime: index * 0.65 }));
  npcs.forEach((npc) => root.add(npc.object));
  const promptEl = document.getElementById('adventure-prompt');
  const dialogueEl = document.getElementById('village-dialogue');
  const speakerEl = document.getElementById('village-speaker');
  const textEl = document.getElementById('village-dialogue-text');
  const nearest = { value: null };
  let boardPosition = { x: currentHub.x + 3, z: currentHub.z + 3 };

  function showPrompt(text) {
    if (!promptEl) return;
    promptEl.textContent = text;
    promptEl.hidden = !text;
  }
  function openDialogue(speaker, text) {
    if (speakerEl) speakerEl.textContent = speaker;
    if (textEl) textEl.textContent = text;
    if (dialogueEl) dialogueEl.hidden = false;
  }
  function interact() {
    const target = nearest.value;
    if (!target) return;
    if (target.type === 'board') openDialogue('Bảng nhiệm vụ của làng', 'Các nhiệm vụ mới sẽ xuất hiện ở đây. Hãy nói chuyện với dân làng để giúp chăm ruộng và bảo vệ con đường làng.');
    else openDialogue(target.name, target.text);
  }
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && !event.repeat) interact();
    if (event.code === 'Escape' && dialogueEl) dialogueEl.hidden = true;
  });
  document.getElementById('interact-button')?.addEventListener('pointerdown', (event) => { event.preventDefault(); interact(); });
  document.getElementById('village-dialogue-close')?.addEventListener('click', () => { if (dialogueEl) dialogueEl.hidden = true; });

  function place(nextSpawn) {
    const hub = findVillageHub(nextSpawn);
    currentHub = { x: hub.x, z: hub.z };
    hubY = hub.y;
    features.forEach(({ object, offset }) => {
      const x = currentHub.x + offset[0];
      const z = currentHub.z + offset[1];
      // All core village features share one validated pad height. Sampling
      // each object independently allowed houses and paths to land on
      // different terrain steps or sink into rock shelves.
      object.position.set(x, hubY, z);
    });
    houseColliders.length = 0;
    houseLayout.forEach(([ox, oz]) => {
      houseColliders.push({ x: currentHub.x + ox, z: currentHub.z + oz });
    });
    boardPosition = { x: currentHub.x + 3, z: currentHub.z + 3 };
    npcs.forEach((npc) => {
      const [ox, oz] = npc.route[0];
      const x = currentHub.x + ox;
      const z = currentHub.z + oz;
      npc.object.position.set(x, hubY, z);
    });
  }
  place(spawn);

  function isInsideHouse(x, z, radius = 0.45) {
    return houseColliders.some((house) => (
      Math.abs(x - house.x) < HOUSE_HALF_X + radius
      && Math.abs(z - house.z) < HOUSE_HALF_Z + radius
    ));
  }

  function resolveHouseCollision(x, z, previousX, previousZ) {
    let nextX = x;
    let nextZ = z;
    // Resolve each axis independently. This prevents diagonal movement from
    // getting stuck on a wall while still blocking the full house footprint.
    if (isInsideHouse(nextX, previousZ)) nextX = previousX;
    if (isInsideHouse(nextX, nextZ)) nextZ = previousZ;
    if (isInsideHouse(nextX, nextZ)) {
      nextX = previousX;
      nextZ = previousZ;
    }
    return { x: nextX, z: nextZ };
  }

  function villageSurfaceHeight(x, z) {
    return Math.abs(x - currentHub.x) <= VILLAGE_HALF_X
      && Math.abs(z - currentHub.z) <= VILLAGE_HALF_Z
      ? hubY
      : null;
  }

  return {
    update(dt, playerPos, nightFactor = 0) {
      const night = THREE.MathUtils.clamp(nightFactor, 0, 1);
      const candleTime = performance.now() * 0.003;
      villageCandles.userData.candles.forEach((candle, index) => {
        const flicker = 0.82 + 0.18 * Math.sin(candleTime * (7 + index * 0.23) + candle.phase);
        const glowStrength = night * flicker;
        candle.light.intensity = glowStrength * 0.85;
        candle.flame.material.opacity = 0.72 + glowStrength * 0.28;
        candle.flame.scale.y = 1.25 + flicker * 0.28;
        candle.glow.material.opacity = glowStrength * 0.2;
      });
      nearest.value = null;
      let best = 2.5;
      npcs.forEach((npc) => {
        npc.routeTime += dt;
        if (npc.routeTime > 4) { npc.routeTime = 0; npc.routeIndex = (npc.routeIndex + 1) % npc.route.length; }
        const from = npc.route[npc.routeIndex];
        const to = npc.route[(npc.routeIndex + 1) % npc.route.length];
        const t = npc.routeTime / 4;
        const x = currentHub.x + THREE.MathUtils.lerp(from[0], to[0], t);
        const z = currentHub.z + THREE.MathUtils.lerp(from[1], to[1], t);
        const oldX = npc.object.position.x;
        const oldZ = npc.object.position.z;
        npc.object.position.set(x, hubY, z);
        if (Math.hypot(x - oldX, z - oldZ) > 0.001) {
          npc.object.rotation.y = Math.atan2(x - oldX, z - oldZ);
          const walk = Math.sin((npc.routeTime + npc.routeIndex) * Math.PI * 2) * 0.55;
          const parts = npc.object.userData.parts;
          parts.legL.rotation.x = walk;
          parts.legR.rotation.x = -walk;
          parts.armL.rotation.x = -walk * 0.8;
          parts.armR.rotation.x = walk * 0.8;
        }
        const distance = Math.hypot(playerPos.x - x, playerPos.z - z);
        if (distance < best) { best = distance; nearest.value = { type: 'npc', ...npc }; }
      });
      const boardDistance = Math.hypot(playerPos.x - boardPosition.x, playerPos.z - boardPosition.z);
      if (boardDistance < best) { nearest.value = { type: 'board' }; }
      if (!nearest.value) showPrompt('');
      else if (nearest.value.type === 'board') showPrompt('E · Xem bảng nhiệm vụ của làng');
      else showPrompt(`E · Nói chuyện với ${nearest.value.name.split(' · ')[0]}`);
    },
    regenerate: place,
    getHubPosition: () => ({ x: currentHub.x, z: currentHub.z }),
    getSurfaceHeight: villageSurfaceHeight,
    resolveCollision: resolveHouseCollision,
  };
}
