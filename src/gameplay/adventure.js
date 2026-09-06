import * as THREE from 'three';
import { groundHeight, riverDist } from '../utils.js';
import { createInventory } from './inventory.js';
import { createQuestLog, QUESTS } from './quests.js';

const HERB_OFFSETS = [
  [-5.5, 4.5],
  [5.5, 3.5],
  [-3.5, -5.5],
];

function makeHerb() {
  const group = new THREE.Group();
  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.055, 0.55, 5),
    new THREE.MeshLambertMaterial({ color: 0x3f8f45 })
  );
  stem.position.y = 0.28;
  group.add(stem);

  const leafMat = new THREE.MeshLambertMaterial({ color: 0xb7e36b, emissive: 0x284d18, emissiveIntensity: 0.35 });
  for (const [x, z, rot] of [[-0.13, 0, -0.45], [0.13, 0.03, 0.45], [0, 0.02, 0]]) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 4), leafMat);
    leaf.scale.set(1, 0.35, 1.8);
    leaf.position.set(x, 0.48, z);
    leaf.rotation.y = rot;
    group.add(leaf);
  }
  return group;
}

function makeRanger() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.42), new THREE.MeshLambertMaterial({ color: 0x516b43 }));
  body.position.y = 0.65;
  group.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshLambertMaterial({ color: 0xc98962 }));
  head.position.y = 1.28;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.22, 6), new THREE.MeshLambertMaterial({ color: 0x9b6b35 }));
  hat.position.y = 1.56;
  group.add(hat);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.2), new THREE.MeshLambertMaterial({ color: 0x70452c }));
  pack.position.set(0, 0.75, -0.28);
  group.add(pack);
  return group;
}

export function createAdventure(scene, spawn) {
  const root = new THREE.Group();
  root.name = 'adventure-content';
  scene.add(root);

  const ranger = makeRanger();
  const rangerPos = { x: spawn.x + 2.5, z: spawn.z + 2.5 };
  ranger.position.set(rangerPos.x, groundHeight(rangerPos.x, rangerPos.z), rangerPos.z);
  root.add(ranger);

  const herbs = HERB_OFFSETS.map(([ox, oz], index) => {
    let x = spawn.x + ox;
    let z = spawn.z + oz;
    if (riverDist(x, z) < 4.2) z += oz > 0 ? 2.5 : -2.5;
    const herb = makeHerb();
    herb.position.set(x, groundHeight(x, z), z);
    herb.userData.collected = false;
    root.add(herb);
    return { object: herb, x, z, index };
  });

  const state = { started: false, complete: false, collected: 0, reward: 0 };
  const inventory = createInventory();
  const questLog = createQuestLog();
  const promptEl = document.getElementById('adventure-prompt');
  const questEl = document.getElementById('quest-tracker');
  const inventoryEl = document.getElementById('inventory');
  let nearest = null;

  function updateUi() {
    if (!questEl || !inventoryEl) return;
    const quest = questLog.get(QUESTS.rangerHerbs.id);
    state.collected = inventory.count('herb');
    state.complete = Boolean(quest?.complete);
    if (!state.started) questEl.textContent = 'Nhiệm vụ: Gặp người đi rừng gần trại';
    else if (!state.complete) questEl.textContent = `Nhiệm vụ: ${QUESTS.rangerHerbs.title} (${quest?.progress || 0}/${QUESTS.rangerHerbs.objective.amount})`;
    else questEl.textContent = '✓ Đã hoàn thành: Thảo dược cho người đi rừng';
    inventoryEl.textContent = `Túi đồ: 🌿 ${inventory.count('herb')}  ·  ⭐ ${state.reward}`;
  }

  function showPrompt(text) {
    if (!promptEl) return;
    promptEl.textContent = text;
    promptEl.hidden = !text;
  }

  function interact() {
    if (!nearest) return;
    if (nearest.type === 'ranger') {
      if (!state.started) {
        state.started = true;
        questLog.accept(QUESTS.rangerHerbs);
        showPrompt('Đã nhận nhiệm vụ: tìm 3 nhánh thảo dược quanh trại.');
      } else if (questLog.get(QUESTS.rangerHerbs.id)?.complete && !questLog.get(QUESTS.rangerHerbs.id)?.rewarded) {
        state.reward = 10;
        questLog.get(QUESTS.rangerHerbs.id).rewarded = true;
        showPrompt('Người đi rừng: Cảm ơn bạn! Hãy nhận ⭐10 làm phần thưởng.');
      } else if (!state.complete) {
        showPrompt(`Người đi rừng: Còn thiếu ${herbs.length - state.collected} nhánh thảo dược.`);
      } else {
        showPrompt('Người đi rừng: Khu rừng hôm nay yên bình nhờ bạn.');
      }
    } else if (nearest.type === 'herb' && state.started && !nearest.item.object.userData.collected) {
      nearest.item.object.userData.collected = true;
      nearest.item.object.visible = false;
      inventory.add('herb');
      questLog.progress(QUESTS.rangerHerbs.id);
      state.collected = inventory.count('herb');
      showPrompt(state.collected === herbs.length ? 'Đủ thảo dược rồi — quay lại gặp người đi rừng.' : 'Đã hái thảo dược.');
    } else if (nearest.type === 'herb' && !state.started) {
      showPrompt('Có vẻ đây là thảo dược. Hãy hỏi người đi rừng trước.');
    }
    updateUi();
  }

  function regenerate(nextSpawn) {
    rangerPos.x = nextSpawn.x + 2.5;
    rangerPos.z = nextSpawn.z + 2.5;
    ranger.position.set(rangerPos.x, groundHeight(rangerPos.x, rangerPos.z), rangerPos.z);
    herbs.forEach((item, index) => {
      const [ox, oz] = HERB_OFFSETS[index];
      item.x = nextSpawn.x + ox;
      item.z = nextSpawn.z + oz;
      if (riverDist(item.x, item.z) < 4.2) item.z += oz > 0 ? 2.5 : -2.5;
      item.object.position.set(item.x, groundHeight(item.x, item.z), item.z);
      item.object.userData.collected = false;
      item.object.visible = true;
    });
    state.started = false;
    state.complete = false;
    state.collected = 0;
    state.reward = 0;
    inventory.clear();
    questLog.reset();
    updateUi();
  }

  addEventListener('keydown', (event) => {
    if (event.code === 'KeyE' && !event.repeat) interact();
  });

  updateUi();
  return {
    update(_dt, playerPos) {
      ranger.rotation.y = Math.atan2(playerPos.x - ranger.position.x, playerPos.z - ranger.position.z);
      nearest = null;
      let best = 2.4;
      const rangerDistance = Math.hypot(playerPos.x - rangerPos.x, playerPos.z - rangerPos.z);
      if (rangerDistance < best) {
        best = rangerDistance;
        nearest = { type: 'ranger' };
      }
      for (const item of herbs) {
        if (item.object.userData.collected) continue;
        const distance = Math.hypot(playerPos.x - item.x, playerPos.z - item.z);
        if (distance < best) {
          best = distance;
          nearest = { type: 'herb', item };
        }
      }
      if (!nearest) showPrompt('');
      else if (nearest.type === 'ranger') showPrompt(state.started ? 'E · Nói chuyện với người đi rừng' : 'E · Nhận nhiệm vụ từ người đi rừng');
      else showPrompt('E · Hái thảo dược');
    },
    regenerate,
    state,
  };
}
