// animals.js — Low-poly animated animals: birds, deer, fish.
// All use InstancedMesh for performance (1 draw call each).
// Animations are pure sine-wave math — no skeleton, no assets.

import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';
import { groundHeight } from '../utils.js';
import { riverXAt, moistureAt } from '../world/procedural.js';
import { ANIMALS } from '../config.js';

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
// BIRDS — Genshin sky gliders over Mondstadt plains
// ============================================================
const BASE_BIRD_COUNT = ANIMALS.birdCount;
function birdCount() {
  const mul = QUALITY.animalsMul ?? 1;
  const base = QUALITY.low ? BASE_BIRD_COUNT - 10 : BASE_BIRD_COUNT;
  return Math.max(4, Math.round(base * mul));
}

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
  const n = birdCount();
  const mesh = new THREE.InstancedMesh(geo, mat, BASE_BIRD_COUNT);
  mesh.count = n;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  scene.add(mesh);

  // Each bird: position, orbit radius, orbit speed, phase, altitude, flapPhase
  const birds = [];
  for (let i = 0; i < BASE_BIRD_COUNT; i++) {
    const angle = (i / BASE_BIRD_COUNT) * Math.PI * 2;
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
  function applyDensity() { mesh.count = birdCount(); }
  function update(dt, playerPos) {
    t += dt;
    const n = mesh.count;
    if (n === 0) return;
    // Slowly drift flock centres toward the player
    for (let i = 0; i < n; i++) {
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

  return { mesh, update, applyDensity };
}

// ============================================================
// DEER  (simple low-poly quadruped)
// ============================================================
const BASE_DEER_COUNT = 6;
function deerCount() {
  const mul = QUALITY.animalsMul ?? 1;
  const base = QUALITY.low ? 3 : BASE_DEER_COUNT;
  return Math.max(1, Math.round(base * mul));
}

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
  const mesh = new THREE.InstancedMesh(deerGeo, deerMat, BASE_DEER_COUNT);
  mesh.count = deerCount();
  mesh.frustumCulled = false;
  mesh.castShadow = QUALITY.shadowsEnabled;
  scene.add(mesh);

  const deer = [];
  for (let i = 0; i < BASE_DEER_COUNT; i++) {
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
  function applyDensity() { mesh.count = deerCount(); }
  function update(dt, playerPos) {
    // Throttle deer AI on low: updates still run but mesh.count already reduced
    t += dt;
    const n = mesh.count;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
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

  return { mesh, update, applyDensity };
}

// ============================================================
// FISH (animated near river surface)
// ============================================================
const BASE_FISH_COUNT = 14;
function fishCount() {
  const mul = QUALITY.animalsMul ?? 1;
  const base = QUALITY.low ? 6 : BASE_FISH_COUNT;
  return Math.max(2, Math.round(base * mul));
}

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
  const mesh = new THREE.InstancedMesh(fishGeo, fishMat, BASE_FISH_COUNT);
  mesh.count = fishCount();
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  scene.add(mesh);

  const fish = [];
  for (let i = 0; i < BASE_FISH_COUNT; i++) {
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
  function applyDensity() { mesh.count = fishCount(); }
  function update(dt, playerPos) {
    t += dt;
    const n = mesh.count;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
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

  return { mesh, update, applyDensity };
}

// ============================================================
// BUTTERFLIES — Inazuma/Monstadt flower fields (Genshin gliders)
// ============================================================
const BASE_BUTTERFLY_COUNT = ANIMALS.butterflyCount;
function butterflyCount() {
  const mul = QUALITY.animalsMul ?? 1;
  const base = QUALITY.low ? 8 : BASE_BUTTERFLY_COUNT;
  return Math.max(2, Math.round(base * mul));
}

function buildButterflyGeo() {
  const geo = new THREE.BufferGeometry();
  // Two pairs of wings — colorful flat diamonds
  const v = new Float32Array([
    0, 0.02, 0,  -0.22, 0.04, 0.08,  -0.32, 0, -0.06,
    0, 0.02, 0,   0.22, 0.04, 0.08,   0.32, 0, -0.06,
    0, 0.02, 0,  -0.14, -0.03, 0.06, -0.18, -0.06, -0.05,
    0, 0.02, 0,   0.14, -0.03, 0.06,  0.18, -0.06, -0.05,
  ]);
  const idx = [0,1,2, 3,4,5, 6,7,8, 9,10,11];
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export function createButterflies(scene) {
  const geo = buildButterflyGeo();
  const mat = new THREE.MeshLambertMaterial({ color: 0xff7ee8, side: THREE.DoubleSide, transparent: true, opacity: 0.95 });
  const mesh = new THREE.InstancedMesh(geo, mat, BASE_BUTTERFLY_COUNT);
  mesh.count = butterflyCount();
  mesh.frustumCulled = false; scene.add(mesh);
  const colors = [0xff7ee8, 0x7de8ff, 0xffd93b, 0x7dff7a, 0xff9a7a];
  const col = new THREE.Color();
  const b = [];
  for (let i=0;i<BASE_BUTTERFLY_COUNT;i++) {
    mesh.setColorAt(i, col.setHex(colors[i % colors.length]));
    b.push({
      x:(Math.random()-0.5)*30, z:(Math.random()-0.5)*30,
      ry:Math.random()*6.28, flap:Math.random()*6.28, speed:0.7+Math.random()*1.2,
      bob:Math.random()*6.28, wander:Math.random()*6.28, scale:0.45+Math.random()*0.25
    });
  }
  mesh.instanceColor.needsUpdate = true;
  let t=0;
  function applyDensity() { mesh.count = butterflyCount(); }
  function update(dt, playerPos) {
    t+=dt;
    const n = mesh.count;
    if (n === 0) return;
    for(let i=0;i<n;i++){
      const bf=b[i];
      bf.wander+=dt*0.6;
      bf.x += Math.cos(bf.wander)*bf.speed*dt*0.4;
      bf.z += Math.sin(bf.wander*0.7)*bf.speed*dt*0.4;
      // stay near player + flower meadows (moist lowland)
      const dx=bf.x-playerPos.x, dz=bf.z-playerPos.z;
      if(dx*dx+dz*dz>35*35){ bf.x+= (playerPos.x-bf.x)*dt*0.08; bf.z+=(playerPos.z-bf.z)*dt*0.08; }
      const gy=groundHeight(bf.x,bf.z)+0.45+Math.sin(t*1.2+bf.bob)*0.25;
      const flap=Math.sin(t*9+bf.flap)*0.55;
      _p.set(bf.x, gy, bf.z);
      _e.set(flap, bf.ry + Math.sin(t*0.8+bf.flap)*0.6, 0);
      _q.setFromEuler(_e); _s.setScalar(bf.scale);
      _m.compose(_p,_q,_s); mesh.setMatrixAt(i,_m);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }
  return { mesh, update, applyDensity };
}

// ============================================================
// CRABS — Fontaine beach tide pools
// ============================================================
const BASE_CRAB_COUNT = ANIMALS.crabCount;
function crabCount() {
  const mul = QUALITY.animalsMul ?? 1;
  const base = QUALITY.low ? 6 : BASE_CRAB_COUNT;
  return Math.max(2, Math.round(base * mul));
}

function buildCrabGeo(){
  const g=new THREE.BoxGeometry(0.32,0.14,0.24);
  const eyeL=new THREE.SphereGeometry(0.06,5,5); eyeL.translate(-0.1,0.12,0.1);
  const eyeR=new THREE.SphereGeometry(0.06,5,5); eyeR.translate(0.1,0.12,0.1);
  // merge quick
  const geos=[g,eyeL,eyeR];
  let vT=0,iT=0; for(const gg of geos){ vT+=gg.attributes.position.count; iT+=gg.index.count; }
  const pos=new Float32Array(vT*3), norm=new Float32Array(vT*3), idx=[];
  let vo=0; for(const gg of geos){ pos.set(gg.attributes.position.array, vo*3); if(gg.index) for(let k=0;k<gg.index.count;k++) idx.push(gg.index.array[k]+vo); vo+=gg.attributes.position.count; }
  const mg=new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos,3)); mg.setIndex(idx); mg.computeVertexNormals(); return mg;
}

export function createCrabs(scene){
  const geo=buildCrabGeo();
  const mat=new THREE.MeshLambertMaterial({ color:0xff6b35, flatShading:true });
  const mesh=new THREE.InstancedMesh(geo, mat, BASE_CRAB_COUNT);
  mesh.count = crabCount();
  mesh.frustumCulled=false; scene.add(mesh);
  const crabs=[];
  for(let i=0;i<BASE_CRAB_COUNT;i++){
    const z=(Math.random()-0.5)*50;
    const rx=riverXAt(z);
    // place on beach band (bankOuter +-1.5)
    const side=Math.random()<0.5?-1:1;
    crabs.push({ z, x: rx + side*(4.5+Math.random()*1.8), ry:Math.random()*6.28, phase:Math.random()*6.28, speed:0.5+Math.random()*0.7, scale:0.7+Math.random()*0.3, dir: side });
  }
  let t=0;
  function applyDensity() { mesh.count = crabCount(); }
  function update(dt, playerPos){
    t+=dt;
    const n = mesh.count;
    if (n === 0) return;
    for(let i=0;i<n;i++){
      const c=crabs[i];
      c.z += c.dir * c.speed * dt * 0.6;
      // side-walk waddle
      c.x = riverXAt(c.z) + c.dir*4.8 + Math.sin(t*2+c.phase)*0.4;
      const gy=groundHeight(c.x,c.z)+0.07;
      const waddle=Math.sin(t*6+c.phase)*0.25;
      _p.set(c.x, gy, c.z); _e.set(0, c.ry + waddle, 0); _q.setFromEuler(_e); _s.setScalar(c.scale);
      _m.compose(_p,_q,_s); mesh.setMatrixAt(i,_m);
      if(Math.abs(c.z-playerPos.z)>50){ c.z=playerPos.z+(Math.random()-0.5)*20; }
    }
    mesh.instanceMatrix.needsUpdate=true;
  }
  return { mesh, update, applyDensity };
}

// ============================================================
// BOARS — Sumeru forest (chunky deer variant)
// ============================================================
const BASE_BOAR_COUNT = ANIMALS.boarCount;
function boarCount() {
  const mul = QUALITY.animalsMul ?? 1;
  const base = QUALITY.low ? 2 : BASE_BOAR_COUNT;
  return Math.max(1, Math.round(base * mul));
}

export function createBoars(scene){
  const geo=buildDeerGeo();
  // scale slightly chunkier via instance scale, darker tint
  const mat=new THREE.MeshLambertMaterial({ color:0x4a2f1a, flatShading:true });
  const mesh=new THREE.InstancedMesh(geo, mat, BASE_BOAR_COUNT);
  mesh.count = boarCount();
  mesh.frustumCulled=false; mesh.castShadow=QUALITY.shadowsEnabled; scene.add(mesh);
  const boars=[];
  for(let i=0;i<BASE_BOAR_COUNT;i++){
    boars.push({ x:(Math.random()-0.5)*35, z:(Math.random()-0.5)*35, ry:Math.random()*6.28, speed:0.35+Math.random()*0.5, phase:Math.random()*6.28, wander:Math.random()*6.28, scale:0.95+Math.random()*0.25, idle:1+Math.random()*2, state:'walk' });
  }
  let t=0;
  function applyDensity() { mesh.count = boarCount(); }
  function update(dt, playerPos){
    t+=dt;
    const n = mesh.count;
    if (n === 0) return;
    for(let i=0;i<n;i++){
      const b=boars[i];
      b.wander+=dt*0.4;
      if(b.state==='walk'){
        const nx=b.x+Math.cos(b.wander)*b.speed*dt, nz=b.z+Math.sin(b.wander)*b.speed*dt;
        if(Math.abs(nx - riverXAt(nz))>4){ b.x=nx; b.z=nz; }
        b.ry=Math.atan2(Math.sin(b.wander), Math.cos(b.wander));
        if(Math.hypot(b.x-playerPos.x,b.z-playerPos.z)>60){ const a=Math.random()*6.28, r=18+Math.random()*12; b.x=playerPos.x+Math.cos(a)*r; b.z=playerPos.z+Math.sin(a)*r; }
      }
      const gy=groundHeight(b.x,b.z)+0.38*b.scale+Math.sin(t*3+b.phase)*0.03;
      _p.set(b.x,gy,b.z); _e.set(0,b.ry,0); _q.setFromEuler(_e); _s.setScalar(b.scale*1.15);
      _m.compose(_p,_q,_s); mesh.setMatrixAt(i,_m);
    }
    mesh.instanceMatrix.needsUpdate=true;
  }
  return { mesh, update, applyDensity };
}

// ============================================================
// DRAGONFLIES — river jewel gliders (day, clear/partlyCloudy, near water)
// ============================================================
const BASE_DRAGONFLY_COUNT = 10;
function dragonflyCount() {
  const mul = QUALITY.animalsMul ?? 1;
  const base = QUALITY.low ? 5 : BASE_DRAGONFLY_COUNT;
  return Math.max(2, Math.round(base * mul));
}
function buildDragonflyGeo() {
  const geo = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, 0.28,  0, 0.02, -0.18,  -0.28, 0.02, 0.04,
    0, 0, 0.28,  0, 0.02, -0.18,   0.28, 0.02, 0.04,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setIndex([0,1,2, 3,4,5]);
  geo.computeVertexNormals();
  return geo;
}
export function createDragonflies(scene) {
  const geo = buildDragonflyGeo();
  const mat = new THREE.MeshLambertMaterial({ color: 0x2de2a8, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, BASE_DRAGONFLY_COUNT);
  mesh.count = dragonflyCount();
  mesh.frustumCulled = false; scene.add(mesh);
  const cols = [0x2de2a8, 0x3ac8ff, 0x7dff7a, 0xffd93b];
  const col = new THREE.Color();
  const df = [];
  for (let i = 0; i < BASE_DRAGONFLY_COUNT; i++) {
    mesh.setColorAt(i, col.setHex(cols[i % cols.length]));
    const z = (Math.random() - 0.5) * 40;
    df.push({ z, x: riverXAt(z) + (Math.random() - 0.5) * 2.5, y: 0.55 + Math.random() * 0.9, phase: Math.random() * 6.28, wander: Math.random() * 6.28, speed: 1.1 + Math.random() * 0.9, scale: 0.5 + Math.random() * 0.3 });
  }
  mesh.instanceColor.needsUpdate = true;
  let t = 0;
  function applyDensity() { mesh.count = dragonflyCount(); }
  function update(dt, playerPos, env) {
    // Lifecycle: only vibrant by day when clear/partlyCloudy/drizzle; hide at night/storm
    const tod = env?.timeOfDay ?? 12;
    const weather = env?.weather ?? 'clear';
    const isDay = tod >= 6 && tod < 18.5;
    const badWeather = weather === 'storm';
    const want = isDay && !badWeather;
    const targetOpacity = want ? 0.95 : 0;
    mat.opacity += (targetOpacity - mat.opacity) * Math.min(1, dt * 1.2);
    mesh.visible = mat.opacity > 0.02;
    if (!mesh.visible) return;
    t += dt;
    const n = mesh.count;
    if (n === 0) return;
    for (let i = 0; i < n; i++) {
      const d = df[i];
      d.wander += dt * (0.9 + d.speed * 0.3);
      d.z += Math.cos(d.wander) * dt * 0.2;
      d.x = riverXAt(d.z) + Math.sin(d.wander * 0.7 + d.phase) * 1.6;
      const gy = 0.55 + Math.sin(t * 1.8 + d.phase) * 0.35;
      const flap = Math.sin(t * 18 + d.phase) * 0.6;
      _p.set(d.x, gy, d.z); _e.set(flap, d.wander, 0); _q.setFromEuler(_e); _s.setScalar(d.scale);
      _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
      if (Math.abs(d.z - playerPos.z) > 45) d.z = playerPos.z + (Math.random() - 0.5) * 20;
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update, applyDensity };
}

// ============================================================
// BATS — nocturnal erratic fliers (19-05, clear/overcast/mist)
// ============================================================
const BASE_BAT_COUNT = 9;
function batCount() {
  const mul = QUALITY.animalsMul ?? 1;
  const base = QUALITY.low ? 4 : BASE_BAT_COUNT;
  return Math.max(2, Math.round(base * mul));
}
function buildBatGeo() {
  const geo = new THREE.BufferGeometry();
  const v = new Float32Array([
    0, 0, 0,  -0.45, 0.08, 0.12,  -0.25, 0, -0.14,
    0, 0, 0,   0.45, 0.08, 0.12,   0.25, 0, -0.14,
    0, 0, 0,   0, 0.05, 0.22,      0, -0.04, -0.08,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  geo.setIndex([0,1,2, 3,4,5, 6,7,8]);
  geo.computeVertexNormals();
  return geo;
}
export function createBats(scene) {
  const geo = buildBatGeo();
  const mat = new THREE.MeshLambertMaterial({ color: 0x1a1a2e, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, BASE_BAT_COUNT);
  mesh.count = batCount();
  mesh.frustumCulled = false; scene.add(mesh);
  const bats = [];
  for (let i = 0; i < BASE_BAT_COUNT; i++) {
    bats.push({ cx: (Math.random() - 0.5) * 30, cz: (Math.random() - 0.5) * 30, angle: Math.random() * 6.28, radius: 4 + Math.random() * 7, speed: 1.2 + Math.random() * 0.9, alt: 6 + Math.random() * 7, phase: Math.random() * 6.28, scale: 0.45 + Math.random() * 0.2, jitter: Math.random() * 6.28 });
  }
  let t = 0;
  function applyDensity() { mesh.count = batCount(); }
  function update(dt, playerPos, env) {
    const tod = env?.timeOfDay ?? 0;
    const isNight = tod >= 19 || tod < 5.5;
    const weather = env?.weather ?? 'clear';
    const want = isNight && weather !== 'storm';
    const targetOpacity = want ? 1 : 0;
    mat.opacity = mat.opacity ?? 1;
    if (mat.opacity !== targetOpacity) {
      mat.transparent = true;
      mat.opacity += (targetOpacity - mat.opacity) * Math.min(1, dt * 1.5);
    }
    mesh.visible = (mat.opacity ?? 1) > 0.02;
    if (!mesh.visible) return;
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
      _p.set(bx, by, bz); _e.set(flap, b.angle + Math.PI * 0.5, Math.sin(t * 5 + b.phase) * 0.25); _q.setFromEuler(_e); _s.setScalar(b.scale);
      _m.compose(_p, _q, _s); mesh.setMatrixAt(i, _m);
      // follow player loosely
      const dx = playerPos.x - b.cx, dz = playerPos.z - b.cz;
      if (dx * dx + dz * dz > 40 * 40) { b.cx += dx * dt * 0.05; b.cz += dz * dt * 0.05; }
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update, applyDensity };
}

// ============================================================
// COMBINED FACTORY — Genshin open world wildlife (vibrant lifecycle)
// ============================================================
export function createAnimals(scene) {
  const birds = createBirds(scene);
  const deer = createDeer(scene);
  const fish = createFish(scene);
  const butterflies = createButterflies(scene);
  const crabs = createCrabs(scene);
  const boars = createBoars(scene);
  const dragonflies = createDragonflies(scene);
  const bats = createBats(scene);

  // Throttle secondary critters on low-end/battery saver: update every other frame.
  let frame = 0;
  function shouldRunHeavy() {
    if ((QUALITY.animalsMul ?? 1) > 0.6) return true;
    return (frame & 1) === 0;
  }

  // Lifecycle helper: returns 0..1 activity for butterflies/birds by time/weather
  function lifecycleOpacity(kind, env) {
    const tod = env?.timeOfDay ?? 12;
    const w = env?.weather ?? 'clear';
    const isDay = tod >= 6 && tod < 18.8;
    const isNight = !isDay;
    const isDawn = tod >= 5 && tod < 8;
    const isDusk = tod >= 17.5 && tod < 20;
    if (kind === 'butterfly') {
      if (!isDay) return 0;
      if (w === 'storm' || w === 'rain') return 0;
      if (w === 'drizzle') return 0.35;
      if (isDawn || isDusk) return 0.7;
      return 1;
    }
    if (kind === 'bird') {
      if (w === 'storm') return 0.15;
      if (w === 'rain') return 0.35;
      if (isNight) return 0.08;
      return 1;
    }
    if (kind === 'deer') {
      if (w === 'storm') return 0.3; // hide during storm, shelter
      if (isNight) return 0.55;
      return 1;
    }
    return 1;
  }

  return {
    update(dt, playerPos, env = null) {
      frame++;
      // Pass env for lifecycle so individual meshes can fade
      birds.update(dt, playerPos);
      // lifecycle dimming for birds (opacity via material, not count)
      try {
        const bOp = lifecycleOpacity('bird', env);
        if (birds.mesh?.material) {
          birds.mesh.material.transparent = bOp < 0.99;
          birds.mesh.material.opacity = birds.mesh.material.opacity === undefined ? 1 : THREE.MathUtils.lerp(birds.mesh.material.opacity, bOp, Math.min(1, dt * 1.2));
        }
      } catch {}
      fish.update(dt, playerPos);
      // Heavy ground critters can run at half rate on low.
      if (shouldRunHeavy() || frame % 3 === 0) {
        deer.update(dt, playerPos);
        boars.update(dt, playerPos);
        // deer/boar hide during storm (fade)
        try {
          const dOp = lifecycleOpacity('deer', env);
          for (const m of [deer.mesh, boars.mesh]) if (m?.material) { m.material.transparent = dOp < 0.99; m.material.opacity = THREE.MathUtils.lerp(m.material.opacity ?? 1, dOp, Math.min(1, dt * 0.8)); }
        } catch {}
      } else {
        deer.update(0, playerPos);
        boars.update(0, playerPos);
      }
      if (shouldRunHeavy()) {
        butterflies.update(dt, playerPos);
        crabs.update(dt, playerPos);
      } else if (frame % 2 === 0) {
        butterflies.update(dt, playerPos);
        crabs.update(dt, playerPos);
      }
      // butterfly lifecycle: fade by time/weather
      try {
        const bfOp = lifecycleOpacity('butterfly', env);
        if (butterflies.mesh?.material) {
          butterflies.mesh.material.opacity = THREE.MathUtils.lerp(butterflies.mesh.material.opacity ?? 0.95, bfOp * 0.95, Math.min(1, dt * 1.0));
          butterflies.mesh.material.transparent = true;
        }
      } catch {}
      dragonflies.update(dt, playerPos, env);
      bats.update(dt, playerPos, env);
    },
    applyDensity() {
      birds.applyDensity();
      deer.applyDensity();
      fish.applyDensity();
      butterflies.applyDensity();
      crabs.applyDensity();
      boars.applyDensity();
      dragonflies.applyDensity();
      bats.applyDensity();
    },
    setVisible(v) {
      for (const m of [birds.mesh, deer.mesh, fish.mesh, butterflies.mesh, crabs.mesh, boars.mesh, dragonflies.mesh, bats.mesh]) m.visible = v;
    },
  };
}
