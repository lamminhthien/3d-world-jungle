// Campsites & campfire system (docs/enhance_for_night_screen.md sections 4-5).
// - Procedural placement: flat clearings near river banks / meadows.
// - Each site: low-poly tent + log seats + stone fire pit + PointLight.
// - Fire FX: flickering light (intensity/distance jitter) + rising ember
//   particles + drifting smoke. Warm contrast vs cool moonlight at night.
// - Deterministic per seed; regenerates on seed change.
import * as THREE from 'three';
import { flatMat } from '../utils.js';
import { proceduralGroundHeight, riverDist } from './procedural.js';
import { rngFromString } from './noise.js';

const SITE_COUNT = 5;
const EMBERS_PER_FIRE = 22;
const SMOKE_PER_FIRE = 8;

function isFlat(x, z) {
  const h0 = proceduralGroundHeight(x, z);
  if (h0 < -0.1) return false; // no water / wet bank
  const s = 1.2;
  const pts = [
    proceduralGroundHeight(x + s, z),
    proceduralGroundHeight(x - s, z),
    proceduralGroundHeight(x, z + s),
    proceduralGroundHeight(x, z - s),
  ];
  return pts.every((h) => Math.abs(h - h0) < 0.45 && h > -0.1);
}

// Spiral search outward from a candidate for a flat, off-river spot.
function findSite(rng, cx, cz) {
  for (let r = 0; r < 14; r += 1.5) {
    for (let k = 0; k < 10; k++) {
      const a = rng() * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const d = riverDist(x, z);
      if (d < 4.2 || d > 12) continue; // near bank but not in water
      if (!isFlat(x, z)) continue;
      if (Math.abs(x) > 60 || Math.abs(z) > 60) continue;
      return { x, z, y: proceduralGroundHeight(x, z) };
    }
  }
  return null;
}

function buildTent(mats) {
  const g = new THREE.Group();
  // Low-poly A-frame tent: 4-sided cone squashed = pyramid tent.
  const tent = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.7, 4), mats.tent);
  tent.position.y = 0.85;
  tent.rotation.y = Math.PI / 4;
  tent.castShadow = tent.receiveShadow = true;
  g.add(tent);
  // Dark entrance triangle.
  const door = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.9, 3), mats.door);
  door.position.set(0, 0.45, 1.02);
  door.rotation.y = Math.PI;
  g.add(door);
  // Ground sheet.
  const sheet = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 2.0), mats.sheet);
  sheet.position.y = 0.03;
  sheet.receiveShadow = true;
  g.add(sheet);
  return g;
}

function buildFirePit(mats) {
  const g = new THREE.Group();
  // Stone ring.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16, 0), mats.stone);
    st.position.set(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55);
    st.rotation.set(a, a * 2, 0);
    st.castShadow = true;
    g.add(st);
  }
  // Crossed logs.
  for (let i = 0; i < 3; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 6), mats.log);
    const a = (i / 3) * Math.PI;
    log.position.y = 0.12;
    log.rotation.set(Math.PI / 2, 0, a);
    log.castShadow = true;
    g.add(log);
  }
  // Flame cones (emissive; scale-pulsed in update).
  const flameOuter = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.8, 7),
    new THREE.MeshBasicMaterial({ color: 0xff6a1f, transparent: true, opacity: 0.92 }),
  );
  flameOuter.position.y = 0.55;
  const flameInner = new THREE.Mesh(
    new THREE.ConeGeometry(0.17, 0.5, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.95 }),
  );
  flameInner.position.y = 0.45;
  g.add(flameOuter, flameInner);
  return { group: g, flameOuter, flameInner };
}

function makeParticles(n, { color, size, opacity, blending }) {
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    color, size, transparent: true, opacity,
    depthWrite: false, blending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return { pts, geo, mat };
}

