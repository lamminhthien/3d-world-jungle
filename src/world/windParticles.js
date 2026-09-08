// Wind-borne streaks + ground gusts (dust / pollen / leaf flecks)
// Lightweight GPU Points that drift with windState. Wraps around the player
// so the infinite world always has visible wind, no matter where you stroll.
// Desktop only — disabled on low tier (saves fill rate + CPU).

import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';
import { windState } from './wind.js';
import { getGraphics } from '../core/graphics.js';
import { groundHeight } from '../utils.js';

export function createWindParticles(scene) {
  if (QUALITY.low) {
    return { update() {}, dispose() {}, applyGraphics() {} };
  }

  const COUNT = 110;
  const BOX = 52; // wraps ±26 around player
  const H_MIN = 0.12;
  const H_MAX = 2.2;

  const pos = new Float32Array(COUNT * 3);
  const col = new Float32Array(COUNT * 3);
  const size = new Float32Array(COUNT);
  const seed = new Float32Array(COUNT); // per-particle wobble phase

  const palette = [
    new THREE.Color(0xddf0c2), // pale dry leaf
    new THREE.Color(0xe8d8a8), // dust
    new THREE.Color(0xcfe8b0), // pollen
    new THREE.Color(0xfff2a8), // sunlit mote
  ];

  for (let i = 0; i < COUNT; i++) {
    pos[i * 3] = (Math.random() - 0.5) * BOX;
    pos[i * 3 + 1] = H_MIN + Math.random() * (H_MAX - H_MIN);
    pos[i * 3 + 2] = (Math.random() - 0.5) * BOX;
    const c = palette[(Math.random() * palette.length) | 0];
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    // streaky motes have varied size — dust smaller, leaf bigger
    size[i] = 0.06 + Math.random() * 0.14 + (i % 7 === 0 ? 0.10 : 0);
    seed[i] = Math.random() * Math.PI * 2;
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));

  // Canvas streak texture — tiny horizontal streak, baked once
  function makeStreakTex() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 16;
    const g = c.getContext('2d');
    g.clearRect(0, 0, 64, 16);
    const grad = g.createLinearGradient(0, 8, 64, 8);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.2, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.5, 'rgba(255,255,255,1)');
    grad.addColorStop(0.8, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 6, 64, 4);
    // soft glow
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(4, 4, 56, 8);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
  }

  let streakTex = null;
  try { streakTex = makeStreakTex(); } catch {}

  const mat = new THREE.PointsMaterial({
    size: 0.22,
    transparent: true,
    opacity: 0.0,
    vertexColors: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    map: streakTex || null,
    alphaTest: 0.01,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.visible = true;
  points.renderOrder = 2;
  scene.add(points);

  // Ground gust decals — 3 large faint streaks hugging the terrain (like wind washing the grass)
  let gusts = null;
  let gustMat = null;
  try {
    const gustGeo = new THREE.PlaneGeometry(12, 2.2, 1, 1);
    // subtle taper alpha via vertex colors
    const gPos = gustGeo.attributes.position;
    const gCol = new Float32Array(gPos.count * 3);
    for (let i = 0; i < gPos.count; i++) {
      const x = gPos.getX(i); // -6..6
      const t = (x + 6) / 12; // 0..1
      const a = Math.sin(t * Math.PI) * 0.5; // center brighter
      gCol[i * 3] = a; gCol[i * 3 + 1] = a; gCol[i * 3 + 2] = a;
    }
    gustGeo.setAttribute('color', new THREE.BufferAttribute(gCol, 3));
    gustMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      vertexColors: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    gusts = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(gustGeo, gustMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((Math.random() - 0.5) * 20, 0.06, (Math.random() - 0.5) * 20);
      m.userData.phase = Math.random() * Math.PI * 2;
      m.userData.speed = 0.6 + Math.random() * 0.7;
      gusts.add(m);
    }
    scene.add(gusts);
  } catch {}

  let acc = 0;

  function update(dt, playerPos) {
    // Respect graphics toggle + low tier + particles slider
    let windOn = true;
    let partMul = 1;
    try {
      const g = getGraphics();
      if (g?.windSway === false) windOn = false;
      partMul = g?.particles ?? 1;
      if (g?.particles === 0) windOn = false;
    } catch {}
    if (!windOn || QUALITY.low) {
      mat.opacity = Math.max(0, mat.opacity - dt * 1.5);
      if (gustMat) gustMat.opacity = Math.max(0, gustMat.opacity - dt * 1.5);
      return;
    }

    const px = playerPos ? playerPos.x : 0;
    const pz = playerPos ? playerPos.z : 0;
    const str = windState.strength;
    // Visibility scales with wind — still visible at calm (0.35) but pops in gusts
    const targetOp = THREE.MathUtils.clamp(0.18 + str * 0.55, 0.08, 0.72) * THREE.MathUtils.clamp(partMul, 0, 1);
    mat.opacity += (targetOp - mat.opacity) * Math.min(1, dt * 1.2);
    if (gustMat) {
      const gustOp = THREE.MathUtils.clamp(str * 0.22, 0, 0.22) * (0.6 + 0.4 * Math.sin(windState.time * 0.7)) * Math.min(1, partMul * 1.2);
      gustMat.opacity += (gustOp - gustMat.opacity) * Math.min(1, dt * 0.8);
    }

    const arr = geo.attributes.position.array;
    const half = BOX / 2;
    // Wind velocity in world units/sec — tuned so streaks visibly rush past
    const baseSpeed = 2.2 + str * 6.5;
    const wx = windState.direction.x * baseSpeed;
    const wz = windState.direction.y * baseSpeed;

    acc += dt;
    for (let i = 0; i < COUNT; i++) {
      const j = i * 3;
      // drift along wind
      arr[j] += wx * dt;
      arr[j + 2] += wz * dt;
      // gentle vertical bob + wobble perpendicular to wind
      const perpX = -windState.direction.y;
      const perpZ = windState.direction.x;
      arr[j] += Math.sin(acc * 0.9 + seed[i]) * dt * 0.35 * perpX;
      arr[j + 2] += Math.sin(acc * 0.9 + seed[i]) * dt * 0.35 * perpZ;
      arr[j + 1] += Math.sin(acc * 1.4 + seed[i] * 1.7) * dt * 0.12;
      // wrap around player (torus)
      if (arr[j] - px > half) arr[j] -= BOX;
      if (arr[j] - px < -half) arr[j] += BOX;
      if (arr[j + 2] - pz > half) arr[j + 2] -= BOX;
      if (arr[j + 2] - pz < -half) arr[j + 2] += BOX;
      // height variation — keep near ground, respawn height occasionally
      if (arr[j + 1] < H_MIN) arr[j + 1] = H_MAX - Math.random() * 0.4;
      if (arr[j + 1] > H_MAX + 0.8) arr[j + 1] = H_MIN + Math.random() * 0.3;
      // snap Y to terrain + hover so motes don't go underground on hills
      const gh = groundHeight(arr[j], arr[j + 2]);
      if (arr[j + 1] < gh + 0.08) arr[j + 1] = gh + 0.12 + Math.random() * 0.5;
    }
    geo.attributes.position.needsUpdate = true;

    // Ground gusts — slide along wind, hug terrain
    if (gusts && gustMat && gustMat.opacity > 0.015) {
      for (const g of gusts.children) {
        g.position.x += wx * dt * 0.85;
        g.position.z += wz * dt * 0.85;
        // wrap
        if (g.position.x - px > half) g.position.x -= BOX;
        if (g.position.x - px < -half) g.position.x += BOX;
        if (g.position.z - pz > half) g.position.z -= BOX;
        if (g.position.z - pz < -half) g.position.z += BOX;
        g.position.y = groundHeight(g.position.x, g.position.z) + 0.08;
        // orient along wind
        g.rotation.z = Math.atan2(wz, wx);
        // subtle pulse with gust
        const s = 1 + windState.gust * 0.45 + Math.sin(acc * g.userData.speed + g.userData.phase) * 0.08;
        g.scale.set(s, 1, 1);
      }
    }
  }

  function applyGraphics(g) {
    const want = g?.particles ?? 1;
    mat.opacity = want === 0 ? 0 : mat.opacity;
    points.visible = want !== 0 && g?.windSway !== false;
    if (gusts) gusts.visible = points.visible;
  }

  function dispose() {
    try { scene.remove(points); geo.dispose(); mat.dispose(); streakTex?.dispose?.(); } catch {}
    try { if (gusts) { scene.remove(gusts); gusts.children.forEach(c => c.geometry?.dispose?.()); gustMat?.dispose?.(); } } catch {}
  }

  return { update, dispose, applyGraphics, points, gusts };
}
