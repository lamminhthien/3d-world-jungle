import * as THREE from 'three';
import { DEFAULT_SEED, ENV, RIVER_HALF, SPEED, WORLD } from './config.js';
import { groundHeight, isOnBridge, obstacles, riverDist } from './utils.js';
import { setupCore } from './core/setup.js';
import { createWorldManager } from './world/chunks.js';
import { createRiver } from './world/river.js';
import { createBridges, removeBridges } from './world/bridge.js';
import { createClouds } from './world/clouds.js';
import { createEnvironment } from './world/environment.js';
import { createFireflies } from './world/fireflies.js';
import { createCampsites } from './world/campfire.js';
import { createPlayer } from './entities/player.js';
import { setupControls } from './input/controls.js';
import { randomSeedString } from './world/noise.js';

// ============ Seed (docs section 4.1): ?seed= in URL, else default ============
const params = new URLSearchParams(location.search);
const initialSeed = params.get('seed') || DEFAULT_SEED;

// ============ Boot ============
const canvas = document.getElementById('scene');
const core = setupCore(canvas);
const { renderer, scene, camera, camTarget, sun, hemi, ambient, state, updateCameraPos } = core;

// Infinite chunked world (docs section 3): ground + biome vegetation stream
// around the player; section 4.5 spawns at (0, ymax, 0).
const world = createWorldManager(scene, initialSeed);
let spawn = world.getSpawn();

const river = createRiver(scene);
let bridgeGroups = createBridges(scene);
const sky = createClouds(scene);

// Day-night cycle + dynamic weather (docs/weather-day-night-cycles.md).
const env = createEnvironment(scene, {
  sun,
  hemi,
  ambient,
  renderer,
  clouds: sky,
  river,
  dayLengthSec: ENV.dayLengthSec,
  startTime: ENV.startTime,
  weatherIntervalSec: ENV.weatherIntervalSec,
  fogNear: WORLD.fogNear,
  fogFar: WORLD.fogFar,
});

const fireflies = createFireflies(scene);
const camps = createCampsites(scene, initialSeed);

const { player, parts } = createPlayer(scene);
player.position.set(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z);
camTarget.set(spawn.x, 0.5, spawn.z);
const { keys, joy } = setupControls(canvas, core);

// ============ Seed UI ============
const seedInput = document.getElementById('seed');
const seedBtn = document.getElementById('newWorld');
const chunkEl = document.getElementById('chunks');
if (seedInput) seedInput.value = initialSeed;

function applySeed(newSeed) {
  spawn = world.regenerate(newSeed);
  removeBridges(scene, bridgeGroups);
  bridgeGroups = createBridges(scene);
  camps.regenerate(newSeed);
  player.position.set(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z);
  camTarget.set(spawn.x, 0.5, spawn.z);
  const url = new URL(location.href);
  url.searchParams.set('seed', newSeed);
  history.replaceState(null, '', url);
  if (seedInput) seedInput.value = newSeed;
}

if (seedBtn) {
  seedBtn.addEventListener('click', () => {
    const v = (seedInput && seedInput.value.trim()) || randomSeedString();
    applySeed(v);
  });
}
if (seedInput) {
  seedInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applySeed(seedInput.value.trim() || randomSeedString());
  });
}

// ============ HUD ============
const posEl = document.getElementById('pos');
const fpsEl = document.getElementById('fps');
let fpsAcc = 0;
let fpsN = 0;
let fpsT = 0;

// ============ Movement + world update ============
let walkTime = 0;
const clock = new THREE.Clock();

