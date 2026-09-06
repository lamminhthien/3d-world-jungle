import * as THREE from 'three';
import { groundHeight } from '../utils.js';

const NPCS = [
  { id: 'merchant', name: 'Mai · Người bán hàng', color: 0xc47a3c, offset: [4, 4], text: 'Chào bạn! Mình đang chuẩn bị một cửa hàng nhỏ cho làng. Hãy mang thêm tài nguyên về nhé.' },
  { id: 'gardener', name: 'Linh · Người trồng cây', color: 0x5d9b55, offset: [8, 4], text: 'Rừng sẽ xanh hơn nếu chúng ta biết chăm sóc nó. Bạn có thấy những quả rừng quanh trại không?' },
  { id: 'fisher', name: 'Bình · Ngư dân', color: 0x4c83ad, offset: [4, 8], text: 'Dòng sông phía kia có cá. Khi làng mở cửa, mình sẽ cần người giúp làm sạch bờ sông.' },
];

function makePerson(color) {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98962 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.82, 0.42), mat);
  body.position.y = 0.58;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), skin);
  head.position.y = 1.18;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.14, 6), mat);
  hat.position.y = 1.42;
  group.add(hat);
  return group;
}

function makeHouse(color, roofColor) {
  const group = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 2.6), new THREE.MeshLambertMaterial({ color }));
  wall.position.y = 0.9;
  group.add(wall);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.35, 1.35, 4), new THREE.MeshLambertMaterial({ color: roofColor }));
  roof.position.y = 2.42;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);
  return group;
}

function makeBoard() {
  const group = new THREE.Group();
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.7, 0.18), new THREE.MeshLambertMaterial({ color: 0x70452c }));
  post.position.y = 0.85;
  group.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.85, 0.12), new THREE.MeshLambertMaterial({ color: 0xd7a861 }));
  board.position.y = 1.45;
  group.add(board);
  return group;
}

export function createVillage(scene, spawn) {
  const root = new THREE.Group();
  root.name = 'village-hub';
  scene.add(root);
  const hub = { x: spawn.x + 16, z: spawn.z + 14 };
  const npcs = NPCS.map((data) => ({ ...data, object: makePerson(data.color) }));
  const houses = [
    { offset: [-1, 8], color: 0xe6c28f, roof: 0x9a513d },
    { offset: [10, 8], color: 0xd9b47e, roof: 0x4e7753 },
  ];
  houses.forEach((house) => {
    const object = makeHouse(house.color, house.roof);
    object.position.set(hub.x + house.offset[0], groundHeight(hub.x + house.offset[0], hub.z + house.offset[1]), hub.z + house.offset[1]);
    root.add(object);
  });
  const sign = makeBoard();
  sign.position.set(hub.x + 8, groundHeight(hub.x + 8, hub.z), hub.z);
  root.add(sign);
  const camp = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.12, 12), new THREE.MeshLambertMaterial({ color: 0x9b6b35 }));
  camp.position.set(hub.x, groundHeight(hub.x, hub.z), hub.z);
  root.add(camp);

  const promptEl = document.getElementById('adventure-prompt');
  const dialogueEl = document.getElementById('village-dialogue');
  const speakerEl = document.getElementById('village-speaker');
  const textEl = document.getElementById('village-dialogue-text');
  const nearest = { value: null };
  let currentHub = { ...hub };

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
    if (target.type === 'board') openDialogue('Bảng nhiệm vụ của làng', 'MVP: Các nhiệm vụ mới sẽ xuất hiện ở đây. Hãy nói chuyện với dân làng để khám phá câu chuyện đầu tiên.');
    else openDialogue(target.name, target.text);
  }
  document.addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && !event.repeat) interact();
    if (event.code === 'Escape' && dialogueEl) dialogueEl.hidden = true;
  });
  document.getElementById('interact-button')?.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    interact();
  });
  document.getElementById('village-dialogue-close')?.addEventListener('click', () => {
    if (dialogueEl) dialogueEl.hidden = true;
  });

  function place(nextSpawn) {
    currentHub = { x: nextSpawn.x + 16, z: nextSpawn.z + 14 };
    houses.forEach((house, index) => {
      const object = root.children[index];
      const x = currentHub.x + house.offset[0];
      const z = currentHub.z + house.offset[1];
      object.position.set(x, groundHeight(x, z), z);
    });
    sign.position.set(currentHub.x + 8, groundHeight(currentHub.x + 8, currentHub.z), currentHub.z);
    camp.position.set(currentHub.x, groundHeight(currentHub.x, currentHub.z), currentHub.z);
    npcs.forEach((npc) => {
      const x = currentHub.x + npc.offset[0];
      const z = currentHub.z + npc.offset[1];
      npc.object.position.set(x, groundHeight(x, z), z);
      if (!npc.object.parent) root.add(npc.object);
    });
  }
  place(spawn);

  return {
    update(_dt, playerPos) {
      nearest.value = null;
      let best = 2.5;
      npcs.forEach((npc) => {
        npc.object.rotation.y = Math.atan2(playerPos.x - npc.object.position.x, playerPos.z - npc.object.position.z);
        const distance = Math.hypot(playerPos.x - npc.object.position.x, playerPos.z - npc.object.position.z);
        if (distance < best) { best = distance; nearest.value = { type: 'npc', ...npc }; }
      });
      const boardDistance = Math.hypot(playerPos.x - sign.position.x, playerPos.z - sign.position.z);
      if (boardDistance < best) { best = boardDistance; nearest.value = { type: 'board' }; }
      if (!nearest.value) showPrompt('');
      else if (nearest.value.type === 'board') showPrompt('E · Xem bảng nhiệm vụ của làng');
      else showPrompt(`E · Nói chuyện với ${nearest.value.name.split(' · ')[0]}`);
    },
    regenerate: place,
    getHubPosition: () => ({ x: currentHub.x, z: currentHub.z }),
  };
}
