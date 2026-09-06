// Legacy static scatter (non-chunked small worlds).
// Now a thin wrapper over the shared static presets in ./presets.js,
// so it stays visually consistent with the chunked world manager.
// For the infinite world, main.js uses createWorldManager (chunks.js).

import * as THREE from 'three';
import { BUSH_COUNT, MAX_TREES, SPAWN } from '../config.js';
import { groundHeight, obstacles } from '../utils.js';
import {
  createVegetationKit,
  placeBroadleaf,
  placeBush,
  placePalm,
  placePine,
} from './presets.js';

export function createTrees(scene) {
  const kit = createVegetationKit();
  const trunkMesh = new THREE.InstancedMesh(kit.geometries.trunk, kit.materials.trunk, MAX_TREES);
  const pineMesh = new THREE.InstancedMesh(kit.geometries.pine, kit.materials.pine, MAX_TREES * 2);
  const blobMesh = new THREE.InstancedMesh(kit.geometries.blob, kit.materials.blob, MAX_TREES * 2);
  const palmMesh = new THREE.InstancedMesh(kit.geometries.palmLeaf, kit.materials.palmLeaf, MAX_TREES * 5);
  const bushMesh = new THREE.InstancedMesh(kit.geometries.bush, kit.materials.bush, BUSH_COUNT);
  const meshes = { trunk: trunkMesh, pine: pineMesh, blob: blobMesh, palm: palmMesh, bush: bushMesh };
  for (const m of [trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh]) {
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  const bucket = { ti: 0, pi: 0, bi: 0, palmi: 0, bu: 0, ci: 0, ri: 0 };
  const rng = Math.random;
  const rand = (a, b) => a + rng() * (b - a);

  function addTree(x, z) {
    const y = groundHeight(x, z);
    const s = rand(0.8, 1.5);
    const kind = rng();
    if (kind < 0.38) {
      if (bucket.pi + 2 <= MAX_TREES * 2) placePine(meshes, bucket, obstacles, x, y, z, s, rng);
    } else if (kind < 0.75) {
      if (bucket.bi + 2 <= MAX_TREES * 2) placeBroadleaf(meshes, bucket, obstacles, x, y, z, s, rng);
    } else if (bucket.palmi + 5 <= MAX_TREES * 5) {
      placePalm(meshes, bucket, obstacles, x, y, z, s, rng);
    }
  }

  // Scatter trees, keeping the river and spawn point clear.
  for (let n = 0; n < MAX_TREES; n++) {
    const x = rand(-38, 38);
    const z = rand(-42, 42);
    if (Math.abs(x) < 7.5) { n--; continue; }
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4.5) { n--; continue; }
    // Thinner in the foreground so the player stays visible.
    if (z > 5 && rng() < 0.3) { n--; continue; }
    addTree(x, z);
  }

  // Accent bushes.
  for (let i = 0; i < BUSH_COUNT && bucket.bu < BUSH_COUNT; i++) {
    const x = rand(-36, 36);
    const z = rand(-42, 42);
    if (Math.abs(x) < 6.8) continue;
    placeBush(meshes, bucket, x, groundHeight(x, z), z, rand(0.6, 1.4), rng);
  }

  trunkMesh.count = bucket.ti;
  pineMesh.count = bucket.pi;
  blobMesh.count = bucket.bi;
  palmMesh.count = bucket.palmi;
  bushMesh.count = bucket.bu;
  for (const m of [trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh]) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  return { trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh };
}
