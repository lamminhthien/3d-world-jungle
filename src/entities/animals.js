// animals.js — Minecraft-style voxel animals: birds, deer, fish, butterflies,
// crabs, boars, dragonflies, bats + NEW chickens & sheep.
// Perf: 1 InstancedMesh per species (10 draw calls total), merged voxel
// geometry with vertex colors, opaque materials unless fading, staggered
// ground/river queries, frame-sliced heavy AI, early-out when hidden.

import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';
import { groundHeight } from '../utils.js';
import { riverXAt } from '../world/procedural.js';
import { ANIMALS } from '../config.js';

// ---- Shared scratch (no per-frame allocs) ----
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const _c = new THREE.Color();

// Variable-animal registry: every species + its config key. UI / testMode can
// iterate this instead of hardcoding species. `createAnimals(scene, { only })`
// can spawn a subset.
export const ANIMAL_TYPES = [
  'birds', 'deer', 'fish', 'butterflies', 'crabs',
  'boars', 'dragonflies', 'bats', 'chickens', 'sheep',
];

const FALLBACK_COUNT = {
  birds: 22, deer: 6, fish: 14, butterflies: 18, crabs: 10,
  boars: 4, dragonflies: 10, bats: 9, chickens: 8, sheep: 6,
};
const FALLBACK_MIN = {
  birds: 4, deer: 1, fish: 2, butterflies: 2, crabs: 2,
  boars: 1, dragonflies: 2, bats: 2, chickens: 2, sheep: 1,
};
const CONFIG_KEY = {
  birds: 'birdCount', deer: 'deerCount', fish: 'fishCount',
  butterflies: 'butterflyCount', crabs: 'crabCount', boars: 'boarCount',
  dragonflies: 'dragonflyCount', bats: 'batCount',
  chickens: 'chickenCount', sheep: 'sheepCount',
};

/** Base (full-quality) count for a species — always reads ANIMALS config. */
export function baseAnimalCount(type) {
  return ANIMALS[CONFIG_KEY[type]] ?? FALLBACK_COUNT[type] ?? 6;
}

/** Max instances to preallocate: headroom for animalsMul > 1 sliders. */
export function maxAnimalCount(type) {
  return Math.ceil(baseAnimalCount(type) * 1.6) + 2;
}

/** Live count after quality scaling. Cheap — call on applyDensity only. */
export function liveAnimalCount(type) {
  const mul = QUALITY.animalsMul ?? 1;
  const base = QUALITY.low
    ? Math.ceil(baseAnimalCount(type) * 0.5)
    : baseAnimalCount(type);
  return Math.min(
    maxAnimalCount(type),
    Math.max(FALLBACK_MIN[type] ?? 1, Math.round(base * mul)),
  );
}

// ============================================================
// Voxel builder — Minecraft look via merged boxes + vertex colors.
// One geometry per species, non-indexed (tiny: <500 verts), no UVs.
// boxes: [w,h,d, x,y,z, hex], tris: [{ p:[9 nums], c:hex }]
// ============================================================
function buildVoxelGeo(boxes, tris = null) {
  const pos = [];
  const nor = [];
  const col = [];
  const tmp = new THREE.Color();

  for (let i = 0; i < boxes.length; i++) {
    const [w, h, d, x, y, z, hex] = boxes[i];
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    const ng = g.toNonIndexed();
    const pa = ng.attributes.position.array;
    const na = ng.attributes.normal.array;
    tmp.setHex(hex);
    for (let v = 0; v < pa.length; v += 3) {
      pos.push(pa[v], pa[v + 1], pa[v + 2]);
      nor.push(na[v], na[v + 1], na[v + 2]);
      col.push(tmp.r, tmp.g, tmp.b);
    }
    g.dispose();
    ng.dispose();
  }

  if (tris) {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const ab = new THREE.Vector3();
    const ac = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < tris.length; i++) {
      const t = tris[i];
      const p = t.p;
      a.set(p[0], p[1], p[2]);
      b.set(p[3], p[4], p[5]);
      c.set(p[6], p[7], p[8]);
      ab.subVectors(b, a);
      ac.subVectors(c, a);
      n.crossVectors(ab, ac).normalize();
      if (n.y < 0 && t.up !== false) n.negate(); // wings face up
      tmp.setHex(t.c);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      for (let k = 0; k < 3; k++) nor.push(n.x, n.y, n.z);
      for (let k = 0; k < 3; k++) col.push(tmp.r, tmp.g, tmp.b);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geo.computeBoundingSphere();
  return geo;
}

function voxelMat({ doubleSide = false, transparent = false, opacity = 1 } = {}) {
  return new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    transparent,
    opacity,
  });
}

function makeHerdMesh(geo, mat, capacity, shadow = false) {
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = shadow;
  mesh.receiveShadow = false;
  return mesh;
}

// Staggered ground probe: walking animals refresh fast, idle ones rarely.
// Returns cached height; mutates `o` (_gy/_gyT).
function probeGround(o, x, z, dt, walkRate, idleRate) {
  o._gyT -= dt;
  if (o._gyT <= 0) {
    o._gy = groundHeight(x, z);
    o._gyT = walkRate;
    return o._gy;
  }
  return o._gy;
}
function probeGroundState(o, x, z, dt, walking) {
  return probeGround(o, x, z, dt, walking ? 0.3 : 1.0);
}

// Cached river centre: riverXAt is ~9 noise evals — refresh at ~4Hz per
// animal and lerp toward it instead of calling it every frame.
function probeRiver(o, z, dt) {
  o._rxT -= dt;
  if (o._rxT <= 0 || o._rx === undefined) {
    o._rx = riverXAt(z);
    o._rxT = 0.25;
  }
  return o._rx;
}

function lerpOpacity(mat, target, dt, speed = 1.2) {
  const cur = mat.opacity;
  if (cur === target) return cur;
  const v = cur + (target - cur) * Math.min(1, dt * speed);
  mat.opacity = Math.abs(v - target) < 0.005 ? target : v;
  return mat.opacity;
}

