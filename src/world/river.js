import * as THREE from 'three';
import { FOAM_COUNT, RIVER_HALF } from '../config.js';
import { rand } from '../utils.js';
import { riverXAt } from './procedural.js';

// Winding river: one large water plane follows the player (the carved channel
// dips below y=-0.32 so water only shows inside the riverbed). Foam streaks
// drift downstream and respawn inside the channel near the player.
export function createRiver(scene) {
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x38b6d3,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.92,
  });

  const water = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.32;
  water.receiveShadow = true;
  scene.add(water);

  const foamGeo = new THREE.PlaneGeometry(0.28, 0.7);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
  const foams = [];

  function spawnFoam(f, fx, fz) {
    const z = fz + rand(-48, 48);
    f.mesh.position.set(riverXAt(z) + rand(-2.2, 2.2), -0.28, z);
  }

  for (let i = 0; i < FOAM_COUNT; i++) {
    const f = {
      mesh: new THREE.Mesh(foamGeo, foamMat),
      speed: rand(1.5, 3.2),
    };
    f.mesh.rotation.x = -Math.PI / 2;
    f.mesh.position.set(0, -0.28, rand(-44, 44));
    f.mesh.scale.setScalar(rand(0.5, 1.2));
    scene.add(f.mesh);
    foams.push(f);
  }

  function update(dt, focus) {
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 0;
    water.position.x = fx;
    water.position.z = fz;
    for (const f of foams) {
      f.mesh.position.z += f.speed * dt;
      if (Math.abs(f.mesh.position.z - fz) > 48 || Math.abs(f.mesh.position.x - fx) > 48) {
        spawnFoam(f, fx, fz);
      }
    }
  }

  return { water, foams, update };
}

export { RIVER_HALF };
