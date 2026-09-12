// Legacy static scatter (non-chunked small worlds).
// Now a thin wrapper over the shared static presets in ./presets.js,
// so it stays visually consistent with the chunked world manager.
// For the infinite world, main.js uses createWorldManager (chunks.js).

import * as THREE from 'three';
import { BUSH_COUNT, MAX_TREES, SPAWN, VEGETATION } from '../config.js';
import { groundHeight, obstacles } from '../utils.js';
import {
  createVegetationKit,
  PALM_FRONDS,
  placeBanana,
  placeBlossomTree,
  placeBroadleaf,
  placeBush,
  placeFloweringBush,
  placeFlowerPatch,
  placeFruitTree,
  placeGoldenTree,
  placeKapok,
  placePalm,
  placePine,
  placeRainbowTree,
  placeStardewApple,
  placeStardewBirch,
  placeStardewOak,
  placeStardewPine,
} from './presets.js';

export function createTrees(scene) {
  const kit = createVegetationKit();
  // Branches reuse the trunk pool: size it ~4x (trunk + 2 limbs + roots).
  const trunkMesh = new THREE.InstancedMesh(kit.geometries.trunk, kit.materials.trunk, MAX_TREES * 4);
  const pineMesh = new THREE.InstancedMesh(kit.geometries.pine, kit.materials.pine, MAX_TREES * 3);
  const blobMesh = new THREE.InstancedMesh(kit.geometries.blob, kit.materials.blob, MAX_TREES * 4);
  const palmMesh = new THREE.InstancedMesh(kit.geometries.palmLeaf, kit.materials.palmLeaf, MAX_TREES * PALM_FRONDS);
  const bushMesh = new THREE.InstancedMesh(kit.geometries.bush, kit.materials.bush, BUSH_COUNT);
  const fruitMesh = new THREE.InstancedMesh(kit.geometries.fruit, kit.materials.fruit, MAX_TREES * 6);
  const flowerStemMesh = new THREE.InstancedMesh(kit.geometries.flowerStem, kit.materials.flowerStem, MAX_TREES * 4);
  const flowerHeadMesh = new THREE.InstancedMesh(kit.geometries.flowerHead, kit.materials.flowerHead, MAX_TREES * 4);
  const meshes = { trunk: trunkMesh, pine: pineMesh, blob: blobMesh, palm: palmMesh, bush: bushMesh, fruit: fruitMesh, flowerStem: flowerStemMesh, flowerHead: flowerHeadMesh };
  const all = [trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh, fruitMesh, flowerStemMesh, flowerHeadMesh];
  for (const m of all) {
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }
  flowerStemMesh.castShadow = flowerHeadMesh.castShadow = false;

  const bucket = { ti: 0, pi: 0, bi: 0, palmi: 0, bu: 0, ci: 0, ri: 0, gi: 0, fri: 0, fsti: 0, fhi: 0 };
  const rng = Math.random;
  const rand = (a, b) => a + rng() * (b - a);

  function addTree(x, z) {
    const y = groundHeight(x, z);
    const s = rand(0.8, 1.5) * VEGETATION.treeScale;
    const kind = rng();
    if (bucket.ti + 4 > MAX_TREES * 4) return;
    if (kind < 0.18) {
      if (bucket.bi + 3 <= MAX_TREES * 4) placeStardewOak(meshes, bucket, obstacles, x, y, z, s, rng);
    } else if (kind < 0.30) {
      if (bucket.pi + 3 <= MAX_TREES * 3) placeStardewPine(meshes, bucket, obstacles, x, y, z, s, rng);
    } else if (kind < 0.40) {
      if (bucket.bi + 3 <= MAX_TREES * 4 && bucket.fri + 8 <= MAX_TREES * 6) {
        placeStardewApple(meshes, bucket, obstacles, x, y, z, s, rng);
      }
    } else if (kind < 0.50) {
      if (bucket.bi + 3 <= MAX_TREES * 4) placeStardewBirch(meshes, bucket, obstacles, x, y, z, s, rng);
    } else if (kind < 0.58) {
      if (bucket.pi + 3 <= MAX_TREES * 3) placePine(meshes, bucket, obstacles, x, y, z, s, rng);
    } else if (kind < 0.66) {
      if (bucket.bi + 3 <= MAX_TREES * 4) placeBroadleaf(meshes, bucket, obstacles, x, y, z, s, rng);
    } else if (kind < 0.72) {
      if (bucket.bi + 3 <= MAX_TREES * 4 && bucket.fri + 7 <= MAX_TREES * 6) {
        placeFruitTree(meshes, bucket, obstacles, x, y, z, s, rng);
      }
    } else if (kind < 0.78) {
      if (bucket.bi + 3 <= MAX_TREES * 4) placeBlossomTree(meshes, bucket, obstacles, x, y, z, s, rng);
    } else if (kind < 0.81) {
      if (bucket.bi + 4 <= MAX_TREES * 4) placeRainbowTree(meshes, bucket, obstacles, x, y, z, rand(0.9, 1.4) * VEGETATION.treeScale, rng);
    } else if (kind < 0.84) {
      if (bucket.bi + 3 <= MAX_TREES * 4) placeGoldenTree(meshes, bucket, obstacles, x, y, z, s, rng);
    } else if (kind < 0.87) {
      if (bucket.bi + 5 <= MAX_TREES * 4) placeKapok(meshes, bucket, obstacles, x, y, z, rand(1.0, 1.5) * VEGETATION.treeScale, rng);
    } else if (kind < 0.93) {
      if (bucket.palmi + PALM_FRONDS <= MAX_TREES * PALM_FRONDS) {
        placeBanana(meshes, bucket, obstacles, x, y, z, s, rng);
      }
    } else if (bucket.palmi + PALM_FRONDS <= MAX_TREES * PALM_FRONDS) {
      placePalm(meshes, bucket, obstacles, x, y, z, s, rng);
    }
  }

  // Scatter trees, keeping the river and spawn point clear.
  for (let n = 0; n < Math.round(MAX_TREES * VEGETATION.treeDensity); n++) {
    const x = rand(-38, 38);
    const z = rand(-42, 42);
    if (Math.abs(x) < 7.5) { n--; continue; }
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4.5) { n--; continue; }
    // Thinner in the foreground so the player stays visible.
    if (z > 5 && rng() < 0.3) { n--; continue; }
    addTree(x, z);
  }

  // Accent bushes + flower patches.
  for (let i = 0; i < BUSH_COUNT && bucket.bu < BUSH_COUNT; i++) {
    const x = rand(-36, 36);
    const z = rand(-42, 42);
    if (Math.abs(x) < 6.8) continue;
    if (rng() < 0.3 && bucket.fhi + 6 <= MAX_TREES * 4) {
      placeFloweringBush(meshes, bucket, x, groundHeight(x, z), z, rand(0.5, 1.0), rng);
    } else {
      placeBush(meshes, bucket, x, groundHeight(x, z), z, rand(0.6, 1.4), rng);
    }
  }
  for (let i = 0; i < 60; i++) {
    const x = rand(-36, 36);
    const z = rand(-42, 42);
    if (Math.abs(x) < 6.8) continue;
    if (bucket.fhi + 6 > MAX_TREES * 4 || bucket.fsti + 6 > MAX_TREES * 4) break;
    placeFlowerPatch(meshes, bucket, x, groundHeight(x, z), z, rand(0.6, 1.1), rng);
  }

  trunkMesh.count = bucket.ti;
  pineMesh.count = bucket.pi;
  blobMesh.count = bucket.bi;
  palmMesh.count = bucket.palmi;
  bushMesh.count = bucket.bu;
  fruitMesh.count = bucket.fri;
  flowerStemMesh.count = bucket.fsti;
  flowerHeadMesh.count = bucket.fhi;
  for (const m of all) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  return { trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh, fruitMesh, flowerStemMesh, flowerHeadMesh };
}