// ============================================================
// BIRDS — blocky voxel glider: cube body + head + beak + flat wings
// ============================================================
function buildBirdGeo() {
  return buildVoxelGeo(
    [
      // body, belly, head, beak, tail
      [0.24, 0.18, 0.38, 0, 0, 0, 0x3d3d4a],
      [0.20, 0.06, 0.30, 0, -0.10, 0.02, 0xd8d8e2],
      [0.20, 0.18, 0.20, 0, 0.14, 0.22, 0x3d3d4a],
      [0.08, 0.06, 0.10, 0, 0.12, 0.36, 0xf2a541],
      [0.16, 0.05, 0.18, 0, 0.02, -0.26, 0x2b2b34],
    ],
    [
      // left / right wings — thin flat diamonds (flap faked via roll)
      { p: [0, 0.04, 0.08, -0.62, 0.04, -0.02, -0.18, 0.04, -0.16], c: 0x2b2b34 },
      { p: [0, 0.04, 0.08, 0.62, 0.04, -0.02, 0.18, 0.04, -0.16], c: 0x2b2b34 },
    ],
  );
}

export function createBirds(scene) {
  const geo = buildBirdGeo();
  const mat = voxelMat({ doubleSide: true }); // opaque — lifecycle uses visible
  const cap = maxAnimalCount('birds');
  const mesh = makeHerdMesh(geo, mat, cap, false);
  mesh.count = liveAnimalCount('birds');
  scene.add(mesh);

  const birds = [];
  for (let i = 0; i < cap; i++) {
    const angle = (i / cap) * Math.PI * 2;
    birds.push({
      cx: (Math.random() - 0.5) * 30,
      cz: (Math.random() - 0.5) * 30,
      angle,
      radius: 8 + Math.random() * 18,
      orbitSpeed: 0.3 + Math.random() * 0.4,
      altitude: 10 + Math.random() * 12,
      flapPhase: Math.random() * Math.PI * 2,
      flapSpeed: 3 + Math.random() * 3,
      scale: 0.9 + Math.random() * 0.5,
    });
  }

  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('birds'); }
  // target 0..1 activity; hidden => mesh invisible, update skipped
  let activity = 1;
  function update(dt, playerPos) {
    if (!mesh.visible || mesh.count === 0 || activity <= 0.02) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const b = birds[i];
      const dx = playerPos.x - b.cx;
      const dz = playerPos.z - b.cz;
      if (dx * dx + dz * dz > 35 * 35) {
        b.cx += dx * dt * 0.05;
        b.cz += dz * dt * 0.05;
      }
      b.angle += b.orbitSpeed * dt;

      const bx = b.cx + Math.cos(b.angle) * b.radius;
      const bz = b.cz + Math.sin(b.angle) * b.radius;
      const by = b.altitude + Math.sin(t * 0.4 + b.flapPhase) * 0.8;

      const flap = Math.sin(t * b.flapSpeed + b.flapPhase) * 0.45;
      _p.set(bx, by, bz);
      _e.set(flap * 0.4, b.angle + Math.PI * 0.5, flap);
      _q.setFromEuler(_e);
      // wing-beat squash gives flap illusion with a single rigid mesh
      _s.set(b.scale, b.scale * (1 + flap * 0.18), b.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity, setActivity(v) { activity = v; } };
}

// ============================================================
// DEER — Minecraft deer: big cube head, ears, antlers, spot patches
// ============================================================
function buildDeerGeo() {
  return buildVoxelGeo([
    [0.55, 0.40, 0.95, 0, 0.05, 0, 0x8b5e3c],      // torso
    [0.45, 0.12, 0.75, 0, -0.14, 0, 0xd9b48f],     // belly
    [0.30, 0.10, 0.50, -0.12, 0.28, -0.05, 0xf2e8dc], // back patch L
    [0.30, 0.10, 0.50, 0.12, 0.28, -0.05, 0xf2e8dc],  // back patch R
    [0.18, 0.30, 0.18, 0, 0.32, 0.48, 0x8b5e3c],   // neck
    [0.32, 0.32, 0.34, 0, 0.58, 0.58, 0x8b5e3c],   // head (big minecraft cube)
    [0.18, 0.14, 0.10, 0, 0.50, 0.78, 0x5d3d24],   // snout
    [0.05, 0.05, 0.03, -0.07, 0.56, 0.83, 0x1a1a1a], // nostril L
    [0.05, 0.05, 0.03, 0.07, 0.56, 0.83, 0x1a1a1a],  // nostril R
    [0.07, 0.07, 0.02, -0.10, 0.64, 0.74, 0x1a1a1a], // eye L
    [0.07, 0.07, 0.02, 0.10, 0.64, 0.74, 0x1a1a1a],  // eye R
    [0.10, 0.16, 0.06, -0.22, 0.72, 0.52, 0x8b5e3c], // ear L
    [0.10, 0.16, 0.06, 0.22, 0.72, 0.52, 0x8b5e3c],  // ear R
    [0.06, 0.22, 0.06, -0.16, 0.90, 0.48, 0xe8dcc0], // antler L
    [0.06, 0.22, 0.06, 0.16, 0.90, 0.48, 0xe8dcc0],  // antler R
    [0.16, 0.06, 0.06, -0.16, 1.00, 0.48, 0xe8dcc0], // antler tine L
    [0.16, 0.06, 0.06, 0.16, 1.00, 0.48, 0xe8dcc0],  // antler tine R
    [0.12, 0.42, 0.12, -0.19, -0.33, -0.30, 0x6b442a], // legs
    [0.12, 0.42, 0.12, 0.19, -0.33, -0.30, 0x6b442a],
    [0.12, 0.42, 0.12, -0.19, -0.33, 0.28, 0x6b442a],
    [0.12, 0.42, 0.12, 0.19, -0.33, 0.28, 0x6b442a],
    [0.14, 0.08, 0.06, 0, 0.10, -0.50, 0xf2e8dc],   // tail
  ]);
}

