import * as THREE from 'three';
import { BRIDGES } from '../config.js';
import { flatMat } from '../utils.js';
import { riverXAt } from './procedural.js';
import { getBarkBump, getBarkTexture } from './textures.js';

// Wooden plank bridges spanning the winding river. Each bridge is centred on
// the river path riverXAt(bz) so the deck always crosses the water, even after
// a seed change. Re-call createBridges() after regenerate() to re-seat them.
export function createBridges(scene) {
  const woodMaps = { map: getBarkTexture(), bumpMap: getBarkBump(), bumpScale: 0.04 };
  const plankMat = flatMat(0xa5713f, woodMaps);
  const railMat = flatMat(0x7a4f27, woodMaps);
  const groups = [];

  for (const bz of BRIDGES) {
    const g = new THREE.Group();
    const cx = riverXAt(bz);
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.1), plankMat);
      p.position.set(-4 + i, 0.45, 0);
      p.castShadow = p.receiveShadow = true;
      g.add(p);
    }
    for (const s of [-0.8, 0.8]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.12), railMat);
      rail.position.set(0, 1.15, s);
      rail.castShadow = true;
      g.add(rail);
      for (let i = -4; i <= 4; i += 2) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.8, 0.14), railMat);
        post.position.set(i, 0.8, s);
        post.castShadow = true;
        g.add(post);
      }
    }
    g.position.set(cx, 0, bz);
    scene.add(g);
    groups.push(g);
  }

  return groups;
}

// Remove previously created bridge groups (used when the seed changes).
export function removeBridges(scene, groups) {
  for (const g of groups) scene.remove(g);
}
