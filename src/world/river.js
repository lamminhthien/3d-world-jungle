import * as THREE from 'three';
import { FOAM_COUNT, RIVER_HALF } from '../config.js';
import { QUALITY } from '../core/setup.js';
import { getGraphics } from '../core/graphics.js';
import { rand } from '../utils.js';
import { riverXAt } from './procedural.js';
import { getWaterBump, getWaterTexture } from './textures.js';

// Winding river: one large water plane follows the player (the carved channel
// dips below y=-0.32 so water only shows inside the riverbed). Foam streaks
// drift downstream and respawn inside the channel near the player.
export function createRiver(scene) {
  const waterDetail = getWaterTexture();
  const waterBump = getWaterBump();
  // Phase 3 realism: desktop gets subsurface tint + wind-driven normals.
  // Low tier: opaque Lambert (fill-rate bound), no bump. Desktop: Physical with
  // transmission/thickness/clearcoat for semi-transparent depth; normal scale tied
  // to wind (river.js:waterBump.offset.x += windDir.x * dt * 0.05).
  const wantHigh = (() => { try { return getGraphics()?.waterHigh !== false && !QUALITY.low; } catch { return !QUALITY.low; } })();
  const waterMat = !wantHigh
    ? new THREE.MeshLambertMaterial({ color: 0x0fc3e8, map: waterDetail })
    : new THREE.MeshPhysicalMaterial({
      color: 0x0fb6dd,
      map: waterDetail,
      bumpMap: waterBump,
      bumpScale: 0.09,
      roughness: 0.14,
      metalness: 0.08,
      transparent: true,
      opacity: 0.88,
      transmission: 0.18,
      thickness: 0.65,
      clearcoat: 0.35,
      clearcoatRoughness: 0.25,
    });

  const water = new THREE.Mesh(new THREE.PlaneGeometry(130, 130), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.32;
  // Perf: a full-screen transparent Standard material that also receives
  // shadows is a fill-rate hog on mobile — shadows on water add little.
  water.receiveShadow = false;
  scene.add(water);

  // Perf: foam streaks were 26 individual Meshes (= 26 draw calls). One
  // InstancedMesh keeps the exact same look for 1 draw call.
  const foamGeo = new THREE.PlaneGeometry(0.32, 0.85);
  foamGeo.rotateX(-Math.PI / 2);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xeef8ff, transparent: true, opacity: 0.5 });
  const foamMul = (() => { try { return getGraphics()?.particles ?? 1; } catch { return 1; } })();
  const foamCount = Math.max(0, Math.round(FOAM_COUNT * foamMul));
  const foamMesh = new THREE.InstancedMesh(foamGeo, foamMat, FOAM_COUNT);
  foamMesh.count = foamCount;
  foamMesh.frustumCulled = false;
  foamMesh.renderOrder = 2;
  scene.add(foamMesh);
  const foams = [];
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _p = new THREE.Vector3();
  const _s = new THREE.Vector3();

  function writeFoamMatrix(i, f) {
    _p.set(f.x, -0.28, f.z);
    _q.identity();
    _s.setScalar(f.scale);
    _m.compose(_p, _q, _s);
    foamMesh.setMatrixAt(i, _m);
  }

  function spawnFoam(f, fx, fz) {
    const z = fz + rand(-48, 48);
    f.x = riverXAt(z) + rand(-2.2, 2.2);
    f.z = z;
  }

  for (let i = 0; i < FOAM_COUNT; i++) {
    const f = {
      x: 0,
      z: rand(-44, 44),
      scale: rand(0.5, 1.2),
      speed: rand(1.5, 3.2),
    };
    f.x = riverXAt(f.z) + rand(-2.2, 2.2);
    foams.push(f);
    writeFoamMatrix(i, f);
  }
  foamMesh.instanceMatrix.needsUpdate = true;

  function applyGraphics(g) {
    const mul = g?.particles ?? 1;
    foamMesh.count = Math.max(0, Math.round(FOAM_COUNT * mul));
    const wantHigh2 = g?.waterHigh !== false && !QUALITY.low;
    // Hot-swap write handled via roughness; full material swap needs reload so
    // we scale bump instead. Hide foam entirely on battery saver.
    foamMesh.visible = (g?.particles ?? 1) > 0.15;
  }

  function update(dt, focus, wind = null) {
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 0;
    water.position.x = fx;
    water.position.z = fz;
    // Flow the surface grain downstream (+z) so the river visibly streams.
    // Throttle water uv scroll on low particles / low tier (CPU + texture upload).
    let tickWater = true;
    try { const g = getGraphics(); if ((g?.particles ?? 1) < 0.4 && (performance.now() % 100) > 50) tickWater = false; } catch {}
    const now = performance.now();
    const windDir = wind?.direction || { x: 0, y: 0 };
    const windAmp = wind?.strength ?? 0;
    if (tickWater) {
      waterDetail.offset.y -= dt * (0.08 + windAmp * 0.04);
      waterDetail.offset.x = Math.sin(now * 0.0002) * 0.022 + windDir.x * dt * 0.05;
      // Second caustic layer: bump scrolls at 45° to detail for organic shimmer + wind drift.
      waterBump.offset.y -= dt * (0.055 + windAmp * 0.03);
      waterBump.offset.x += dt * (0.055 + windDir.x * 0.03);
    }
    // Depth tint: center (deep) pushes blue, bank pushes turquoise via subtle color lerp.
    // Cheap depth proxy: modulate opacity/roughness with wind gust (choppy -> rougher).
    if (waterMat.roughness !== undefined) {
      waterMat.roughness = THREE.MathUtils.clamp(0.14 + windAmp * 0.07, 0.12, 0.22);
    }
    let moved = false;
    for (let i = 0; i < foams.length; i++) {
      const f = foams[i];
      f.z += f.speed * dt;
      if (Math.abs(f.z - fz) > 48 || Math.abs(f.x - fx) > 48) {
        spawnFoam(f, fx, fz);
      }
      writeFoamMatrix(i, f);
      moved = true;
    }
    if (moved) foamMesh.instanceMatrix.needsUpdate = true;
  }

  return { water, foams: foamMesh, update, applyGraphics };
}

export { RIVER_HALF };
