// Global wind state — Phase 5 docs/realism-upgrade-plan.md §5
// Central wind uniform shared by foliage sway, grass, water normals, clouds and audio.
// Updated each frame by environment.js; shaders read the same uniforms (GPU-only sway).

import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';

export const windState = {
  direction: new THREE.Vector2(1, 0.25).normalize(), // slowly rotates 15°/min
  strength: 0.2, // 0.1 calm → 0.7 gale (rain)
  gust: 0,
  time: 0,
};

let _windAngle = Math.atan2(windState.direction.y, windState.direction.x);
const _shaders = []; // { shader, material }

/**
 * Per-frame wind update. Called from environment.js.
 * @param {number} dt - seconds
 * @param {string} weather - 'clear'|'overcast'|'rain'|'fog'
 */
export function updateWind(dt, weather = 'clear') {
  windState.time += dt;
  // Direction drifts slowly (~15° per minute)
  _windAngle += dt * (0.00436); // 15°/60s = 0.00436 rad/s
  windState.direction.set(Math.cos(_windAngle), Math.sin(_windAngle));

  // Base strength by weather
  const base = weather === 'rain' ? 0.55 : weather === 'overcast' ? 0.3 : weather === 'fog' ? 0.18 : 0.2;
  // Gust: low-freq noise (performance.now()*0.0003 + sin)
  const gust = 0.12 * Math.sin(windState.time * 0.3) + 0.08 * Math.sin(windState.time * 0.7 + 1.3);
  windState.gust = THREE.MathUtils.clamp(gust, -0.15, 0.15);
  const target = THREE.MathUtils.clamp(base + windState.gust, 0.08, 0.75);
  // Smooth lerp so gust doesn't snap
  windState.strength += (target - windState.strength) * Math.min(1, dt * 0.6);

  // Push to all registered shader uniforms
  for (const entry of _shaders) {
    if (entry.shader?.uniforms?.windTime) entry.shader.uniforms.windTime.value = windState.time;
    if (entry.shader?.uniforms?.windDir) entry.shader.uniforms.windDir.value.copy(windState.direction);
    if (entry.shader?.uniforms?.windStrength) entry.shader.uniforms.windStrength.value = windState.strength;
  }
}

// Attach GPU sway to a material via onBeforeCompile.
// `strengthScale` tunes trunk (0.1) vs canopy (1.0) amplitude without extra pools.
export function attachWindSway(material, { strengthScale = 1, heightScale = 0.14 } = {}) {
  // Low tier: skip shader injection entirely (saves ALU on tile GPUs)
  if (QUALITY.low) return material;
  if (material.userData.windAttached) return material;
  const scale = strengthScale;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = { value: windState.time };
    shader.uniforms.windDir = { value: windState.direction.clone() };
    shader.uniforms.windStrength = { value: windState.strength };
    shader.uniforms.windScale = { value: scale };
    shader.uniforms.windHeightScale = { value: heightScale };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       uniform float windTime;
       uniform vec2 windDir;
       uniform float windStrength;
       uniform float windScale;
       uniform float windHeightScale;`
    );

    // Height factor: y above base drives amplitude; xz phase gives per-instance variety
    // without needing a custom attribute (world-position hash via local position).
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       {
         float h = max(0.0, position.y);
         float phase = position.x * 0.52 + position.z * 0.37;
         float sway = sin(windTime * 0.6 + phase) * windStrength * windScale * (0.08 + h * windHeightScale);
         // Add secondary gust wiggle for canopy tips
         sway += sin(windTime * 1.4 + phase * 1.7) * windStrength * windScale * 0.03 * clamp(h * 0.5, 0.0, 1.0);
         transformed.x += windDir.x * sway;
         transformed.z += windDir.y * sway;
         transformed.y -= abs(sway) * 0.09;
       }`
    );

    _shaders.push({ shader, material });
    material.userData.windShader = shader;
    material.userData.windAttached = true;
  };
  // Force recompilation on next render so the new shader is picked up
  material.needsUpdate = true;
  return material;
}

// Apply sway to the standard kit materials (call once after createVegetationKit).
export function attachWindToKit(kit) {
  if (QUALITY.low) return;
  // Trunks sway 10% of canopy amplitude
  attachWindSway(kit.materials.trunk, { strengthScale: 0.1, heightScale: 0.06 });
  attachWindSway(kit.materials.pine, { strengthScale: 0.55, heightScale: 0.12 });
  attachWindSway(kit.materials.blob, { strengthScale: 0.65, heightScale: 0.14 });
  attachWindSway(kit.materials.palmLeaf, { strengthScale: 0.75, heightScale: 0.18 });
  attachWindSway(kit.materials.leafCard, { strengthScale: 0.85, heightScale: 0.2 });
  attachWindSway(kit.materials.bush, { strengthScale: 0.5, heightScale: 0.12 });
  attachWindSway(kit.materials.grass, { strengthScale: 0.7, heightScale: 0.22 });
  attachWindSway(kit.materials.reed, { strengthScale: 0.8, heightScale: 0.25 });
}