function makeWalkerGeoState(cap, spread, opts = {}) {
  const herd = [];
  for (let i = 0; i < cap; i++) {
    herd.push({
      x: (Math.random() - 0.5) * spread,
      z: (Math.random() - 0.5) * spread,
      ry: Math.random() * Math.PI * 2,
      speed: (opts.speed ?? 0.6) * (0.7 + Math.random() * 0.6),
      phase: Math.random() * Math.PI * 2,
      wanderTimer: 2 + Math.random() * 6,
      wanderAngle: Math.random() * Math.PI * 2,
      scale: (opts.scale ?? 0.8) * (0.85 + Math.random() * 0.3),
      state: 'idle',
      idleTimer: 1 + Math.random() * 3,
      _gy: 0, _gyT: Math.random() * 0.5,
    });
  }
  return herd;
}

// Shared wander state machine (deer/sheep/boar/chicken). Returns walking bool.
function stepWander(d, dt, playerPos, keepOutRiver) {
  let walking = d.state === 'walk';
  if (!walking) {
    d.idleTimer -= dt;
    if (d.idleTimer <= 0) {
      d.state = 'walk';
      d.wanderAngle = Math.random() * Math.PI * 2;
      d.wanderTimer = 2 + Math.random() * 5;
      walking = true;
    }
  } else {
    d.wanderTimer -= dt;
    if (d.wanderTimer <= 0) {
      d.state = 'idle';
      d.idleTimer = 1 + Math.random() * 4;
      walking = false;
    } else {
      const nx = d.x + Math.cos(d.wanderAngle) * d.speed * dt;
      const nz = d.z + Math.sin(d.wanderAngle) * d.speed * dt;
      if (!keepOutRiver || Math.abs(nx - riverXAt(nz)) > 4) {
        d.x = nx;
        d.z = nz;
      } else {
        d.wanderAngle += Math.PI;
      }
      d.ry = d.wanderAngle + Math.PI / 2;
      const dx = d.x - playerPos.x;
      const dz = d.z - playerPos.z;
      if (dx * dx + dz * dz > 60 * 60) {
        const a = Math.random() * Math.PI * 2;
        const r = 20 + Math.random() * 20;
        d.x = playerPos.x + Math.cos(a) * r;
        d.z = playerPos.z + Math.sin(a) * r;
      }
    }
  }
  return walking;
}

export function createDeer(scene) {
  const geo = buildDeerGeo();
  const mat = voxelMat(); // opaque — no fade cost
  const cap = maxAnimalCount('deer');
  const mesh = makeHerdMesh(geo, mat, cap, QUALITY.shadowsEnabled);
  mesh.count = liveAnimalCount('deer');
  scene.add(mesh);

  const deer = makeWalkerGeoState(cap, 40, { speed: 0.6, scale: 0.8 });
  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('deer'); }
  function update(dt, playerPos) {
    if (!mesh.visible || mesh.count === 0) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const d = deer[i];
      const walking = stepWander(d, dt, playerPos, true);
      const groundY = probeGroundState(d, d.x, d.z, dt, walking);
      const bob = walking ? Math.abs(Math.sin(t * 5 + d.phase)) * 0.06 : Math.sin(t * 1.2 + d.phase) * 0.015;
      _p.set(d.x, groundY + 0.55 * d.scale + bob, d.z);
      _e.set(0, d.ry, walking ? Math.sin(t * 5 + d.phase) * 0.03 : 0);
      _q.setFromEuler(_e);
      _s.setScalar(d.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity };
}

// ============================================================
// FISH — Minecraft cod: blocky body + tail fin + striped back
// ============================================================
function buildFishGeo() {
  return buildVoxelGeo([
    [0.20, 0.22, 0.42, 0, 0, 0.04, 0xff7043],   // body
    [0.16, 0.08, 0.34, 0, -0.13, 0.04, 0xffd9a0], // belly
    [0.10, 0.10, 0.30, 0, 0.14, 0.02, 0xd84315],  // dorsal stripe
    [0.04, 0.16, 0.14, 0, 0, -0.24, 0xe64a19],    // tail stem
    [0.02, 0.26, 0.12, 0, 0, -0.34, 0xe64a19],    // tail fin (thin voxel)
    [0.22, 0.04, 0.12, 0, 0.02, 0.02, 0xd84315],  // side fins
    [0.06, 0.06, 0.02, -0.11, 0.04, 0.20, 0x1a1a1a], // eye L
    [0.06, 0.06, 0.02, 0.11, 0.04, 0.20, 0x1a1a1a],  // eye R
  ]);
}

export function createFish(scene) {
  const geo = buildFishGeo();
  const mat = voxelMat(); // opaque — reads as river fish, no sorting cost
  const cap = maxAnimalCount('fish');
  const mesh = makeHerdMesh(geo, mat, cap, false);
  mesh.count = liveAnimalCount('fish');
  scene.add(mesh);

  const fish = [];
  for (let i = 0; i < cap; i++) {
    const pz = (Math.random() - 0.5) * 60;
    fish.push({
      z: pz,
      x: riverXAt(pz) + (Math.random() - 0.5) * 3,
      ry: 0,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.2,
      scale: 0.8 + Math.random() * 0.5,
      waveAmp: 0.8 + Math.random() * 1.2,
      _rx: 0, _rxT: Math.random() * 0.25,
    });
  }

  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('fish'); }
  function update(dt, playerPos) {
    if (!mesh.visible || mesh.count === 0) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const f = fish[i];
      f.z += f.speed * dt;
      const riverX = probeRiver(f, f.z, dt);
      f.x += (riverX - f.x) * Math.min(1, dt * 2);
      f.x += Math.sin(t * f.waveAmp + f.phase) * 0.8 * dt;
      f.ry = Math.atan2(Math.sin(t * f.waveAmp + f.phase) * f.waveAmp * 0.8, f.speed);

      const dz = f.z - playerPos.z;
      if (Math.abs(dz) > 55) {
        f.z = playerPos.z + (Math.random() - 0.5) * 30;
        f.x = riverXAt(f.z) + (Math.random() - 0.5) * 2;
        f._rx = f.x;
        f._rxT = 0.25;
      }

      const py = -0.15 + Math.sin(t * 1.5 + f.phase) * 0.04;
      _p.set(f.x, py, f.z);
      // tail-wag roll sells the swim with a rigid voxel mesh
      _e.set(0, f.ry, Math.sin(t * 6 + f.phase) * 0.25);
      _q.setFromEuler(_e);
      _s.setScalar(f.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity };
}

