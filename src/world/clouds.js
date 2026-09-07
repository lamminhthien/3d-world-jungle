import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CLOUD_COUNT } from '../config.js';
import { QUALITY, isMobileDevice } from '../core/setup.js';
import { rand } from '../utils.js';
import { windState } from './wind.js';
import { getGraphics } from '../core/graphics.js';

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
  const tierCount = QUALITY.low ? 4 : isMobileDevice ? 6 : CLOUD_COUNT;
  // Always allocate tier max so live toggle can show more without recreation.
  const maxCount = tierCount;
  let gfxClouds = CLOUD_COUNT;
  try { const g = getGraphics(); if (g?.cloudCount != null) gfxClouds = g.cloudCount; if (g?.clouds === false) gfxClouds = 0; } catch {}
  const initialVisible = Math.min(maxCount, gfxClouds);

  for (let i = 0; i < maxCount; i++) {
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
    g.visible = i < initialVisible;
    scene.add(g);
    clouds.push(g);
  }

  function update(dt, focus, elapsed = 0) {
    if (clouds.length === 0) return;
    try { const g = getGraphics(); if (g?.clouds === false) return; } catch {}
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 0;
    // Wind modulates cloud drift (stronger wind → faster drift along windDir)
    const windBoost = 0.5 + windState.strength * 0.9;
    const wx = windState.direction.x * windBoost * 0.35;
    const wz = windState.direction.y * windBoost * 0.35;
    for (const c of clouds) {
      // Slow drift on X (+ slight Z wander) + wind contribution
      c.position.x += (c.userData.speed + wx) * dt;
      c.position.z += (c.userData.driftZ + wz) * dt;
      c.position.y = c.userData.baseY + Math.sin(elapsed * 0.3 + c.userData.bobPhase) * 0.5;
      // Wrap around the focus (not world origin) for the infinite map.
      if (c.position.x - fx > 48) c.position.x -= 96;
      if (c.position.x - fx < -48) c.position.x += 96;
      if (c.position.z - fz > 48) c.position.z -= 96;
      if (c.position.z - fz < -48) c.position.z += 96;
    }
  }

  function applyGraphics(g) {
    const want = g?.clouds === false ? 0 : (g?.cloudCount ?? CLOUD_COUNT);
    const visible = Math.min(want, clouds.length);
    for (let i = 0; i < clouds.length; i++) clouds[i].visible = i < visible;
  }

  return { clouds, cloudMat, update, applyGraphics };
}
