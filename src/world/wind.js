// Global wind state — Phase 5 docs/realism-upgrade-plan.md §5
// Central wind uniform shared by foliage sway, grass, water normals, clouds and audio.
// Updated each frame by environment.js; shaders read the same uniforms (GPU-only sway).

import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';
import { getGraphics } from '../core/graphics.js';

export const windState = {
  direction: new THREE.Vector2(1, 0.25).normalize(), // slowly rotates 15°/min
  strength: 0.45, // visible from spawn (was 0.2 imperceptible under ortho)
  gust: 0,
  time: 0,
};

let _windAngle = Math.atan2(windState.direction.y, windState.direction.x);
const _shaders = []; // { shader, material }

/**
 * Per-frame wind update. Called from environment.js.
 * @param {string} weather - 'clear'|'partlyCloudy'|'overcast'|'mist'|'drizzle'|'rain'|'storm'
 */
export function updateWind(dt, weather = 'clear') {
  windState.time += dt;
  // Graphics toggle: wind sway off => zero strength (saves vertex ALU, still updates time).
  let swayOn = !QUALITY.low;
  try { swayOn = getGraphics()?.windSway !== false && !QUALITY.low; } catch { swayOn = !QUALITY.low; }
  if (!swayOn) {
    windState.strength = 0;
    for (const entry of _shaders) {
      if (entry.shader?.uniforms?.windStrength) entry.shader.uniforms.windStrength.value = 0;
      if (entry.shader?.uniforms?.windTime) entry.shader.uniforms.windTime.value = windState.time;
    }
    return;
  }
  // Direction drifts slowly (~15° per minute)
  _windAngle += dt * (0.00436); // 15°/60s = 0.00436 rad/s
  windState.direction.set(Math.cos(_windAngle), Math.sin(_windAngle));

  // Base strength — fog removed, remaining weathers stay vibrant (mist is gentle, storm is wild)
  const baseMap = { clear: 0.55, partlyCloudy: 0.62, overcast: 0.58, mist: 0.38, drizzle: 0.62, rain: 0.78, storm: 1.0 };
  const base = baseMap[weather] ?? 0.55;
  // Gust: low-freq noise, larger amplitude for obvious gusts + occasional sharp gust
  const gust = 0.28 * Math.sin(windState.time * 0.32) + 0.20 * Math.sin(windState.time * 0.68 + 1.3) + 0.10 * Math.sin(windState.time * 1.7 + 0.7);
  // Occasional sharp gust spike every ~8-12s
  const spike = Math.pow(Math.max(0, Math.sin(windState.time * 0.11 + 2.1)), 12) * 0.42;
  windState.gust = THREE.MathUtils.clamp(gust + spike, -0.3, 0.55);
  const target = THREE.MathUtils.clamp(base + windState.gust, 0.15, 1.15);
  // Smooth lerp so gust doesn't snap (faster attack for gusts, slower decay)
  const lerpSpeed = windState.gust > 0.15 ? 1.2 : 0.6;
  windState.strength += (target - windState.strength) * Math.min(1, dt * lerpSpeed);

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

    // Height factor: y above base drives amplitude; per-instance phase via instanceMatrix world xz
    // so instances don't sway in lockstep (visible under ortho). Falls back to local xz when not instanced.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       {
         float h = max(0.0, position.y);
         float worldX = 0.0;
         float worldZ = 0.0;
         #ifdef USE_INSTANCING
           worldX = instanceMatrix[3][0];
           worldZ = instanceMatrix[3][2];
         #endif
         float phase = worldX * 0.13 + worldZ * 0.11 + position.x * 0.52 + position.z * 0.37;
         float sway = sin(windTime * 1.1 + phase) * windStrength * windScale * (0.12 + h * windHeightScale * 1.6);
         // Secondary high-freq flutter for leaf tips / grass blades
         sway += sin(windTime * 2.4 + phase * 1.7) * windStrength * windScale * 0.08 * clamp(h * 0.6, 0.0, 1.0);
         transformed.x += windDir.x * sway;
         transformed.z += windDir.y * sway;
         transformed.y -= abs(sway) * 0.14;
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

// Attach subtle ground undulation + texture drift to a ground material.
// Ground has no "height" to sway — instead we ripple the vertices diagonally
// along wind direction and scroll UVs for a wind-washed field look.
export function attachGroundWind(material) {
  if (QUALITY.low) return material;
  if (material.userData.windGroundAttached) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = { value: windState.time };
    shader.uniforms.windDir = { value: windState.direction.clone() };
    shader.uniforms.windStrength = { value: windState.strength };
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
       uniform float windTime;
       uniform vec2 windDir;
       uniform float windStrength;`
    );
    // Gentle travelling ripple across the whole floor (0.02u amplitude)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       {
         float wave = sin(position.x * 0.18 + position.z * 0.12 + windTime * 0.9) * windStrength * 0.035;
         wave += sin(position.x * 0.07 - position.z * 0.09 + windTime * 1.4) * windStrength * 0.022;
         transformed.y += wave;
         // subtle lateral drift so texture feels alive
         transformed.x += windDir.x * wave * 0.25;
         transformed.z += windDir.y * wave * 0.25;
       }`
    );
    _shaders.push({ shader, material });
    material.userData.windGroundShader = shader;
    material.userData.windGroundAttached = true;
  };
  material.needsUpdate = true;
  return material;
}

// Apply sway to the standard kit materials (call once after createVegetationKit).
export function attachWindToKit(kit) {
  if (QUALITY.low) return;
  // Visible under ortho distance 60 — trunk subtle, foliage/grass exaggerated
  // Grass boosted so floor reads lush and alive even at rest
  attachWindSway(kit.materials.trunk, { strengthScale: 0.35, heightScale: 0.10 });
  attachWindSway(kit.materials.pine, { strengthScale: 0.95, heightScale: 0.18 });
  attachWindSway(kit.materials.blob, { strengthScale: 1.15, heightScale: 0.20 });
  attachWindSway(kit.materials.palmLeaf, { strengthScale: 1.35, heightScale: 0.26 });
  attachWindSway(kit.materials.leafCard, { strengthScale: 1.45, heightScale: 0.30 });
  attachWindSway(kit.materials.bush, { strengthScale: 0.85, heightScale: 0.18 });
  attachWindSway(kit.materials.grass, { strengthScale: 1.85, heightScale: 0.42 });
  attachWindSway(kit.materials.reed, { strengthScale: 1.95, heightScale: 0.45 });
  attachWindSway(kit.materials.flowerHead, { strengthScale: 1.15, heightScale: 0.26 });
  attachWindSway(kit.materials.flowerStem, { strengthScale: 1.05, heightScale: 0.28 });
  // Expose for console testing: window.__windState.strength = 1.0 to force visible gust
  if (typeof window !== 'undefined') {
    window.__windState = windState;
    window.__windGust = () => { windState.strength = 1.35; setTimeout(() => { windState.strength = 0.55; }, 2600); };
  }
}
