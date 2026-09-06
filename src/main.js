import * as THREE from 'three';
import { RIVER_HALF, SPAWN, SPEED, WORLD } from './config.js';
import { groundHeight, isOnBridge, obstacles } from './utils.js';
import { setupCore } from './core/setup.js';
import { createGround } from './world/ground.js';
import { createRiver } from './world/river.js';
import { createRocks } from './world/rocks.js';
import { createTrees } from './world/trees.js';
import { createBridges } from './world/bridge.js';
import { createClouds } from './world/clouds.js';
import { createPlayer } from './entities/player.js';
import { setupControls } from './input/controls.js';

// ============ Boot ============
const canvas = document.getElementById('scene');
const core = setupCore(canvas);
const { renderer, scene, camera, camTarget, sun, state, updateCameraPos } = core;
camTarget.set(SPAWN.x, 0.5, SPAWN.z);

createGround(scene);
const river = createRiver(scene);
createRocks(scene);
createTrees(scene);
createBridges(scene);
const sky = createClouds(scene);

const { player, parts } = createPlayer(scene);
const { keys, joy } = setupControls(canvas, core);

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

    // Circle collision against trees / rocks.
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
    // Block the river (unless on a bridge) + clamp to map bounds.
    if (Math.abs(nx) < RIVER_HALF + 0.5 && !isOnBridge(nz)) {
      nx = Math.sign(nx || 1) * (RIVER_HALF + 0.5);
    }
    const r = Math.hypot(nx, nz);
    if (r > WORLD.playRadius) {
      nx *= WORLD.playRadius / r;
      nz *= WORLD.playRadius / r;
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

  river.update(dt);
  sky.update(dt);

  // Smooth camera follow + sun follows target for stable shadows.
  camTarget.lerp(new THREE.Vector3(player.position.x, 0.5, player.position.z), Math.min(1, dt * 4));
  sun.position.set(camTarget.x + 14, 24, camTarget.z + 10);
  sun.target.position.copy(camTarget);
  sun.target.updateMatrixWorld();
  updateCameraPos();
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
