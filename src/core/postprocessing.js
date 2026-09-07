// Bloom composer — Phase 6 docs/realism-upgrade-plan.md §6.2 P2
// Desktop only. Low tier never creates composer (keeps direct renderer.render).
// Stack: RenderPass → UnrealBloomPass (0.35, 0.4, 0.85) → OutputPass
// Sources: sun/moon halos (MeshBasic), campfire PointLights, emissive fruits/flowers
// Toggle persisted to localStorage; auto-off when FPS <50 for 2 votes.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY } from './setup.js';

const STORAGE_KEY = 'jungle_bloom';
const BLOOM_STRENGTH = 0.90;
const BLOOM_RADIUS = 0.55;
const BLOOM_THRESHOLD = 0.48;

// Query param `?bloom=1` forces bloom on for testing; `?bloom=0` forces off.
function bloomOverride() {
  try {
    const v = new URLSearchParams(location.search).get('bloom');
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* no location */ }
  return null;
}

export function isBloomEnabled() {
  const ov = bloomOverride();
  if (ov !== null) return ov && !QUALITY.low;
  if (QUALITY.low) return false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === '0') return false;
    if (stored === '1') return true;
  } catch { /* storage unavailable */ }
  return true; // default on for desktop
}

export function setBloomEnabled(on) {
  try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch { /* ignore */ }
}

export function createComposer(renderer, scene, camera) {
  if (QUALITY.low) return null;
  if (!isBloomEnabled()) return null;
  try {
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD
    );
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    composer.userData.bloomPass = bloomPass;

    // Keep composer in sync with renderer size / DPR
    const onResize = () => composer.setSize(innerWidth, innerHeight);
    addEventListener('resize', onResize);
    if (typeof visualViewport !== 'undefined' && visualViewport) {
      visualViewport.addEventListener('resize', onResize);
    }
    composer.userData._onResize = onResize;
    return composer;
  } catch (err) {
    console.warn('[bloom] composer creation failed — falling back to direct render.', err);
    return null;
  }
}

export function updateBloomForEnvironment(composer, env) {
  if (!composer?.userData?.bloomPass || !env) return;
  // Tie bloom strength to night + fire: day 0.85 baseline, night + fire pushes to ~1.1 (visible)
  const nf = env.nightFactor || 0;
  // Fire proximity is not yet threaded; use nightFactor as proxy for fire glow at night
  const strength = THREE.MathUtils.clamp(BLOOM_STRENGTH + nf * 0.32, 0.75, 1.15);
  composer.userData.bloomPass.strength = strength;
  composer.userData.bloomPass.radius = BLOOM_RADIUS;
  composer.userData.bloomPass.threshold = BLOOM_THRESHOLD;
}

export function disposeComposer(composer) {
  if (!composer) return;
  try {
    if (composer.userData._onResize) removeEventListener('resize', composer.userData._onResize);
    composer.dispose();
  } catch { /* ignore */ }
}