// ============================================================
// BUTTERFLIES — voxel body + big flat wings, tinted per instance
// ============================================================
function buildButterflyGeo() {
  return buildVoxelGeo(
    [
      [0.07, 0.07, 0.26, 0, 0, 0, 0xffffff], // body (white → tinted)
      [0.05, 0.10, 0.05, 0, 0.08, 0.10, 0xffffff], // head
    ],
    [
      { p: [0, 0.02, 0.04, -0.34, 0.02, 0.10, -0.38, 0.02, -0.14], c: 0xffffff },
      { p: [0, 0.02, 0.04, 0.34, 0.02, 0.10, 0.38, 0.02, -0.14], c: 0xffffff },
      { p: [0, 0.02, -0.02, -0.20, 0.02, 0.02, -0.24, 0.02, -0.14], c: 0xf2f2f2 },
      { p: [0, 0.02, -0.02, 0.20, 0.02, 0.02, 0.24, 0.02, -0.14], c: 0xf2f2f2 },
    ],
  );
}

export function createButterflies(scene) {
  const geo = buildButterflyGeo();
  const mat = voxelMat({ doubleSide: true, transparent: true, opacity: 0.95 });
  const cap = maxAnimalCount('butterflies');
  const mesh = makeHerdMesh(geo, mat, cap, false);
  mesh.count = liveAnimalCount('butterflies');
  scene.add(mesh);

  const palette = [0xff7ee8, 0x7de8ff, 0xffd93b, 0x7dff7a, 0xff9a7a];
  const list = [];
  for (let i = 0; i < cap; i++) {
    mesh.setColorAt(i, _c.setHex(palette[i % palette.length]));
    list.push({
      x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30,
      ry: Math.random() * 6.28, flap: Math.random() * 6.28,
      speed: 0.7 + Math.random() * 1.2,
      bob: Math.random() * 6.28, wander: Math.random() * 6.28,
      scale: 0.8 + Math.random() * 0.45,
      _gy: 0, _gyT: Math.random() * 0.4,
    });
  }
  if (mesh.instanceColor) mesh.instanceColor.setUsage(THREE.StaticDrawUsage);

  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('butterflies'); }
  function update(dt, playerPos) {
    if (!mesh.visible || mesh.count === 0 || mat.opacity <= 0.02) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const bf = list[i];
      bf.wander += dt * 0.6;
      bf.x += Math.cos(bf.wander) * bf.speed * dt * 0.4;
      bf.z += Math.sin(bf.wander * 0.7) * bf.speed * dt * 0.4;
      const dx = bf.x - playerPos.x;
      const dz = bf.z - playerPos.z;
      if (dx * dx + dz * dz > 35 * 35) {
        bf.x += (playerPos.x - bf.x) * dt * 0.08;
        bf.z += (playerPos.z - bf.z) * dt * 0.08;
      }
      const gy = probeGround(bf, bf.x, bf.z, dt, 0.5, 0.5)
        + 0.5 + Math.sin(t * 1.2 + bf.bob) * 0.25;
      const flap = Math.sin(t * 9 + bf.flap) * 0.55;
      _p.set(bf.x, gy, bf.z);
      _e.set(flap, bf.ry + Math.sin(t * 0.8 + bf.flap) * 0.6, 0);
      _q.setFromEuler(_e);
      _s.setScalar(bf.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity };
}

// ============================================================
// CRABS — Minecraft crab: cube body, stalk eyes, big claws, legs
// ============================================================
function buildCrabGeo() {
  return buildVoxelGeo([
    [0.36, 0.16, 0.26, 0, 0, 0, 0xff6b35],       // shell
    [0.30, 0.06, 0.20, 0, 0.10, 0, 0xff8c5a],    // shell highlight
    [0.06, 0.12, 0.06, -0.10, 0.14, 0.12, 0xff6b35], // stalk L
    [0.06, 0.12, 0.06, 0.10, 0.14, 0.12, 0xff6b35],  // stalk R
    [0.09, 0.09, 0.06, -0.10, 0.22, 0.12, 0xffffff], // eye white L
    [0.09, 0.09, 0.06, 0.10, 0.22, 0.12, 0xffffff],  // eye white R
    [0.04, 0.04, 0.02, -0.10, 0.22, 0.155, 0x1a1a1a], // pupil L
    [0.04, 0.04, 0.02, 0.10, 0.22, 0.155, 0x1a1a1a],  // pupil R
    [0.10, 0.08, 0.16, -0.26, -0.02, 0.10, 0xc24a20], // arm L
    [0.10, 0.08, 0.16, 0.26, -0.02, 0.10, 0xc24a20],  // arm R
    [0.16, 0.12, 0.14, -0.32, 0.0, 0.22, 0xff8c5a],   // claw L
    [0.16, 0.12, 0.14, 0.32, 0.0, 0.22, 0xff8c5a],    // claw R
    [0.16, 0.04, 0.04, -0.26, -0.06, 0.06, 0xc24a20], // legs L
    [0.16, 0.04, 0.04, -0.26, -0.06, -0.06, 0xc24a20],
    [0.16, 0.04, 0.04, 0.26, -0.06, 0.06, 0xc24a20],  // legs R
    [0.16, 0.04, 0.04, 0.26, -0.06, -0.06, 0xc24a20],
  ]);
}

