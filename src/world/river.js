import * as THREE from 'three';
import { FOAM_COUNT, RIVER_HALF } from '../config.js';
import { QUALITY } from '../core/setup.js';
import { rand } from '../utils.js';
import { riverXAt } from './procedural.js';
import { getWaterBump, getWaterTexture } from './textures.js';

// Winding river: one large water plane follows the player (the carved channel
// dips below y=-0.32 so water only shows inside the riverbed). Foam streaks
// drift downstream and respawn inside the channel near the player.
export function createRiver(scene) {
  const waterDetail = getWaterTexture();
  const waterBump = getWaterBump();
  // Low tier: opaque Lambert, no bump. A fullscreen transparent Standard
  // plane is pure overdraw on a tiled GPU; opaque lets it early-z against
  // the terrain (which sits above y=-0.32 outside the channel anyway).
  const waterMat = QUALITY.low
    ? new THREE.MeshLambertMaterial({ color: 0x3da9c4, map: waterDetail })
    : new THREE.MeshStandardMaterial({
      color: 0x3da9c4,
      map: waterDetail,
      bumpMap: waterBump,
      bumpScale: 0.05,
      roughness: 0.25,
      metalness: 0.05,
      transparent: true,
      opacity: 0.92,
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
  const foamGeo = new THREE.PlaneGeometry(0.28, 0.7);
  foamGeo.rotateX(-Math.PI / 2);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.4 });
  const foamMesh = new THREE.InstancedMesh(foamGeo, foamMat, FOAM_COUNT);
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

  function update(dt, focus) {
    const fx = focus ? focus.x : 0;
    const fz = focus ? focus.z : 0;
    water.position.x = fx;
    water.position.z = fz;
    // Flow the surface grain downstream (+z) so the river visibly streams.
    waterDetail.offset.y -= dt * 0.08;
    waterBump.offset.y -= dt * 0.08;
    waterDetail.offset.x = Math.sin(performance.now() * 0.0002) * 0.02;
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

  return { water, foams: foamMesh, update };
}

export { RIVER_HALF };
