import * as THREE from 'three';
import { CAMERA, WORLD } from '../config.js';

// Coarse device tier used to scale quality (shadows, pixel ratio, AA).
// Mobile GPUs are fill-rate bound: MSAA + high DPR + PCFSoft shadows kill them.
import { detectDeviceTier, getEffectiveGraphics, getGraphicsState, isAndroidDevice, isIPadDevice, isIPhoneDevice } from './graphics.js';

export const isMobileDevice =
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 820));

// iPadOS 13+ reports as Macintosh — touch points reveal it.
export const isIPadOSDevice =
  typeof navigator !== 'undefined' &&
  (isIPadDevice() || (/Mac/i.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1));

// Apple Silicon Mac heuristic (see graphics.js): fast unified memory, but
// Retina DPR 2 + bloom is still heavy — default to high, not ultra.
export const isAppleSiliconMac =
  typeof navigator !== 'undefined' &&
  /Mac/i.test(navigator.userAgent || '') && !isIPadOSDevice &&
  ((navigator.hardwareConcurrency || 0) >= 8);

// Device tier: low (battery saver) / medium (balanced) / high / ultra.
// Auto preset in graphics.js resolves to one of these at boot.
export const deviceTier = (() => {
  try { return detectDeviceTier(); } catch { return 'medium'; }
})();

// Low tier: old iPhones / small Androids / weak GPUs. Start at DPR ~1.0 with
// no shadow maps and cheap materials instead of starting high and adapting
// down (mobile Safari thermally caps fast and never recovers).
// See docs/perf-iphone11-safari.md.
export const isLowTierDevice =
  deviceTier === 'low' ||
  (typeof navigator !== 'undefined' &&
    (isIPhoneDevice() ||
      (isIPadOSDevice && typeof devicePixelRatio !== 'undefined' && devicePixelRatio >= 2 && Math.min(screen.width, screen.height) < 500) ||
      (isAndroidDevice() &&
        (navigator.deviceMemory <= 4 ||
          (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)))));

export const isMidTierDevice = deviceTier === 'medium';

function shadowSizeForTier() {
  if (deviceTier === 'low') return 512;
  if (deviceTier === 'medium') return 1024;
  return 2048;
}

export const QUALITY = {
  isMobile: isMobileDevice,
  isIPad: isIPadOSDevice,
  isAppleSilicon: isAppleSiliconMac,
  tier: deviceTier,
  low: isLowTierDevice || (isMobileDevice && typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 420),
  mid: isMidTierDevice,
  // Sharp trees need real pixels: DPR capped per tier (low stays 1.0 for
  // fill-rate, medium 1.5, high/ultra up to 2.0 for crisp facets). Multiplied
  // by the graphics resolution slider.
  maxPixelRatio: isLowTierDevice ? 1 : deviceTier === 'medium' ? 1.5 : 2,
  minPixelRatio: isLowTierDevice ? 0.6 : 0.75,
  shadowSize: shadowSizeForTier(),
  shadowMode: isLowTierDevice ? 'off' : deviceTier === 'medium' ? 'low' : 'high',
  shadowsEnabled: !isLowTierDevice,
  // Anisotropy cap for generated material textures (textures.js reads this).
  maxAnisotropy: isLowTierDevice ? 1 : deviceTier === 'medium' ? 4 : 8,
  // Runtime-tunable (mutated by applyGraphicsToRenderer, read by world code).
  resolution: 1,
  viewDistance: deviceTier === 'low' ? 1 : deviceTier === 'ultra' ? 3 : 2,
  vegetationMul: 1,
  animalsMul: 1,
  windSway: !isLowTierDevice,
};

// Apply stored graphics settings to the mutable QUALITY fields + renderer.
// Called at boot and on every settings change (live, no reload).
export function refreshQualityFromGraphics() {
  let g;
  try { g = getEffectiveGraphics(getGraphicsState()); } catch { return; }
  QUALITY.resolution = g.resolution ?? 1;
  QUALITY.viewDistance = g.viewDistance ?? 2;
  QUALITY.vegetationMul = g.vegetation ?? 1;
  QUALITY.animalsMul = g.animals ?? 1;
  QUALITY.windSway = g.windSway !== false && !QUALITY.low;
  const mode = g.shadows || 'off';
  QUALITY.shadowMode = mode;
  QUALITY.shadowsEnabled = mode !== 'off';
  QUALITY.shadowSize = mode === 'ultra' ? 2048 : mode === 'high' ? 2048 : mode === 'low' ? 1024 : 512;
  // DPR cap follows tier, scaled by resolution slider. Low stays 1.0 (tile GPU
  // fill-rate bound); higher tiers allow >1 for sharp canopy facets.
  const tierCap = QUALITY.low ? 1 : QUALITY.tier === 'medium' ? 1.5 : 2;
  QUALITY.maxPixelRatio = Math.max(0.6, tierCap * (g.resolution ?? 1));
}