function buildCampsite(pos, rotY, mats) {
  const g = new THREE.Group();
  g.position.set(pos.x, pos.y, pos.z);
  g.rotation.y = rotY;

  const tent = buildTent(mats);
  tent.position.set(-2.2, 0, -0.6);
  tent.rotation.y = 0.5;
  g.add(tent);

  // Log seats around the fire.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 7), mats.log);
    seat.position.set(Math.cos(a) * 1.5, 0.22, Math.sin(a) * 1.5);
    seat.rotation.set(Math.PI / 2, 0, -a + Math.PI / 2);
    seat.castShadow = seat.receiveShadow = true;
    g.add(seat);
  }

  const fire = buildFirePit(mats);
  g.add(fire.group);

  // Warm campfire light (doc: base + random flicker).
  const light = new THREE.PointLight(0xff8c3a, 2.0, 15, 2);
  light.position.set(0, 1.0, 0);
  g.add(light);

  // Embers: rise + fade, loop.
  const embers = makeParticles(EMBERS_PER_FIRE, {
    color: 0xffa63d, size: 0.22, opacity: 0.95, blending: THREE.AdditiveBlending,
  });
  embers.pts.position.y = 0.5;
  g.add(embers.pts);
  const emberVel = new Float32Array(EMBERS_PER_FIRE);
  const emberLife = new Float32Array(EMBERS_PER_FIRE);
  const ep = embers.geo.attributes.position.array;
  for (let i = 0; i < EMBERS_PER_FIRE; i++) {
    ep[i * 3] = (Math.random() - 0.5) * 0.5;
    ep[i * 3 + 1] = Math.random() * 1.6;
    ep[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
    emberVel[i] = 1.0 + Math.random() * 1.6;
    emberLife[i] = Math.random();
  }

  // Smoke: soft grey puffs drifting up.
  const smoke = makeParticles(SMOKE_PER_FIRE, {
    color: 0x9aa0a8, size: 0.7, opacity: 0.22, blending: THREE.NormalBlending,
  });
  smoke.pts.position.y = 1.2;
  g.add(smoke.pts);
  const sp = smoke.geo.attributes.position.array;
  const smokeVel = new Float32Array(SMOKE_PER_FIRE);
  for (let i = 0; i < SMOKE_PER_FIRE; i++) {
    sp[i * 3] = (Math.random() - 0.5) * 0.4;
    sp[i * 3 + 1] = Math.random() * 2.2;
    sp[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
    smokeVel[i] = 0.5 + Math.random() * 0.5;
  }

  return {
    group: g, pos: { ...pos }, light,
    flameOuter: fire.flameOuter, flameInner: fire.flameInner,
    embers, emberVel, emberLife, smoke, smokeVel,
    phase: Math.random() * 100,
    baseIntensity: 2.0,
  };
}

export function createCampsites(scene, seed = 'FOREST_123') {
  const mats = {
    tent: flatMat(0xe07a3f),
    tent2: flatMat(0x2a9d8f),
    door: new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 1 }),
    sheet: flatMat(0x8a6f4d),
    log: flatMat(0x7a5233),
    stone: flatMat(0x8d9299),
  };

  let sites = [];
  let group = new THREE.Group();
  scene.add(group);

  function layout(seedStr) {
    const rng = rngFromString(`camps:${seedStr}`);
    const found = [];
    for (let i = 0; i < SITE_COUNT; i++) {
      const a = (i / SITE_COUNT) * Math.PI * 2 + rng() * 0.8;
      const r = 16 + rng() * 16;
      const s = findSite(rng, Math.cos(a) * r, Math.sin(a) * r);
      if (s) found.push(s);
    }
    return found;
  }

  function build(seedStr) {
    // Clear old.
    for (const s of sites) {
      group.remove(s.group);
      s.embers.geo.dispose(); s.embers.mat.dispose();
      s.smoke.geo.dispose(); s.smoke.mat.dispose();
    }
    sites = [];
    const spots = layout(seedStr);
    spots.forEach((p, i) => {
      const tentMat = { ...mats, tent: i % 2 ? mats.tent2 : mats.tent };
      const s = buildCampsite(p, (i * 1.7) % (Math.PI * 2), tentMat);
      group.add(s.group);
      sites.push(s);
    });
  }

  build(String(seed));

  function nearestDist(px, pz) {
    let best = Infinity;
    for (const s of sites) {
      const d = Math.hypot(px - s.pos.x, pz - s.pos.z);
      if (d < best) best = d;
    }
    return best;
  }

  return {
    get sites() { return sites; },
    regenerate(newSeed) { build(String(newSeed)); },
    /** 0 far .. 1 at the fire — for crackle audio + warm HUD. */
    getFireProximity(px, pz, radius = 14) {
      const d = nearestDist(px, pz);
      return THREE.MathUtils.clamp(1 - d / radius, 0, 1);
    },
    update(dt, elapsed, focus, nightFactor = 0) {
      const nf = THREE.MathUtils.clamp(nightFactor, 0, 1);
      for (const s of sites) {
        // Doc: light.intensity = base + random flicker; warmer at night.
        const flicker = Math.sin(elapsed * 13 + s.phase) * 0.15
          + Math.sin(elapsed * 29 + s.phase * 2) * 0.08
          + (Math.random() - 0.5) * 0.35;
        const dayBase = 0.9;
        const nightBase = 2.4;
        s.light.intensity = THREE.MathUtils.lerp(dayBase, nightBase, nf) + flicker * (0.5 + nf);
        s.light.distance = 12 + nf * 5 + flicker * 1.5;

        // Flame pulse.
        const p = 1 + Math.sin(elapsed * 11 + s.phase) * 0.12 + Math.random() * 0.06;
        s.flameOuter.scale.set(p, p * (1 + nf * 0.15), p);
        s.flameInner.scale.set(2 - p * 0.5, p, 2 - p * 0.5);
        s.flameOuter.rotation.y += dt * 2;
        s.flameInner.rotation.y -= dt * 3;

        // Embers rise + respawn.
        const ep = s.embers.geo.attributes.position.array;
        for (let i = 0; i < EMBERS_PER_FIRE; i++) {
          ep[i * 3 + 1] += s.emberVel[i] * dt;
          ep[i * 3] += Math.sin(elapsed * 3 + i) * dt * 0.3;
          s.emberLife[i] += dt * 0.7;
          if (ep[i * 3 + 1] > 2.2 || s.emberLife[i] > 1.6) {
            ep[i * 3] = (Math.random() - 0.5) * 0.5;
            ep[i * 3 + 1] = 0;
            ep[i * 3 + 2] = (Math.random() - 0.5) * 0.5;
            s.emberLife[i] = 0;
          }
        }
        s.embers.geo.attributes.position.needsUpdate = true;
        s.embers.mat.opacity = 0.45 + nf * 0.5;

        // Smoke drifts up, wraps.
        const mp = s.smoke.geo.attributes.position.array;
        for (let i = 0; i < SMOKE_PER_FIRE; i++) {
          mp[i * 3 + 1] += s.smokeVel[i] * dt;
          mp[i * 3] += dt * 0.35;
          if (mp[i * 3 + 1] > 3.2) {
            mp[i * 3] = (Math.random() - 0.5) * 0.4;
            mp[i * 3 + 1] = 0.8;
            mp[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
          }
        }
        s.smoke.geo.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(group);
    },
  };
}
