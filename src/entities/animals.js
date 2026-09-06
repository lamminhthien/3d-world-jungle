// animals.js — Low-poly animated animals: birds, deer, fish.
// All use InstancedMesh for performance (1 draw call each).
// Animations are pure sine-wave math — no skeleton, no assets.

import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';
import { groundHeight } from '../utils.js';
import { riverXAt } from '../world/procedural.js';

// ---- Helper ----
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _axis = new THREE.Vector3(0, 1, 0);

function compose(px, py, pz, ry, sx, sy, sz) {
  _p.set(px, py, pz);
  _e.set(0, ry, 0);
  _q.setFromEuler(_e);
  _s.set(sx, sy, sz);
  return _m.compose(_p, _q, _s);
}

// ============================================================
// BIRDS
// ============================================================
const BIRD_COUNT = QUALITY.low ? 12 : 22;

function buildBirdWingGeo() {
  // Single flat diamond "wing" centred at origin, swept up/down in update.
  const geo = new THREE.BufferGeometry();
  // Two triangles forming a thin diamond (width 1.0, depth 0.4)
  const verts = new Float32Array([
    // left wing
    0, 0, 0,   -0.5, 0, 0.1,   -0.15, 0.05, -0.2,
    // right wing
    0, 0, 0,    0.5, 0, 0.1,    0.15, 0.05, -0.2,
    // body stub
    0, 0, 0,    0, 0, 0.25,     0, 0.04, -0.05,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.computeVertexNormals();
  return geo;
}

export function createBirds(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0x2c1e0f, side: THREE.DoubleSide });
  const geo = buildBirdWingGeo();
  const mesh = new THREE.InstancedMesh(geo, mat, BIRD_COUNT);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  scene.add(mesh);

  // Each bird: position, orbit radius, orbit speed, phase, altitude, flapPhase
  const birds = [];
  for (let i = 0; i < BIRD_COUNT; i++) {
    const angle = (i / BIRD_COUNT) * Math.PI * 2;
    const radius = 8 + Math.random() * 18;
    birds.push({
      cx: (Math.random() - 0.5) * 30,     // flock centre X
      cz: (Math.random() - 0.5) * 30,     // flock centre Z
      angle,
      radius,
      orbitSpeed: 0.3 + Math.random() * 0.4,
      altitude: 10 + Math.random() * 12,
      flapPhase: Math.random() * Math.PI * 2,
      flapSpeed: 3 + Math.random() * 3,
      scale: 0.35 + Math.random() * 0.2,
    });
  }

  let t = 0;
  function update(dt, playerPos) {
    t += dt;
    // Slowly drift flock centres toward the player
    for (let i = 0; i < birds.length; i++) {
      const b = birds[i];
      const dx = playerPos.x - b.cx;
      const dz = playerPos.z - b.cz;
      const dDist = Math.sqrt(dx * dx + dz * dz);
      if (dDist > 35) {
        b.cx += dx * dt * 0.05;
        b.cz += dz * dt * 0.05;
      }
      b.angle += b.orbitSpeed * dt;

      const bx = b.cx + Math.cos(b.angle) * b.radius;
      const bz = b.cz + Math.sin(b.angle) * b.radius;
      const by = b.altitude + Math.sin(t * 0.4 + b.flapPhase) * 0.8;

      // Wing flap: rotate slightly around Z axis
      const flap = Math.sin(t * b.flapSpeed + b.flapPhase) * 0.4;
      const headingY = b.angle + Math.PI * 0.5;

      _p.set(bx, by, bz);
      _e.set(flap, headingY, 0);
      _q.setFromEuler(_e);
      _s.setScalar(b.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
}

// ============================================================
// DEER  (simple low-poly quadruped)
// ============================================================
const DEER_COUNT = QUALITY.low ? 3 : 6;

function buildDeerGeo() {
  // Body: stretched box + 4 legs cylinders + head box, merged into one geometry.
  const parts = [];

  // Body
  parts.push(new THREE.BoxGeometry(0.55, 0.35, 0.9));

  // Head (translated forward + up)
  const head = new THREE.BoxGeometry(0.28, 0.28, 0.32);
  head.translate(0, 0.22, 0.52);
  parts.push(head);

  // Neck
  const neck = new THREE.BoxGeometry(0.16, 0.25, 0.16);
  neck.translate(0, 0.12, 0.38);
  parts.push(neck);

  // 4 legs
  const legPositions = [
    [-0.18, -0.34, -0.28],
    [ 0.18, -0.34, -0.28],
    [-0.18, -0.34,  0.22],
    [ 0.18, -0.34,  0.22],
  ];
  for (const [lx, ly, lz] of legPositions) {
    const leg = new THREE.BoxGeometry(0.1, 0.35, 0.1);
    leg.translate(lx, ly, lz);
    parts.push(leg);
  }

  // Merge all into one geometry using BufferGeometryUtils pattern
  // (manual merge — no import needed)
  let totalVerts = 0;
  let totalIdx = 0;
  for (const p of parts) {
    totalVerts += p.attributes.position.count;
    if (p.index) totalIdx += p.index.count;
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const indices = [];
  let vOffset = 0;
  let iOffset = 0;

  for (const p of parts) {
    const srcPos = p.attributes.position.array;
    const srcNorm = p.attributes.normals ? p.attributes.normals.array : null;
    positions.set(srcPos, vOffset * 3);
    if (srcNorm) normals.set(srcNorm, vOffset * 3);
    if (p.index) {
      for (let k = 0; k < p.index.count; k++) {
        indices.push(p.index.array[k] + vOffset);
      }
    }
    vOffset += p.attributes.position.count;
    iOffset += p.index ? p.index.count : 0;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (indices.length) geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function createDeer(scene) {
  const deerGeo = buildDeerGeo();
  const deerMat = new THREE.MeshLambertMaterial({ color: 0x8b5e3c, flatShading: true });
  const mesh = new THREE.InstancedMesh(deerGeo, deerMat, DEER_COUNT);
  mesh.frustumCulled = false;
  mesh.castShadow = QUALITY.shadowsEnabled;
  scene.add(mesh);

  const deer = [];
  for (let i = 0; i < DEER_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    deer.push({
      x: (Math.random() - 0.5) * 40,
      z: (Math.random() - 0.5) * 40,
      ry: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 0.8,
      phase: Math.random() * Math.PI * 2,
      wanderTimer: 2 + Math.random() * 6,
      wanderAngle: Math.random() * Math.PI * 2,
      scale: 0.7 + Math.random() * 0.3,
      state: 'idle', // 'idle' | 'walk'
      idleTimer: 1 + Math.random() * 3,
    });
  }

  let t = 0;
  function update(dt, playerPos) {
    t += dt;
    for (let i = 0; i < deer.length; i++) {
      const d = deer[i];

      // State machine: idle ↔ walk
      if (d.state === 'idle') {
        d.idleTimer -= dt;
        if (d.idleTimer <= 0) {
          d.state = 'walk';
          d.wanderAngle = Math.random() * Math.PI * 2;
          d.wanderTimer = 2 + Math.random() * 5;
        }
      } else {
        d.wanderTimer -= dt;
        if (d.wanderTimer <= 0) {
          d.state = 'idle';
          d.idleTimer = 1 + Math.random() * 4;
        }
        // Walk forward
        const nx = d.x + Math.cos(d.wanderAngle) * d.speed * dt;
        const nz = d.z + Math.sin(d.wanderAngle) * d.speed * dt;
        // Don't walk into river
        const rd = Math.abs(nx - riverXAt(nz));
        if (rd > 4) {
          d.x = nx;
          d.z = nz;
        } else {
          d.wanderAngle += Math.PI; // turn around
        }
        d.ry = d.wanderAngle + Math.PI / 2;
        // Stay near player
        const dx = d.x - playerPos.x;
        const dz = d.z - playerPos.z;
        if (dx * dx + dz * dz > 60 * 60) {
          // Teleport to near player when too far
          const a = Math.random() * Math.PI * 2;
          const r = 20 + Math.random() * 20;
          d.x = playerPos.x + Math.cos(a) * r;
          d.z = playerPos.z + Math.sin(a) * r;
        }
      }

      const groundY = groundHeight(d.x, d.z);
      // Leg bob animation
      const bob = d.state === 'walk' ? Math.abs(Math.sin(t * 4 + d.phase)) * 0.05 : 0;
      const py = groundY + 0.35 * d.scale + bob;

      _p.set(d.x, py, d.z);
      _e.set(0, d.ry, 0);
      _q.setFromEuler(_e);
      _s.setScalar(d.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
}

// ============================================================
// FISH (animated near river surface)
// ============================================================
const FISH_COUNT = QUALITY.low ? 6 : 14;

function buildFishGeo() {
  // Simple diamond body + triangle tail
  const geo = new THREE.BufferGeometry();
  const verts = new Float32Array([
    // body diamond
     0,    0, 0.35,   // nose
    -0.12, 0.06, 0,   // top-left
     0.12, 0.06, 0,   // top-right
     0,   -0.06, 0,   // bottom

    // tail
     0,    0.07, -0.22,
    -0.14, 0,    -0.22,
     0.14, 0,    -0.22,
     0,   -0.07, -0.22,
  ]);
  const idx = [
    0, 1, 3,  0, 3, 2,  0, 2, 1,  // body
    4, 5, 6,  4, 6, 7,              // tail top/bot
  ];
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function createFish(scene) {
  const fishGeo = buildFishGeo();
  const fishMat = new THREE.MeshLambertMaterial({ color: 0xff7043, flatShading: true, transparent: true, opacity: 0.85 });
  const mesh = new THREE.InstancedMesh(fishGeo, fishMat, FISH_COUNT);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  scene.add(mesh);

  const fish = [];
  for (let i = 0; i < FISH_COUNT; i++) {
    const pz = (Math.random() - 0.5) * 60;
    fish.push({
      z: pz,
      x: riverXAt(pz) + (Math.random() - 0.5) * 3,
      ry: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.2,
      scale: 0.3 + Math.random() * 0.2,
      waveAmp: 0.8 + Math.random() * 1.2,
    });
  }

  let t = 0;
  function update(dt, playerPos) {
    t += dt;
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      // Swim along river: drift in Z
      f.z += f.speed * dt;
      // Follow river X centre with a side-to-side wobble
      const riverX = riverXAt(f.z);
      f.x += (riverX - f.x) * dt * 2;
      f.x += Math.sin(t * f.waveAmp + f.phase) * 0.8 * dt;

      // Facing direction: tangent of swim path
      f.ry = Math.atan2(
        Math.sin(t * f.waveAmp + f.phase) * f.waveAmp * 0.8,
        f.speed
      );

      // Stay near player
      const dz = f.z - playerPos.z;
      if (Math.abs(dz) > 55) {
        f.z = playerPos.z + (Math.random() - 0.5) * 30;
        f.x = riverXAt(f.z) + (Math.random() - 0.5) * 2;
      }

      const py = -0.15 + Math.sin(t * 1.5 + f.phase) * 0.04; // near water surface

      _p.set(f.x, py, f.z);
      _e.set(0, f.ry, 0);
      _q.setFromEuler(_e);
      _s.setScalar(f.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update };
}

// ============================================================
// COMBINED FACTORY
// ============================================================
export function createAnimals(scene) {
  const birds = createBirds(scene);
  const deer = createDeer(scene);
  const fish = createFish(scene);

  return {
    update(dt, playerPos) {
      birds.update(dt, playerPos);
      deer.update(dt, playerPos);
      fish.update(dt, playerPos);
    },
  };
}
