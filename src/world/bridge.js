import * as THREE from 'three';
import { BRIDGES } from '../config.js';
import { flatMat } from '../utils.js';

// Wooden plank bridges spanning the river at each BRIDGES z position.
export function createBridges(scene) {
  const plankMat = flatMat(0xa5713f);
  const railMat = flatMat(0x7a4f27);
  const groups = [];

  for (const bz of BRIDGES) {
    const g = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.1), plankMat);
      p.position.set(-4 + i, 0.45, bz);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
    }
    for (const s of [-0.8, 0.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.12), railMat);
      rail.position.set(0, 1.15, bz + s);
      rail.castShadow = true;
      g.add(rail);
      for (let i = -4; i <= 4; i += 2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), railMat);
        post.position.set(i, 0.8, bz + s);
        post.castShadow = true;
        g.add(post);
      }
    }
    scene.add(g);
    groups.push(g);
  }

  return groups;
}
