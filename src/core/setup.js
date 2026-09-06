import * as THREE from 'three';
import { CAMERA, WORLD } from '../config.js';

// Renderer / Scene / Isometric camera / Lights.
// Returns everything main.js needs to run the frame loop.
export function setupCore(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

  // Bright daylight look (driven per-frame by the environment system).
  const hemi = new THREE.HemisphereLight(0xcdeffd, 0x7ec850, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.9);
  sun.position.set(14, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);
  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);

  return { renderer, scene, camera, camTarget, sun, hemi, ambient, state, updateCameraPos, onResize };
}
