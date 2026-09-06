import * as THREE from 'three';
import { CLOUD_COUNT } from '../config.js';
import { rand } from '../utils.js';

// Low-poly drifting clouds (docs/enhance_for_night_screen.md section 3).
// - Merged icosahedron puffs, flat-shaded.
// - Day: white / pale pink, slow drift. Night: dark blue-grey, occasionally
//   crossing the moon (moon occlusion illusion under the ortho camera).
// - Follows the focus so the sky stays alive on the infinite map.
export function createClouds(scene) {
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
    roughness: 1,
    transparent: true,
    opacity: 0.92,
  });
  const clouds = [];

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const g = new THREE.Group();
    const n = 3 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.8, 1.4), 0), cloudMat);
      m.position.set(k * rand(1.0, 1.5), rand(-0.3, 0.3), rand(-0.6, 0.6));
      m.scale.y = 0.6;
      g.add(m);
    }
    const ang = rand(0, Math.PI * 2);
    const rad = rand(30, 44);
    g.position.set(Math.cos(ang) * rad, rand(24, 30), Math.sin(ang) * rad);
    g.userData.speed = rand(0.2, 0.6);
    g.userData.driftZ = rand(-0.15, 0.15);
    g.userData.bobPhase = rand(0, Math.PI * 2);
    g.userData.baseY = g.position.y;
    scene.add(g);
    clouds.push(g);
  }

  function update(dt, focus, elapsed = 0) {
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 0;
    for (const c of clouds) {
      // Slow drift on X (+ slight Z wander), gentle vertical bob.
      c.position.x += c.userData.speed * dt;
      c.position.z += c.userData.driftZ * dt;
      c.position.y = c.userData.baseY + Math.sin(elapsed * 0.3 + c.userData.bobPhase) * 0.5;
      // Wrap around the focus (not world origin) for the infinite map.
      if (c.position.x - fx > 48) c.position.x -= 96;
      if (c.position.x - fx < -48) c.position.x += 96;
      if (c.position.z - fz > 48) c.position.z -= 96;
      if (c.position.z - fz < -48) c.position.z += 96;
    }
  }

  return { clouds, cloudMat, update };
}
