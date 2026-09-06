import * as THREE from 'three';
import { BUSH_COUNT, MAX_TREES, SPAWN } from '../config.js';
import { dummy, flatMat, groundHeight, obstacles, rand } from '../utils.js';

const pinePalette = [0x2f9e44, 0x2b8a3e, 0x37b24d];
const blobPalette = [0x40b34f, 0x51cf66, 0x2f9e44, 0x69db7c];

// Instanced forest: pines, round-canopy trees, and palms.
// Also scatters low bushes. Fills `obstacles` for collision.
export function createTrees(scene) {
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.3, 1.4, 6);
  const pineGeo = new THREE.ConeGeometry(1.25, 2.6, 7);
  const blobGeo = new THREE.IcosahedronGeometry(1.25, 0);
  const bushGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const palmLeafGeo = new THREE.ConeGeometry(0.4, 2.6, 4);

  const trunkMesh = new THREE.InstancedMesh(trunkGeo, flatMat(0xffffff), MAX_TREES);
  const pineMesh = new THREE.InstancedMesh(pineGeo, flatMat(0xffffff), MAX_TREES * 2);
  const blobMesh = new THREE.InstancedMesh(blobGeo, flatMat(0xffffff), MAX_TREES * 2);
  const palmMesh = new THREE.InstancedMesh(palmLeafGeo, flatMat(0xffffff), MAX_TREES * 5);
  const bushMesh = new THREE.InstancedMesh(bushGeo, flatMat(0xffffff), BUSH_COUNT);
  for (const m of [trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh]) {
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  let ti = 0;
  let pi = 0;
  let bi = 0;
  let palmi = 0;

  function addTree(x, z) {
    const y = groundHeight(x, z);
    const kind = Math.random();
    const s = rand(0.8, 1.5);
    const lean = rand(-0.08, 0.08);

    trunkMesh.setColorAt(ti, new THREE.Color(0x8a5a3b).offsetHSL(0, 0, rand(-0.03, 0.03)));
    dummy.position.set(x, y + 0.7 * s, z);
    dummy.rotation.set(lean, rand(0, 6.28), lean);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    if (ti < MAX_TREES) trunkMesh.setMatrixAt(ti++, dummy.matrix);
    obstacles.push({ x, z, r: 0.55 * s });

    if (kind < 0.38) {
      // Two-tier low-poly pine.
      const pineColor = new THREE.Color(pinePalette[(Math.random() * 3) | 0]);
      for (let k = 0; k < 2; k++) {
        pineMesh.setColorAt(pi, pineColor);
        dummy.position.set(x, y + (1.9 + k * 1.15) * s, z);
        dummy.rotation.set(0, rand(0, 6.28), 0);
        dummy.scale.setScalar(s * (k === 0 ? 1 : 0.68));
        dummy.updateMatrix();
        if (pi < MAX_TREES * 2) pineMesh.setMatrixAt(pi++, dummy.matrix);
      }
    } else if (kind < 0.75) {
      // Round canopy.
      for (let k = 0; k < 2; k++) {
        blobMesh.setColorAt(bi, new THREE.Color(blobPalette[(Math.random() * blobPalette.length) | 0]));
        dummy.position.set(x + rand(-0.4, 0.4) * s, y + (2.1 + k * 0.8) * s, z + rand(-0.4, 0.4) * s);
        dummy.rotation.set(rand(0, 3), rand(0, 3), 0);
        dummy.scale.set(s * rand(0.9, 1.2), s * rand(0.8, 1), s * rand(0.9, 1.2));
        dummy.updateMatrix();
        if (bi < MAX_TREES * 2) blobMesh.setMatrixAt(bi++, dummy.matrix);
      }
    } else {
      // Palm / coconut.
      dummy.position.set(x, y + 1.1 * s, z);
      dummy.rotation.set(0.15, rand(0, 6.28), 0.12);
      dummy.scale.setScalar(s * 1.15);
      dummy.updateMatrix();
      if (ti > 0) trunkMesh.setMatrixAt(ti - 1, dummy.matrix); // taller trunk for palms
      const topY = y + 2.2 * s;
      const topX = x + 0.25;
      const topZ = z + 0.2;
      for (let k = 0; k < 5; k++) {
        palmMesh.setColorAt(palmi, new THREE.Color(0x37b24d).offsetHSL(0, 0, rand(-0.03, 0.03)));
        const a = (k / 5) * Math.PI * 2;
        dummy.position.set(topX + Math.cos(a) * 1.05 * s, topY + rand(-0.15, 0.25), topZ + Math.sin(a) * 1.05 * s);
        dummy.rotation.set(Math.PI / 2.3, 0, -a + Math.PI / 2);
        dummy.scale.set(1, 1, 0.28);
        dummy.updateMatrix();
        if (palmi < MAX_TREES * 5) palmMesh.setMatrixAt(palmi++, dummy.matrix);
      }
      blobMesh.setColorAt(bi, new THREE.Color(0x5c3d24));
      dummy.position.set(topX, topY - 0.15, topZ);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(0.28 * s);
      dummy.updateMatrix();
      if (bi < MAX_TREES * 2) blobMesh.setMatrixAt(bi++, dummy.matrix);
    }
  }

  // Scatter trees, keeping the river and spawn point clear.
  for (let n = 0; n < MAX_TREES; n++) {
    const x = rand(-38, 38);
    const z = rand(-42, 42);
    if (Math.abs(x) < 7.5) {
      n--;
      continue;
    }
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 4.5) {
      n--;
      continue;
    }
    // Thinner in the foreground so the player stays visible.
    if (z > 5 && Math.random() < 0.3) {
      n--;
      continue;
    }
    addTree(x, z);
  }

  // Accent bushes.
  let c = 0;
  for (let i = 0; i < BUSH_COUNT; i++) {
    const x = rand(-36, 36);
    const z = rand(-42, 42);
    if (Math.abs(x) < 6.8) continue;
    bushMesh.setColorAt(c, new THREE.Color(0x69b93e).offsetHSL(rand(-0.02, 0.02), 0, rand(-0.04, 0.04)));
    dummy.position.set(x, groundHeight(x, z) + 0.3, z);
    dummy.rotation.set(rand(0, 3), rand(0, 3), 0);
    dummy.scale.setScalar(rand(0.6, 1.4));
    dummy.updateMatrix();
    bushMesh.setMatrixAt(c++, dummy.matrix);
  }
  bushMesh.count = c;

  trunkMesh.count = ti;
  pineMesh.count = pi;
  blobMesh.count = bi;
  palmMesh.count = palmi;
  for (const m of [trunkMesh, pineMesh, blobMesh, palmMesh]) {
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  return { trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh };
}
