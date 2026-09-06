import * as THREE from 'three';
import { groundHeight } from '../utils.js';

const NPCS = [
  { id: 'merchant', name: 'Mai · Người bán hàng', color: 0xc47a3c, text: 'Chào bạn! Mình đang chuẩn bị cửa hàng nhỏ cho làng. Hãy mang thêm tài nguyên về nhé.', route: [[-8, 1], [-3, 1], [-3, 6]] },
  { id: 'gardener', name: 'Linh · Người trồng cây', color: 0x5d9b55, text: 'Ruộng là nguồn sống của làng. Bạn có thể giúp mình chăm những luống cây không?', route: [[-8, -6], [-2, -6], [-2, -2], [-8, -2]] },
  { id: 'fisher', name: 'Bình · Ngư dân', color: 0x4c83ad, text: 'Mình thường đi dọc con đường phía đông để kiểm tra bờ sông.', route: [[5, -1], [10, -1], [10, 5], [5, 5]] },
  { id: 'farmer', name: 'An · Nông dân', color: 0x8a6b3f, text: 'Mùa này ruộng được mùa! Cứ tự nhiên đi quanh làng nhé.', route: [[-9, -8], [-4, -8], [-4, -4], [-9, -4]] },
  { id: 'child', name: 'Na · Trẻ trong làng', color: 0xd15f88, text: 'Mình thích chạy chơi trên con đường làng!', route: [[-1, 0], [3, 0], [3, 4], [-1, 4]] },
  { id: 'elder', name: 'Ông Tư · Trưởng làng', color: 0x7560a3, text: 'Làng cần một nơi bình yên cho mọi người. Cảm ơn bạn đã ghé thăm.', route: [[5, 6], [9, 6], [9, 9], [5, 9]] },
];

const mat = (color) => new THREE.MeshLambertMaterial({ color });

function makePerson(color) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.82, 0.42), mat(color));
  body.position.y = 0.58;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), mat(0xc98962));
  head.position.y = 1.18;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 6), mat(color));
  hat.position.y = 1.42;
  group.add(hat);
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

export function createVillage(scene, spawn) {
  const root = new THREE.Group();
  root.name = 'village-hub';
  scene.add(root);
  let currentHub = { x: spawn.x + 16, z: spawn.z + 14 };
  const features = [];
  const addFeature = (object, offset) => { features.push({ object, offset }); root.add(object); };

  addFeature(makeHouse(0xe6c28f, 0x9a513d), [-6, 7]);
  addFeature(makeHouse(0xd9b47e, 0x4e7753), [6, 7]);
  addFeature(makeFarm(), [-5, -7]);
  addFeature(makeFarm(), [5, -7]);
  addFeature(makePath(2.2, 18, false), [0, 0]);
  addFeature(makePath(1.6, 11), [0, 6]);
  addFeature(makePath(1.4, 10), [0, -7]);
  addFeature(makeBoard(), [3, 3]);

  // Fence with an open gate at the south entrance.
  addFeature(makeFence(9), [-7.5, -11]);
  addFeature(makeFence(9), [7.5, -11]);
  addFeature(makeFence(24), [0, 11]);
  addFeature(makeFence(22, false), [-11, 0]);
  addFeature(makeFence(8, false), [11, -7]);
  addFeature(makeFence(8, false), [11, 7]);
  const gate = new THREE.Group();
  [-1.5, 1.5].forEach((x) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.7, 6), mat(0x5d3a26));
    post.position.set(x, 0.85, 0);
    gate.add(post);
  });
  addFeature(gate, [0, -11]);
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
    currentHub = { x: nextSpawn.x + 16, z: nextSpawn.z + 14 };
    features.forEach(({ object, offset }) => {
      const x = currentHub.x + offset[0];
      const z = currentHub.z + offset[1];
      object.position.set(x, groundHeight(x, z), z);
    });
    boardPosition = { x: currentHub.x + 3, z: currentHub.z + 3 };
    npcs.forEach((npc) => {
      const [ox, oz] = npc.route[0];
      const x = currentHub.x + ox;
      const z = currentHub.z + oz;
      npc.object.position.set(x, groundHeight(x, z), z);
    });
  }
  place(spawn);

  return {
    update(dt, playerPos) {
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
        npc.object.position.set(x, groundHeight(x, z), z);
        if (Math.hypot(x - oldX, z - oldZ) > 0.001) npc.object.rotation.y = Math.atan2(x - oldX, z - oldZ);
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
  };
}
