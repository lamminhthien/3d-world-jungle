import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLOUD_COUNT } from '../config.js';
import { isMobileDevice } from '../core/setup.js';
import { rand } from '../utils.js';

// Low-poly drifting clouds (docs/enhance_for_night_screen.md section 3).
// - Merged icosahedron puffs, flat-shaded.
// - Day: white / pale pink, slow drift. Night: dark blue-grey, occasionally
//   crossing the moon (moon occlusion illusion under the ortho camera).
// - Follows the focus so the sky stays alive on the infinite map.
// Perf: each cloud's puffs are merged into ONE geometry (= 1 draw call per
// cloud instead of 3-5), sharing a single cheap Lambert material. MeshStandard
// was overkill here — every extra lit material multiplies per-light cost.
export function createClouds(scene) {
  const cloudMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    flatShading: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const clouds = [];
  const count = isMobileDevice ? 6 : CLOUD_COUNT;

  for (let i = 0; i < count; i++) {
    const n = 3 + ((Math.random() * 3) | 0);
    const parts = [];
    for (let k = 0; k < n; k++) {
      const pg = new THREE.IcosahedronGeometry(rand(0.8, 1.4), 0);
      pg.scale(1, 0.6, 1);
      pg.translate(k * rand(1.0, 1.5), rand(-0.3, 0.3), rand(-0.6, 0.6));
      parts.push(pg);
    }
    const merged = mergeGeometries(parts);
    for (const pg of parts) pg.dispose();
    const m = new THREE.Mesh(merged, cloudMat);
    const g = new THREE.Group();
    g.add(m);
    const ang = rand(0, Math.PI * 2);
    const rad = rand(30, 44);
    // Iso camera sits ~35 units high (distance 60 * sin(35°)), looking down at 35°.
    // Clouds MUST be above the camera (42-48) to hover at the top edge
    // like sky. At 24-38 they fly at camera level -> drift straight
    // in front of the camera and cover the ground (the old "whiteout" bug).
    g.position.set(Math.cos(ang) * rad, rand(42, 48), Math.sin(ang) * rad);
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