export function createCrabs(scene) {
  const geo = buildCrabGeo();
  const mat = voxelMat(); // opaque
  const cap = maxAnimalCount('crabs');
  const mesh = makeHerdMesh(geo, mat, cap, false);
  mesh.count = liveAnimalCount('crabs');
  scene.add(mesh);

  const crabs = [];
  for (let i = 0; i < cap; i++) {
    const z = (Math.random() - 0.5) * 50;
    const side = Math.random() < 0.5 ? -1 : 1;
    crabs.push({
      z, x: riverXAt(z) + side * (4.5 + Math.random() * 1.8),
      ry: Math.random() * 6.28, phase: Math.random() * 6.28,
      speed: 0.5 + Math.random() * 0.7, scale: 0.9 + Math.random() * 0.4,
      dir: side, _gy: 0, _gyT: Math.random() * 0.4, _rx: 0, _rxT: 0,
    });
  }

  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('crabs'); }
  function update(dt, playerPos) {
    if (!mesh.visible || mesh.count === 0) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const c = crabs[i];
      c.z += c.dir * c.speed * dt * 0.6;
      c.x = probeRiver(c, c.z, dt) + c.dir * 4.8 + Math.sin(t * 2 + c.phase) * 0.4;
      const gy = probeGround(c, c.x, c.z, dt, 0.5, 0.5) + 0.09;
      const waddle = Math.sin(t * 6 + c.phase) * 0.25;
      const snap = Math.max(0, Math.sin(t * 1.3 + c.phase)) * 0.15;
      _p.set(c.x, gy + snap * 0.3, c.z);
      _e.set(0, c.ry + waddle, waddle * 0.4);
      _q.setFromEuler(_e);
      _s.setScalar(c.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      if (Math.abs(c.z - playerPos.z) > 50) {
        c.z = playerPos.z + (Math.random() - 0.5) * 20;
        c._rxT = 0;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity };
}

// ============================================================
// BOARS — Minecraft pig: pink cube body, snout, curly tail
// ============================================================
function buildBoarGeo() {
  return buildVoxelGeo([
    [0.62, 0.48, 0.92, 0, 0.08, 0, 0xf0a0a8],      // torso (chunky pig)
    [0.50, 0.14, 0.70, 0, -0.18, 0, 0xe08a94],     // belly shade
    [0.42, 0.38, 0.36, 0, 0.28, 0.58, 0xf0a0a8],   // head
    [0.22, 0.16, 0.08, 0, 0.22, 0.79, 0xd97b86],   // snout
    [0.04, 0.04, 0.02, -0.05, 0.23, 0.835, 0x5d2a30], // nostril L
    [0.04, 0.04, 0.02, 0.05, 0.23, 0.835, 0x5d2a30],  // nostril R
    [0.07, 0.07, 0.02, -0.14, 0.36, 0.75, 0x1a1a1a],  // eye L
    [0.07, 0.07, 0.02, 0.14, 0.36, 0.75, 0x1a1a1a],   // eye R
    [0.12, 0.12, 0.06, -0.16, 0.52, 0.52, 0xe08a94],  // ear L
    [0.12, 0.12, 0.06, 0.16, 0.52, 0.52, 0xe08a94],   // ear R
    [0.16, 0.36, 0.16, -0.20, -0.32, -0.28, 0xc97f88], // legs
    [0.16, 0.36, 0.16, 0.20, -0.32, -0.28, 0xc97f88],
    [0.16, 0.36, 0.16, -0.20, -0.32, 0.28, 0xc97f88],
    [0.16, 0.36, 0.16, 0.20, -0.32, 0.28, 0xc97f88],
    [0.06, 0.06, 0.14, 0.08, 0.16, -0.50, 0xd97b86],  // curly tail
    [0.06, 0.12, 0.06, 0.08, 0.22, -0.55, 0xd97b86],
  ]);
}

export function createBoars(scene) {
  const geo = buildBoarGeo();
  const mat = voxelMat();
  const cap = maxAnimalCount('boars');
  const mesh = makeHerdMesh(geo, mat, cap, QUALITY.shadowsEnabled);
  mesh.count = liveAnimalCount('boars');
  scene.add(mesh);

  const boars = [];
  for (let i = 0; i < cap; i++) {
    boars.push({
      x: (Math.random() - 0.5) * 35, z: (Math.random() - 0.5) * 35,
      ry: Math.random() * 6.28, speed: 0.35 + Math.random() * 0.5,
      phase: Math.random() * 6.28, wander: Math.random() * 6.28,
      scale: 0.95 + Math.random() * 0.25,
      state: 'walk', idleTimer: 1, wanderTimer: 3,
      _gy: 0, _gyT: Math.random() * 0.3,
    });
  }

  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('boars'); }
  function update(dt, playerPos) {
    if (!mesh.visible || mesh.count === 0) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const b = boars[i];
      b.wander += dt * 0.4;
      const walking = b.state === 'walk';
      if (walking) {
        const nx = b.x + Math.cos(b.wander) * b.speed * dt;
        const nz = b.z + Math.sin(b.wander) * b.speed * dt;
        if (Math.abs(nx - riverXAt(nz)) > 4) { b.x = nx; b.z = nz; }
        b.ry = Math.atan2(Math.sin(b.wander), Math.cos(b.wander)) + Math.PI / 2;
        const bdx = b.x - playerPos.x;
        const bdz = b.z - playerPos.z;
        if (bdx * bdx + bdz * bdz > 60 * 60) {
          const a = Math.random() * 6.28;
          const r = 18 + Math.random() * 12;
          b.x = playerPos.x + Math.cos(a) * r;
          b.z = playerPos.z + Math.sin(a) * r;
        }
      }
      const gy = probeGroundState(b, b.x, b.z, dt, walking);
      const snuffle = walking ? Math.abs(Math.sin(t * 4 + b.phase)) * 0.04 : Math.sin(t * 1.5 + b.phase) * 0.015;
      _p.set(b.x, gy + 0.50 * b.scale + snuffle, b.z);
      _e.set(walking ? Math.sin(t * 4 + b.phase) * 0.04 : 0, b.ry, 0);
      _q.setFromEuler(_e);
      _s.setScalar(b.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity };
}

// ============================================================
// DRAGONFLIES — voxel dart body + 4 shimmer wings (day only)
// ============================================================
function buildDragonflyGeo() {
  return buildVoxelGeo(
    [
      [0.09, 0.09, 0.52, 0, 0, -0.02, 0xffffff], // abdomen (tinted)
      [0.12, 0.12, 0.20, 0, 0.01, 0.26, 0xffffff], // thorax
      [0.10, 0.10, 0.10, 0, 0.02, 0.40, 0xffffff], // head
      [0.04, 0.04, 0.02, -0.05, 0.04, 0.45, 0x1a2a33], // eye L
      [0.04, 0.04, 0.02, 0.05, 0.04, 0.45, 0x1a2a33],  // eye R
    ],
    [
      { p: [0, 0.05, 0.26, -0.42, 0.05, 0.18, -0.30, 0.05, 0.02], c: 0xffffff },
      { p: [0, 0.05, 0.26, 0.42, 0.05, 0.18, 0.30, 0.05, 0.02], c: 0xffffff },
      { p: [0, 0.05, 0.10, -0.38, 0.05, 0.02, -0.26, 0.05, -0.12], c: 0xf2fbf7 },
      { p: [0, 0.05, 0.10, 0.38, 0.05, 0.02, 0.26, 0.05, -0.12], c: 0xf2fbf7 },
    ],
  );
}

export function createDragonflies(scene) {
  const geo = buildDragonflyGeo();
  const mat = voxelMat({ doubleSide: true, transparent: true, opacity: 0.95 });
  const cap = maxAnimalCount('dragonflies');
  const mesh = makeHerdMesh(geo, mat, cap, false);
  mesh.count = liveAnimalCount('dragonflies');
  scene.add(mesh);

  const cols = [0x2de2a8, 0x3ac8ff, 0x7dff7a, 0xffd93b];
  const df = [];
  for (let i = 0; i < cap; i++) {
    mesh.setColorAt(i, _c.setHex(cols[i % cols.length]));
    const z = (Math.random() - 0.5) * 40;
    df.push({
      z, x: riverXAt(z) + (Math.random() - 0.5) * 2.5,
      phase: Math.random() * 6.28, wander: Math.random() * 6.28,
      speed: 1.1 + Math.random() * 0.9, scale: 0.9 + Math.random() * 0.5,
      _rx: 0, _rxT: 0,
    });
  }
  if (mesh.instanceColor) mesh.instanceColor.setUsage(THREE.StaticDrawUsage);

  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('dragonflies'); }
  function update(dt, playerPos, env) {
    const tod = env?.timeOfDay ?? 12;
    const want = tod >= 6 && tod < 18.5;
    lerpOpacity(mat, want ? 0.95 : 0, dt, 1.2);
    mesh.visible = mat.opacity > 0.02;
    if (!mesh.visible || mesh.count === 0) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const d = df[i];
      d.wander += dt * (0.9 + d.speed * 0.3);
      d.z += Math.cos(d.wander) * dt * 0.2;
      d.x = probeRiver(d, d.z, dt) + Math.sin(d.wander * 0.7 + d.phase) * 1.6;
      const gy = 0.55 + Math.sin(t * 1.8 + d.phase) * 0.35;
      const flap = Math.sin(t * 18 + d.phase) * 0.6;
      _p.set(d.x, gy, d.z);
      _e.set(flap, d.wander, 0);
      _q.setFromEuler(_e);
      _s.setScalar(d.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      if (Math.abs(d.z - playerPos.z) > 45) {
        d.z = playerPos.z + (Math.random() - 0.5) * 20;
        d._rxT = 0;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity };
}

// ============================================================
// BATS — voxel body + ears + scalloped wings (night only)
// ============================================================
function buildBatGeo() {
  return buildVoxelGeo(
    [
      [0.18, 0.16, 0.24, 0, 0, 0, 0x2a2a3e],      // body
      [0.16, 0.14, 0.14, 0, 0.06, 0.16, 0x2a2a3e], // head
      [0.05, 0.05, 0.02, -0.05, 0.08, 0.23, 0xff5d5d], // eye L (glow red)
      [0.05, 0.05, 0.02, 0.05, 0.08, 0.23, 0xff5d5d],  // eye R
      [0.07, 0.12, 0.04, -0.09, 0.18, 0.12, 0x1c1c2c], // ear L
      [0.07, 0.12, 0.04, 0.09, 0.18, 0.12, 0x1c1c2c],  // ear R
      [0.08, 0.06, 0.10, 0, -0.04, -0.14, 0x1c1c2c],   // tail nub
    ],
    [
      { p: [0, 0.02, 0.06, -0.60, 0.02, -0.02, -0.30, 0.02, -0.22], c: 0x1a1a2e },
      { p: [0, 0.02, 0.06, 0.60, 0.02, -0.02, 0.30, 0.02, -0.22], c: 0x1a1a2e },
    ],
  );
}

export function createBats(scene) {
  const geo = buildBatGeo();
  const mat = voxelMat({ doubleSide: true, transparent: true, opacity: 1 });
  const cap = maxAnimalCount('bats');
  const mesh = makeHerdMesh(geo, mat, cap, false);
  mesh.count = liveAnimalCount('bats');
  scene.add(mesh);

  const bats = [];
  for (let i = 0; i < cap; i++) {
    bats.push({
      cx: (Math.random() - 0.5) * 30, cz: (Math.random() - 0.5) * 30,
      angle: Math.random() * 6.28, radius: 4 + Math.random() * 7,
      speed: 1.2 + Math.random() * 0.9, alt: 6 + Math.random() * 7,
      phase: Math.random() * 6.28, scale: 1.0 + Math.random() * 0.45,
      jitter: Math.random() * 6.28,
    });
  }

  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('bats'); }
  function update(dt, playerPos, env) {
    const tod = env?.timeOfDay ?? 0;
    const isNight = tod >= 19 || tod < 5.5;
    const want = isNight;
    lerpOpacity(mat, want ? 1 : 0, dt, 1.5);
    mesh.visible = mat.opacity > 0.02;
    if (!mesh.visible || mesh.count === 0) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const b = bats[i];
      b.angle += b.speed * dt * (1 + Math.sin(t * 2 + b.jitter) * 0.4);
      b.jitter += dt * 3;
      const bx = b.cx + Math.cos(b.angle) * b.radius + Math.sin(t * 3 + b.phase) * 1.2;
      const bz = b.cz + Math.sin(b.angle) * b.radius + Math.cos(t * 2.7 + b.phase) * 1.0;
      const by = b.alt + Math.sin(t * 4 + b.phase) * 1.1;
      const flap = Math.sin(t * 14 + b.phase) * 0.75;
      _p.set(bx, by, bz);
      _e.set(flap * 0.5, b.angle + Math.PI * 0.5, flap * 0.5 + Math.sin(t * 5 + b.phase) * 0.2);
      _q.setFromEuler(_e);
      _s.set(b.scale, b.scale * (1 + flap * 0.12), b.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      const dx = playerPos.x - b.cx;
      const dz = playerPos.z - b.cz;
      if (dx * dx + dz * dz > 40 * 40) { b.cx += dx * dt * 0.05; b.cz += dz * dt * 0.05; }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity };
}

// ============================================================
// CHICKENS — NEW variable animal: iconic Minecraft chicken
// white cube body, yellow beak, red comb, orange stick legs
// ============================================================
function buildChickenGeo() {
  return buildVoxelGeo([
    [0.34, 0.36, 0.40, 0, 0.10, 0, 0xffffff],        // body
    [0.28, 0.10, 0.32, 0, -0.10, 0, 0xe8e8ee],       // belly shade
    [0.26, 0.26, 0.26, 0, 0.40, 0.22, 0xffffff],     // head
    [0.10, 0.08, 0.08, 0, 0.38, 0.39, 0xf2a541],     // beak
    [0.06, 0.10, 0.16, 0, 0.56, 0.22, 0xe63946],     // comb
    [0.08, 0.10, 0.04, 0, 0.30, 0.24, 0xe63946],     // wattle
    [0.07, 0.07, 0.02, -0.14, 0.44, 0.30, 0x1a1a1a],  // eye L
    [0.07, 0.07, 0.02, 0.14, 0.44, 0.30, 0x1a1a1a],   // eye R
    [0.06, 0.06, 0.22, -0.20, 0.14, -0.02, 0xe8e8ee], // wing L
    [0.06, 0.06, 0.22, 0.20, 0.14, -0.02, 0xe8e8ee],  // wing R
    [0.16, 0.14, 0.08, 0, 0.18, -0.24, 0xe8e8ee],     // tail
    [0.06, 0.22, 0.06, -0.09, -0.20, 0.02, 0xf2a541], // leg L
    [0.06, 0.22, 0.06, 0.09, -0.20, 0.02, 0xf2a541],  // leg R
  ]);
}

export function createChickens(scene) {
  const geo = buildChickenGeo();
  const mat = voxelMat();
  const cap = maxAnimalCount('chickens');
  const mesh = makeHerdMesh(geo, mat, cap, false);
  mesh.count = liveAnimalCount('chickens');
  scene.add(mesh);

  const flock = makeWalkerGeoState(cap, 30, { speed: 0.7, scale: 0.62 });
  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('chickens'); }
  function update(dt, playerPos) {
    if (!mesh.visible || mesh.count === 0) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const d = flock[i];
      const walking = stepWander(d, dt, playerPos, true);
      const groundY = probeGroundState(d, d.x, d.z, dt, walking);
      // peck: pitch forward in bursts when idle
      const peck = d.state === 'idle'
        ? Math.max(0, Math.sin(t * 2.2 + d.phase)) ** 3 * 0.5
        : Math.sin(t * 8 + d.phase) * 0.06;
      const hop = walking ? Math.abs(Math.sin(t * 9 + d.phase)) * 0.05 : 0;
      _p.set(d.x, groundY + 0.32 * d.scale + hop, d.z);
      _e.set(peck, d.ry, walking ? Math.sin(t * 9 + d.phase) * 0.06 : 0);
      _q.setFromEuler(_e);
      _s.setScalar(d.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity };
}

// ============================================================
// SHEEP — NEW variable animal: fluffy Minecraft sheep
// stacked wool cubes, gray face, stubby dark legs
// ============================================================
function buildSheepGeo() {
  return buildVoxelGeo([
    [0.62, 0.42, 0.90, 0, 0.12, 0, 0xf2efe8],      // wool torso
    [0.66, 0.22, 0.94, 0, 0.36, 0, 0xffffff],      // wool top (fluffy)
    [0.40, 0.20, 0.30, 0, 0.30, 0.55, 0xf2efe8],   // wool cap over head
    [0.34, 0.32, 0.30, 0, 0.10, 0.62, 0x9a938a],   // face (gray)
    [0.07, 0.07, 0.02, -0.10, 0.16, 0.77, 0x1a1a1a], // eye L
    [0.07, 0.07, 0.02, 0.10, 0.16, 0.77, 0x1a1a1a],  // eye R
    [0.12, 0.08, 0.06, -0.22, 0.22, 0.55, 0x9a938a], // ear L
    [0.12, 0.08, 0.06, 0.22, 0.22, 0.55, 0x9a938a],  // ear R
    [0.14, 0.34, 0.14, -0.20, -0.26, -0.28, 0x6b6560], // legs
    [0.14, 0.34, 0.14, 0.20, -0.26, -0.28, 0x6b6560],
    [0.14, 0.34, 0.14, -0.20, -0.26, 0.28, 0x6b6560],
    [0.14, 0.34, 0.14, 0.20, -0.26, 0.28, 0x6b6560],
    [0.12, 0.12, 0.10, 0, 0.16, -0.48, 0xf2efe8],   // tail puff
  ]);
}

export function createSheep(scene) {
  const geo = buildSheepGeo();
  const mat = voxelMat();
  const cap = maxAnimalCount('sheep');
  const mesh = makeHerdMesh(geo, mat, cap, QUALITY.shadowsEnabled);
  mesh.count = liveAnimalCount('sheep');
  scene.add(mesh);

  const herd = makeWalkerGeoState(cap, 36, { speed: 0.4, scale: 0.85 });
  let t = 0;
  function applyDensity() { mesh.count = liveAnimalCount('sheep'); }
  function update(dt, playerPos) {
    if (!mesh.visible || mesh.count === 0) return;
    t += dt;
    const n = mesh.count;
    for (let i = 0; i < n; i++) {
      const d = herd[i];
      const walking = stepWander(d, dt, playerPos, true);
      const groundY = probeGroundState(d, d.x, d.z, dt, walking);
      // graze: dip pitch when idle
      const graze = d.state === 'idle'
        ? Math.max(0, Math.sin(t * 0.9 + d.phase)) ** 2 * 0.35
        : 0;
      const bob = walking ? Math.abs(Math.sin(t * 4 + d.phase)) * 0.04 : 0;
      _p.set(d.x, groundY + 0.44 * d.scale + bob, d.z);
      _e.set(graze, d.ry, walking ? Math.sin(t * 4 + d.phase) * 0.03 : 0);
      _q.setFromEuler(_e);
      _s.setScalar(d.scale);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }

  return { mesh, update, applyDensity };
}

// ============================================================
// COMBINED FACTORY — variable species list + lifecycle + slicing
// kind -> factory map so callers can enable a subset:
//   createAnimals(scene, { only: ['birds', 'chickens'] })
// ============================================================
const FACTORIES = {
  birds: createBirds,
  deer: createDeer,
  fish: createFish,
  butterflies: createButterflies,
  crabs: createCrabs,
  boars: createBoars,
  dragonflies: createDragonflies,
  bats: createBats,
  chickens: createChickens,
  sheep: createSheep,
};

/** Variable-animal entry: create any single species by name. */
export function createAnimalByType(scene, type) {
  const fn = FACTORIES[type];
  if (!fn) throw new Error(`unknown animal type: ${type}`);
  return fn(scene);
}

function lifecycleActivity(kind, env) {
  const tod = env?.timeOfDay ?? 12;
  const isDay = tod >= 6 && tod < 18.8;
  const isNight = !isDay;
  const isDawn = tod >= 5 && tod < 8;
  const isDusk = tod >= 17.5 && tod < 20;
  if (kind === 'butterflies') {
    if (!isDay) return 0;
    if (isDawn || isDusk) return 0.7;
    return 1;
  }
  if (kind === 'birds') {
    if (isNight) return 0.08;
    return 1;
  }
  return 1;
}

export function createAnimals(scene, opts = null) {
  const only = opts?.only ?? ANIMAL_TYPES;
  const active = {};
  for (const type of only) {
    if (FACTORIES[type]) active[type] = FACTORIES[type](scene);
  }
  const meshes = () => Object.values(active).map((a) => a.mesh);

  let frame = 0;
  // Low-end: ground walkers run at half rate with doubled dt (same speed,
  // half the groundHeight/riverX noise evals + matrix writes).
  function heavyDt(dt) {
    if ((QUALITY.animalsMul ?? 1) > 0.6) return { run: true, dt };
    return (frame & 1) === 0 ? { run: true, dt: dt * 2 } : { run: false, dt: 0 };
  }

  return {
    // exposed for UI/test hooks (variable animals)
    types: Object.keys(active),
    byType: active,
    update(dt, playerPos, env = null) {
      frame++;
      const birds = active.birds;
      const butterflies = active.butterflies;
      const deer = active.deer;
      const boars = active.boars;
      const chickens = active.chickens;
      const sheep = active.sheep;

      birds?.update(dt, playerPos);
      if (birds?.mesh) {
        const target = lifecycleActivity('birds', env);
        // Opaque material: fade by toggling visibility at extremes only,
        // avoiding a permanent transparent pass.
        birds.mesh.visible = target > 0.03;
        birds.setActivity?.(target);
      }

      active.fish?.update(dt, playerPos);

      // Heavy ground walkers: full rate on high, half rate on low.
      const heavy = heavyDt(dt);
      if (heavy.run) {
        deer?.update(heavy.dt, playerPos);
        boars?.update(heavy.dt, playerPos);
        chickens?.update(heavy.dt, playerPos);
        sheep?.update(heavy.dt, playerPos);
        // NOTE: no per-frame opacity lerp on opaque walkers — they stay
        // visible through storms (shelter handled by reduced wandering).
      }
      // (else: skip entirely — no update(0) ghost loop)

      const light = (QUALITY.animalsMul ?? 1) > 0.6 || frame % 2 === 0;
      if (light) {
        const ldt = (QUALITY.animalsMul ?? 1) > 0.6 ? dt : dt * 2;
        butterflies?.update(ldt, playerPos);
        active.crabs?.update(ldt, playerPos);
      }
      if (butterflies?.mesh) {
        const target = lifecycleActivity('butterflies', env) * 0.95;
        butterflies.mesh.visible = target > 0.02;
        lerpOpacity(butterflies.mesh.material, target, dt, 1.0);
      }

      active.dragonflies?.update(dt, playerPos, env);
      active.bats?.update(dt, playerPos, env);
    },
    applyDensity() {
      for (const k of Object.keys(active)) active[k].applyDensity();
    },
    setVisible(v) {
      for (const m of meshes()) m.visible = v;
    },
    setTypeVisible(type, v) {
      if (active[type]?.mesh) active[type].mesh.visible = v;
    },
    dispose() {
      for (const m of meshes()) {
        m.parent?.remove(m);
        m.geometry?.dispose?.();
        m.material?.dispose?.();
        m.dispose?.();
      }
    },
  };
}
