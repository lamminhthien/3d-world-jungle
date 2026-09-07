// FX composer — Phase 6 docs/realism-upgrade-plan.md §6.2 P2 (bloom removed)
// Desktop only. Low tier never creates composer (keeps direct renderer.render).
// Stack: RenderPass → [AO] → Volumetric → LensFlare → OutputPass
// Phase 7: god rays / moon shafts (volumetrics.js), lens flare (lensFlare.js), soft GI AO

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY } from './setup.js';
import { getGraphics } from './graphics.js';
import { createVolumetricPass } from './volumetrics.js';
import { createLensFlarePass } from './lensFlare.js';
import { createAOPass } from './globalIllumination.js';

const FX_KEY = 'jungle_fx';
function getFxToggles() {
  try {
    const raw = localStorage.getItem(FX_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { rays: true, flare: true, gi: true };
}
function setFxToggles(v) {
  try { localStorage.setItem(FX_KEY, JSON.stringify(v)); } catch {}
}
export function isRaysEnabled() {
  if (QUALITY.low) return false;
  try { const g = getGraphics(); if (g?.rays === false) return false; } catch {}
  return getFxToggles().rays !== false;
}
export function isFlareEnabled() {
  if (QUALITY.low) return false;
  try { const g = getGraphics(); if (g?.flare === false) return false; } catch {}
  return getFxToggles().flare !== false;
}
export function isGIEnabled() {
  if (QUALITY.low) return false;
  try { const g = getGraphics(); if (g?.gi === false) return false; } catch {}
  return getFxToggles().gi !== false;
}
export function setRaysEnabled(on) {
  const t = getFxToggles(); t.rays = !!on; setFxToggles(t);
  if (typeof window !== 'undefined' && window.__composer?.userData?.volumetric) {
    window.__composer.userData.volumetric.pass.enabled = !!on;
  }
}
export function setFlareEnabled(on) {
  const t = getFxToggles(); t.flare = !!on; setFxToggles(t);
  if (typeof window !== 'undefined' && window.__composer?.userData?.lensFlare) {
    window.__composer.userData.lensFlare.pass.enabled = !!on;
  }
}
export function setGIEnabled(on) {
  const t = getFxToggles(); t.gi = !!on; setFxToggles(t);
  if (typeof window !== 'undefined' && window.__composer?.userData?.aoPass) {
    window.__composer.userData.aoPass.enabled = !!on;
  }
  if (typeof window !== 'undefined' && window.__bounceLight) {
    window.__bounceLight.visible = !!on;
  }
}

export function createComposer(renderer, scene, camera) {
  if (QUALITY.low) return null;
  try {
    const composer = new EffectComposer(renderer);
    composer.userData = composer.userData || {};
    composer.addPass(new RenderPass(scene, camera));

    // Soft GI: screen-space AO (desktop only, disabled on low)
    let aoPass = null;
    try {
      aoPass = createAOPass(scene, camera, innerWidth, innerHeight);
      if (aoPass) {
        aoPass.enabled = isGIEnabled();
        composer.addPass(aoPass);
      }
    } catch (e) { console.warn('[GI] AO add failed', e); }

    // Volumetric god rays / moon shafts
    let volumetric = null;
    try {
      volumetric = createVolumetricPass();
      volumetric.pass.enabled = isRaysEnabled();
      composer.addPass(volumetric.pass);
    } catch (e) { console.warn('[volumetric] pass failed', e); }

    // Lens flare (additive)
    let lensFlare = null;
    try {
      lensFlare = createLensFlarePass();
      lensFlare.pass.enabled = isFlareEnabled();
      composer.addPass(lensFlare.pass);
    } catch (e) { console.warn('[lensFlare] pass failed', e); }

    composer.addPass(new OutputPass());
    composer.userData.volumetric = volumetric;
    composer.userData.lensFlare = lensFlare;
    composer.userData.aoPass = aoPass;

    // Keep composer in sync with renderer size / DPR
    const onResize = () => composer.setSize(innerWidth, innerHeight);
    addEventListener('resize', onResize);
    if (typeof visualViewport !== 'undefined' && visualViewport) {
      visualViewport.addEventListener('resize', onResize);
    }
    composer.userData._onResize = onResize;
    return composer;
  } catch (err) {
    console.warn('[composer] creation failed — falling back to direct render.', err);
    return null;
  }
}

// Volumetric + lens flare driven by env + camera
export function updateAdvancedEffects(composer, { camera, env, sunWorldPos, moonWorldPos }) {
  if (!composer) return;
  const t = performance.now() * 0.001;
  const nf = env?.nightFactor ?? 0;
  const isDay = env ? !env.isNight : true;

  // Project world light positions to screen (0..1). If behind camera, intensity 0 handles hiding.
  const tmp = new THREE.Vector3();
  function toScreen(worldPos, out) {
    if (!worldPos || !camera) { out.set(0.5, 1.5); return 0; }
    tmp.copy(worldPos).project(camera);
    // behind camera if z >1 or w negative => project still gives large values, check z
    const behind = tmp.z > 1;
    out.set(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
    return behind ? 0 : 1;
  }

  const vol = composer.userData.volumetric;
  const flare = composer.userData.lensFlare;
  if (vol || flare) {
    const sunScreen = new THREE.Vector2();
    const moonScreen = new THREE.Vector2();
    const sunVis = toScreen(sunWorldPos, sunScreen);
    const moonVis = toScreen(moonWorldPos, moonScreen);
    // Choose active light: sun by day, moon by night (lerped)
    const activeIsSun = isDay || nf < 0.4;
    const activePos = activeIsSun ? sunScreen : moonScreen;
    const activeVis = activeIsSun ? sunVis : moonVis;
    const activeColor = new THREE.Color();
    if (activeIsSun) {
      // sun color sampled from env or default warm
      activeColor.setHex(0xfff3e0);
      if (env?.state) {
        // approximate from timeOfDay sampling not needed; keep warm/amber
        if (nf < 0.12) activeColor.setHex(0xffc07a);
      }
    } else {
      activeColor.setHex(0xdce8ff);
    }
    // Toned down: rays were causing hard diagonal ground stripes in 06:49 screenshot.
    // Now subtle — only low sun / night, and ground-faded in shader.
    let volIntensity = 0;
    let flareIntensity = 0;
    if (activeVis) {
      if (activeIsSun) {
        const lowSun = THREE.MathUtils.clamp(1 - (activePos.y - 0.08) * 2.8, 0, 1);
        const horizonBoost = env ? THREE.MathUtils.clamp(1 - Math.abs(((env.timeOfDay - 6) / 12) * Math.PI - Math.PI/2)*0.7 ,0,1) : 0.5;
        volIntensity = 0.22 * lowSun * (0.35 + horizonBoost*0.45) * activeVis;
        flareIntensity = 0.38 * activeVis * THREE.MathUtils.clamp(activePos.y*1.0, 0, 1) * (isDay?1:0.28);
      } else {
        volIntensity = 0.18 * nf * activeVis;
        flareIntensity = 0.30 * nf * activeVis;
      }
      // Weather dims shafts (rain/overcast scatters but also occludes)
      const weather = env?.weather || 'clear';
      if (weather === 'overcast') { volIntensity *= 0.55; flareIntensity *= 0.6; }
      if (weather === 'rain') { volIntensity *= 0.35; flareIntensity *= 0.45; }
      if (weather === 'mist') { volIntensity *= 0.85; flareIntensity *= 0.6; } // mist softens shafts beautifully
    }

    if (vol) {
      vol.update({
        lightPosition: activePos,
        lightColor: activeColor,
        intensity: volIntensity,
        time: t,
        nightFactor: nf,
      });
    }
    if (flare) {
      flare.update({
        lightPosition: activePos,
        lightColor: activeColor,
        intensity: flareIntensity,
        time: t,
        nightFactor: nf,
      });
    }
  }
}

export function disposeComposer(composer) {
  if (!composer) return;
  try {
    if (composer.userData._onResize) removeEventListener('resize', composer.userData._onResize);
    composer.dispose();
  } catch { /* ignore */ }
}
