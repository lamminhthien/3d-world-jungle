import * as THREE from 'three';
import { CAMERA, WORLD } from '../config.js';

// Coarse device tier used to scale quality (shadows, pixel ratio, AA).
// Mobile GPUs are fill-rate bound: MSAA + high DPR + PCFSoft shadows kill them.
export const isMobileDevice =
  typeof navigator !== 'undefined' &&
  (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820));

export const QUALITY = {
  isMobile: isMobileDevice,
  // Desktop keeps crisp 2x; mobile caps at 1.5 (huge fill-rate win).
  maxPixelRatio: isMobileDevice ? 1.5 : 2,
  minPixelRatio: 1,
  shadowSize: isMobileDevice ? 1024 : 2048,
};

// Renderer / Scene / Isometric camera / Lights.
// Returns everything main.js needs to run the frame loop.
export function setupCore(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    // MSAA 4x is expensive on tiled mobile GPUs — off there, on for desktop.
    antialias: !isMobileDevice,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, QUALITY.maxPixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  // PCFSoft looks slightly nicer but costs more ALU on mobile.
  renderer.shadowMap.type = isMobileDevice ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

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
  const hemi = new THREE.HemisphereLight(0xcdeffd, 0x8a9a6b, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
  sun.position.set(14, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);

  return { renderer, scene, camera, camTarget, sun, hemi, ambient, state, updateCameraPos, onResize };
}