function update(dt) {
  let ix = 0;
  let iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  ix += joy.x;
  iz += joy.y;

  const moving = Math.hypot(ix, iz) > 0.1;
  if (moving) {
    // Camera-relative movement on the ground plane.
    const az = state.azimuth;
    const fwd = new THREE.Vector3(-Math.cos(az), 0, -Math.sin(az));
    const right = new THREE.Vector3(Math.sin(az), 0, -Math.cos(az));

    const len = Math.hypot(ix, iz);
    ix /= Math.max(1, len);
    iz /= Math.max(1, len);
    const move = new THREE.Vector3().addScaledVector(fwd, -iz).addScaledVector(right, ix).normalize();

    let nx = player.position.x + move.x * SPEED * dt;
    let nz = player.position.z + move.z * SPEED * dt;

    // Circle collision against trees / rocks / cacti.
    for (const o of obstacles) {
      const dx = nx - o.x;
      const dz = nz - o.z;
      const d = Math.hypot(dx, dz);
      const min = o.r + 0.45;
      if (d < min && d > 1e-4) {
        nx = o.x + (dx / d) * min;
        nz = o.z + (dz / d) * min;
      }
    }
    // Block the winding river (unless on a bridge). No map edge: chunks stream.
    // Simplest stable response: revert to previous position.
    if (riverDist(nx, nz) < RIVER_HALF + 0.5 && !isOnBridge(nx, nz)) {
      nx = player.position.x;
      nz = player.position.z;
    }
    // Safety bound against float precision, far beyond the visible area.
    const r = Math.hypot(nx, nz);
    if (r > 500) {
      nx *= 500 / r;
      nz *= 500 / r;
    }

    player.position.x = nx;
    player.position.z = nz;
    player.rotation.y = Math.atan2(move.x, move.z);

    walkTime += dt * 10;
    const sw = Math.sin(walkTime);
    parts.legL.rotation.x = sw * 0.7;
    parts.legR.rotation.x = -sw * 0.7;
    parts.armL.rotation.x = -sw * 0.6;
    parts.armR.rotation.x = sw * 0.6;
    player.position.y += Math.abs(Math.cos(walkTime)) * 0.02;
  } else {
    // Idle breathing.
    const t = performance.now() * 0.002;
    parts.legL.rotation.x *= 0.8;
    parts.legR.rotation.x *= 0.8;
    parts.armL.rotation.x = Math.sin(t) * 0.06;
    parts.armR.rotation.x = -Math.sin(t) * 0.06;
  }
  player.position.y += (groundHeight(player.position.x, player.position.z) - player.position.y) * Math.min(1, dt * 10);

  // Stream chunks around the player + keep water/foam nearby.
  world.update(player.position.x, player.position.z);
  river.update(dt, player.position);
  sky.update(dt, player.position, clock.elapsedTime);

  // Day-night + weather drive sun/fog/sky (sun follows target for shadows).
  // Fire proximity feeds the crackle ambience + warm/cool contrast logic.
  const fire = camps.getFireProximity(player.position.x, player.position.z);
  env.update(dt, player.position, { fire });

  // Night systems (docs/enhance_for_night_screen.md section 5):
  // timeOfDay -> fireflies on, moon takes over, clouds darken, campfires glow.
  const nf = env.nightFactor;
  fireflies.update(dt, clock.elapsedTime, player.position, env.timeOfDay);
  camps.update(dt, clock.elapsedTime, player.position, nf);

  // Smooth camera follow (sun position itself is set by the environment).
  camTarget.lerp(new THREE.Vector3(player.position.x, 0.5, player.position.z), Math.min(1, dt * 4));
  updateCameraPos();

  if (chunkEl) {
    const s = world.stats();
    chunkEl.textContent = `${s.chunks} chunks · ${s.seed}`;
  }
}

// ============ Loop ============
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  update(dt);
  renderer.render(scene, camera);

  fpsAcc += 1 / Math.max(dt, 1e-4);
  fpsN++;
  fpsT += dt;
  if (fpsT > 0.5) {
    fpsEl.textContent = `${Math.round(fpsAcc / fpsN)} FPS`;
    posEl.textContent = `x: ${player.position.x.toFixed(1)}, z: ${player.position.z.toFixed(1)}`;
    fpsAcc = 0;
    fpsN = 0;
    fpsT = 0;
  }
}
animate();
document.getElementById('loading').classList.add('hidden');
