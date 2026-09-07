// Faux real-time Global Illumination + dynamic lights
// - Screen-space AO via SSAOPass (desktop) / SAOPass fallback
// - Bounce fill light (opposite to sun/moon, warm/cool)
// - Extra dynamic point lights: player lantern + campfire boost + firefly lights
// - Light probe-ish ambient boost based on sky color
// Cheap, stable, no G-buffer leaks.

import * as THREE from 'three';
import { QUALITY } from './setup.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';

// Bounce light: secondary direction opposite key light, tints ground bounce
export function createBounceLight(scene) {
  const bounce = new THREE.DirectionalLight(0xfff0d6, 0);
  bounce.position.set(-10, 8, -10);
  bounce.castShadow = false;
  scene.add(bounce);
  scene.add(bounce.target);
  return bounce;
}

// Screen-space AO pass creation — disabled by default for isometric ortho
// SSAO produces diagonal banding with this camera (world up ~35°, ortho).
// GI now relies on bounce light + lantern GI; AO is kept off unless user
// forces ?ao=1 for testing. This avoids the streaky ground in the screenshot.
export function createAOPass(scene, camera, width, height) {
  try {
    const force = new URLSearchParams(location.search).get('ao');
    if (force !== '1') return null; // default off to keep ground clean
    if (QUALITY.low) return null;
    const w = width || innerWidth;
    const h = height || innerHeight;
    const pass = new SSAOPass(scene, camera, w, h);
    pass.kernelRadius = 0.35;
    pass.minDistance = 0.002;
    pass.maxDistance = 0.03;
    pass.output = SSAOPass.OUTPUT.Default;
    pass.enabled = true;
    return pass;
  } catch (e) {
    console.warn('[GI] AO pass creation failed', e);
  }
  return null;
}

// Dynamic light rig: player lantern + near-fire boost
export function createDynamicLightRig(scene) {
  // Player lantern: warm point that follows player, strong at night, off by day
  const lantern = new THREE.PointLight(0xffb86a, 0, 18, 1.8);
  lantern.position.set(0, 1.2, 0);
  lantern.castShadow = false; // shadows from moving player lamp are expensive
  scene.add(lantern);

  // Subtle rim/hemisphere fill driven by bounce light: we modulate existing hemi/bounce
  // Also an extra cool fill for moon: faint blue point high above
  const moonFill = new THREE.PointLight(0xa1c4fd, 0, 80, 2);
  moonFill.position.set(0, 30, 0);
  scene.add(moonFill);

  // Firefly lights: 3 pooled point lights that jump to brightest fireflies (night only)
  const fireflyLights = [];
  const ffCount = QUALITY.low ? 2 : 3;
  for (let i = 0; i < ffCount; i++) {
    const l = new THREE.PointLight(0xb8ff6a, 0, 9, 2);
    scene.add(l);
    fireflyLights.push(l);
  }

  function update({ playerPos, nightFactor, time, firefliesPosArray, delta }) {
    const nf = THREE.MathUtils.clamp(nightFactor ?? 0, 0, 1);
    if (playerPos) {
      lantern.position.set(playerPos.x, (playerPos.y ?? 0) + 1.1, playerPos.z);
      // Day: off, dusk: fade in, night: bright with gentle flicker
      const flicker = 0.92 + 0.08 * Math.sin(time * 6.5) + 0.04 * Math.sin(time * 13.0 + 1.7);
      lantern.intensity = nf * 2.8 * flicker;
      lantern.distance = 12 + nf * 6;
      lantern.decay = 1.8;
    }
    moonFill.intensity = nf * 0.55;
    moonFill.position.set((playerPos?.x ?? 0) + 10, 28, (playerPos?.z ?? 0) - 8);

    // Firefly lights: sample a few firefly positions if available and night
    if (nf > 0.25 && firefliesPosArray && fireflyLights.length) {
      const arr = firefliesPosArray; // Float32Array of COUNT*3
      const count = arr.length / 3;
      for (let i = 0; i < fireflyLights.length; i++) {
        const idx = Math.floor((Math.sin(time * 0.7 + i * 2.3) * 0.5 + 0.5) * (count - 1));
        const x = arr[idx * 3];
        const y = arr[idx * 3 + 1];
        const z = arr[idx * 3 + 2];
        const l = fireflyLights[i];
        // lerp for smooth chase
        l.position.x += (x - l.position.x) * Math.min(1, delta * 3);
        l.position.y += (y - l.position.y) * Math.min(1, delta * 3);
        l.position.z += (z - l.position.z) * Math.min(1, delta * 3);
        const pulse = 0.5 + 0.5 * Math.sin(time * (2.0 + i * 0.6) + i * 1.9);
        l.intensity = nf * (0.9 + pulse * 0.9);
        l.distance = 7 + pulse * 2;
      }
    } else {
      for (const l of fireflyLights) l.intensity = 0;
    }
  }

  return { lantern, moonFill, fireflyLights, update };
}

// Update bounce + hemi tints for GI feel
export function updateBounceLight(bounce, { sunDir, moonDir, sunColor, nightFactor, isDay }) {
  if (!bounce) return;
  const nf = THREE.MathUtils.clamp(nightFactor ?? 0, 0, 1);
  if (isDay) {
    // Bounce from ground: warm, opposite sun azimuth, low elevation
    const d = sunDir || new THREE.Vector3(1, 1, 0);
    bounce.position.set(-d.x * 18, 6, -d.z * 18);
    bounce.target.position.set(0, 0, 0);
    bounce.color.copy(sunColor || new THREE.Color(0xfff3e0)).lerp(new THREE.Color(0xffe4b5), 0.35);
    bounce.intensity = 0.42 + (1 - nf) * 0.12; // ~0.42-0.54
    bounce.color.multiplyScalar(0.85);
  } else {
    const d = moonDir || new THREE.Vector3(-1, 0.5, 0);
    bounce.position.set(-d.x * 14, 5, -d.z * 14);
    bounce.color.setHex(0x8fb4ff);
    bounce.intensity = 0.22 + nf * 0.16;
  }
  bounce.target.updateMatrixWorld();
}