try { refreshQualityFromGraphics(); } catch { /* boot defaults stand */ }

export function effectivePixelRatio() {
  const dpr = typeof devicePixelRatio !== 'undefined' ? devicePixelRatio || 1 : 1;
  return Math.min(dpr, QUALITY.maxPixelRatio);
}

export function applyGraphicsToRenderer(renderer, sun = null) {
  if (!renderer) return;
  refreshQualityFromGraphics();
  renderer.setPixelRatio(effectivePixelRatio());
  const wantShadows = QUALITY.shadowsEnabled;
  // Toggling shadowMap.enabled at runtime needs materials refreshed once.
  if (renderer.shadowMap.enabled !== wantShadows) {
    renderer.shadowMap.enabled = wantShadows;
    try {
      renderer.shadowMap.needsUpdate = true;
      if (renderer.materials) renderer.materials.needsUpdate = true;
    } catch { /* ignore */ }
  }
  renderer.shadowMap.type = QUALITY.isMobile
    ? THREE.PCFShadowMap
    : THREE.PCFSoftShadowMap;
  if (sun) {
    sun.castShadow = wantShadows;
    try { sun.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize); } catch { /* ignore */ }
    if (sun.shadow.map) {
      try { sun.shadow.map.dispose(); sun.shadow.map = null; } catch { /* ignore */ }
    }
  }
}

// Renderer / Scene / Isometric camera / Lights.
// Returns everything main.js needs to run the frame loop.
export function setupCore(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // Sharp canopy edges need MSAA on desktop. Tile mobile GPUs stay off
    // (fill-rate bound); desktop/Apple Silicon get AA for crisp facets.
    antialias: !isLowTierDevice,
    powerPreference: 'high-performance',
    stencil: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY.maxPixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  // Low tier: skip shadow maps entirely — the depth pass over ~10k instanced
  // vegetation is the single biggest cost on A13 Safari (+10-15fps).
  renderer.shadowMap.enabled = QUALITY.shadowsEnabled;
  // PCFSoft looks slightly nicer but costs more ALU on mobile.
  renderer.shadowMap.type = isMobileDevice ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Slightly brighter for lush jungle — previous 0.95 muted greens on high tier
  renderer.toneMappingExposure = deviceTier === 'high' || deviceTier === 'ultra' ? 1.02 : deviceTier === 'medium' ? 1.08 : 1.12;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(WORLD.fogColor);
  scene.fog = new THREE.Fog(WORLD.fogColor, WORLD.fogNear, WORLD.fogFar);

  // Isometric look via OrthographicCamera.
  const state = {
    frustumSize: CAMERA.frustumSize,
    azimuth: CAMERA.azimuth,
    polarElevation: THREE.MathUtils.degToRad(CAMERA.polarElevationDeg),
  };
  let aspect = innerWidth / innerHeight;
  const camera = new THREE.OrthographicCamera(
    (-state.frustumSize * aspect) / 2,
    (state.frustumSize * aspect) / 2,
    state.frustumSize / 2,
    -state.frustumSize / 2,
    0.1,
    200,
  );
  const camTarget = new THREE.Vector3(0, 0.5, 0);

  function updateCameraPos() {
    const dist = CAMERA.distance;
    const x = Math.cos(state.azimuth) * Math.cos(state.polarElevation) * dist;
    const z = Math.sin(state.azimuth) * Math.cos(state.polarElevation) * dist;
    const y = Math.sin(state.polarElevation) * dist;
    camera.position.set(camTarget.x + x, camTarget.y + y, camTarget.z + z);
    camera.lookAt(camTarget);
  }
  updateCameraPos();

  function onResize() {
    aspect = innerWidth / innerHeight;
    camera.left = (-state.frustumSize * aspect) / 2;
    camera.right = (state.frustumSize * aspect) / 2;
    camera.top = state.frustumSize / 2;
    camera.bottom = -state.frustumSize / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', onResize);
  // Android Chrome: the address bar showing/hiding jumps innerHeight — visualViewport is more accurate.
  if (typeof visualViewport !== 'undefined' && visualViewport) {
    visualViewport.addEventListener('resize', onResize);
  }
  addEventListener('orientationchange', () => setTimeout(onResize, 120));

  // Bright daylight look (driven per-frame by the environment system).
  const hemi = new THREE.HemisphereLight(0xd6f0ff, 0x8fbf6a, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.1);
  sun.position.set(14, 24, 10);
  sun.castShadow = QUALITY.shadowsEnabled;
  sun.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const ambient = new THREE.AmbientLight(0xffffff, 0.32);
  scene.add(ambient);

  return { renderer, scene, camera, camTarget, sun, hemi, ambient, state, updateCameraPos, onResize };
}
