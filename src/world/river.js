import * as THREE from 'three';
import { FOAM_COUNT, RIVER_HALF } from '../config.js';
import { rand } from '../utils.js';

// Central river plane + drifting white foam streaks for a flowing feel.
export function createRiver(scene) {
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x38b6d3,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
  });

  const water = new THREE.Mesh(new THREE.PlaneGeometry(RIVER_HALF * 2 - 0.3, 90), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.32;
  water.receiveShadow = true;
  scene.add(water);

  const foamGeo = new THREE.PlaneGeometry(0.28, 0.7);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
  const foams = [];
  for (let i = 0; i < FOAM_COUNT; i++) {
    const f = new THREE.Mesh(foamGeo, foamMat);
    f.rotation.x = -Math.PI / 2;
    f.position.set(rand(-2.2, 2.2), -0.28, rand(-44, 44));
    f.scale.setScalar(rand(0.5, 1.2));
    scene.add(f);
    foams.push({ mesh: f, speed: rand(1.5, 3.2) });
  }

  function update(dt) {
    for (const f of foams) {
      f.mesh.position.z += f.speed * dt;
      if (f.mesh.position.z > 45) f.mesh.position.z = -45;
    }
  }

  return { water, foams, update };
}
