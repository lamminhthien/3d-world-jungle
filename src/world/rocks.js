import * as THREE from 'three';
import { ROCK_COUNT } from '../config.js';
import { dummy, flatMat, groundHeight, obstacles, rand } from '../utils.js';

// Two-tier rock strips along both river banks (instanced for performance).
export function createRocks(scene) {
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = flatMat(0x9aa0a3);
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  rocks.castShadow = rocks.receiveShadow = true;

  let idx = 0;
  for (let i = 0; i < ROCK_COUNT; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = rand(-42, 42);
    // Tier 0 hugs the river edge, tier 1 sits further out.
    const tier = Math.random() < 0.55 ? 0 : 1;
    const x = side * (tier === 0 ? rand(3.2, 4.6) : rand(4.6, 6.4));
    const s = tier === 0 ? rand(0.5, 1.3) : rand(0.7, 1.7);
    dummy.position.set(x, groundHeight(x, z) + s * 0.25, z);
    dummy.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    dummy.scale.set(s * rand(0.8, 1.3), s * rand(0.6, 1), s * rand(0.8, 1.3));
    dummy.updateMatrix();
    rocks.setMatrixAt(idx++, dummy.matrix);
    if (s > 0.9) obstacles.push({ x, z, r: s * 0.8 });
  }

  rocks.count = idx;
  scene.add(rocks);
  return rocks;
}
