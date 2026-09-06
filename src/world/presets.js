// Static reusable vegetation presets + textured materials.
// ---------------------------------------------------------
// Before: tree/rock shapes were hard-coded inside chunks.js (and a dead
// trees.js). To add a new look you had to edit the generator.
// After: every look lives here as a STATIC PRESET object. The chunk
// generator, the legacy trees.js scatter, or a single preview Group all
// call the same place*() helpers, so looks stay consistent.
//
// Presets are data (id, kind, palette, scale range, collision) +
// small placer functions. Textures come from ./textures.js (procedural
// canvas, no image assets) and multiply with instanceColor tints.

import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';
import { dummy } from '../utils.js';
import { getBarkTexture, getBarkBump, getCactusTexture, getCactusBump, getLeafTexture, getLeafBump, getRockTexture, getRockBump } from './textures.js';

// ---- Palettes (kept identical to the old inline values) ----
export const PALETTES = {
  pine: [0x2e7d4f, 0x256b43, 0x37935d],
  snowPine: [0xdfeee8, 0xcfe3d8, 0x9fc3b4],
  broadleaf: [0x5da344, 0x74bd4a, 0x4a8540, 0x8ac14f],
  palmLeaf: 0x55a347,
  bush: 0x5f9e46,
  dryBush: 0xb5a642,
  grass: 0x69b34c,
  dryGrass: 0xc2b26a,
  trunk: 0x7b5334,
  coconut: 0x5c3d24,
  cactus: 0x2f9e44,
};

// ---- Static preset catalog: pick by id for hand placement / UI ----
export const VEGETATION_PRESETS = [
  { id: 'pine-tall',     kind: 'pine',      sMin: 0.8, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle', 'mountain'] },
  { id: 'pine-snow',     kind: 'pineSnow',  sMin: 0.7, sMax: 1.2,  collisionR: 0.55, biomes: ['snow', 'mountain'] },
  { id: 'broadleaf',     kind: 'broadleaf', sMin: 0.8, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle'] },
  { id: 'palm',          kind: 'palm',      sMin: 0.8, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle', 'beach'] },
  { id: 'bush',          kind: 'bush',      sMin: 0.6, sMax: 1.4,  collisionR: 0,    biomes: ['jungle'] },
  { id: 'dry-bush',      kind: 'dryBush',   sMin: 0.5, sMax: 0.9,  collisionR: 0,    biomes: ['desert'] },
  { id: 'cactus',        kind: 'cactus',    sMin: 0.7, sMax: 1.4,  collisionR: 0.5,  biomes: ['desert'] },
  { id: 'rock',          kind: 'rock',      sMin: 0.4, sMax: 1.6,  collisionR: 0.8,  biomes: ['jungle', 'desert', 'mountain', 'snow'] },
  { id: 'grass-tuft',    kind: 'grass',     sMin: 0.5, sMax: 1.1,  collisionR: 0,    biomes: ['jungle', 'beach'] },
];

export const presetById = (id) => VEGETATION_PRESETS.find((p) => p.id === id);

// ---- Textured materials (one per pool, shared by all instances) ----
// map = fine color grain, bumpMap = matching relief (sun catches the grain).
// Low tier (A13 Safari): MeshLambertMaterial + color map only. Lambert skips
// roughness/metalness/derivative flat-shading math that makes Standard so
// expensive per fragment, and dropping the bumpMap saves a texture fetch.
function texturedMat(color, map, bumpMap, bumpScale = 0.05, extra = {}) {
  if (QUALITY.low) {
    return new THREE.MeshLambertMaterial({ color, map, flatShading: true, ...extra });
  }
  return new THREE.MeshStandardMaterial({
    color, map, bumpMap, bumpScale, flatShading: true, roughness: 0.95, metalness: 0, ...extra,
  });
}

// ---- Palm frond geometry: anchored bent blade (base at origin, extends +Z) ----
// Replaces the old 4-sided cone spike. Cheap plane (8 tris) re-shaped per
// vertex: tapered width, V-fold spine (catches sun), droop arc to the tip.
// Base at origin => placer puts the base exactly at the crown, no float gap.
function createPalmFrondGeometry() {
  const LEN = 2.7;
  const SEG = 4;
  const geo = new THREE.PlaneGeometry(1.0, LEN, 1, SEG);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); // -0.5 .. 0.5
    const y = pos.getY(i); // -LEN/2 .. LEN/2
    const t = (y + LEN / 2) / LEN; // 0 base .. 1 tip
    // Width profile: narrow stem -> widest ~35% -> sharp tip.
    const w = t < 0.35
      ? 0.22 + 0.78 * (t / 0.35)
      : Math.max(0.02, 1 - ((t - 0.35) / 0.65) * 0.98);
    const wx = x * w;
    // V-fold ridge + parabolic droop.
    const lift = Math.abs(wx) * 0.45;
    const droop = t * t * 0.85;
    pos.setXYZ(i, wx, lift - droop, t * LEN);
  }
  geo.computeVertexNormals();
  return geo;
}

// Fronds per palm — single source of truth for pool sizing (chunks/trees).
export const PALM_FRONDS = 6;

// ---- P0 tessellation (docs/tessellation-improvement-plan.md) ----
// Static pre-baked kit: every geometry below is built ONCE per page load and
// shared by all chunks/bridges/previews (this is the "static tessellation"
// idea — no per-frame or per-rebuild math in JS, just reuse of baked
// ArrayBuffers uploaded to the GPU once). createVegetationKit() returns the
// singleton; jitter/sag/bend loops never re-run on chunk crossings.
function hashSeedInt(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h | 0;
}

function hashInt(n, seedInt) {
  let h = Math.imul(n ^ seedInt, 2654435761);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296);
}

// Radial jitter: displaces each unique vertex along its radius by ±amt.
// Same tri count, asymmetric silhouette; per-instance rotation supplies the
// variety (3 geometries would need 3 pools = +2 draw calls, deferred to P1).
// Integer-quantized keys (no `${toFixed}` string allocs) + imul hash (no
// per-vertex string concat/char loop). Runs once at kit build, not per frame.
function jitterRadial(geo, amt, seed) {
  const seedInt = hashSeedInt(seed);
  const pos = geo.attributes.position;
  const arr = pos.array;
  const seen = new Map();
  for (let i = 0; i < pos.count; i++) {
    const xi = Math.round(arr[i * 3] * 1e4);
    const yi = Math.round(arr[i * 3 + 1] * 1e4);
    const zi = Math.round(arr[i * 3 + 2] * 1e4);
    const key = (Math.imul(xi, 73856093) ^ Math.imul(yi, 19349663) ^ Math.imul(zi, 83492791)) | 0;
    let f = seen.get(key);
    if (f === undefined) {
      f = 1 + (hashInt(key, seedInt) - 0.5) * 2 * amt;
      seen.set(key, f);
    }
    arr[i * 3] *= f;
    arr[i * 3 + 1] *= f;
    arr[i * 3 + 2] *= f;
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

// Pine crown: 8 sides (was 7 — the heptagon rim showed top-down) + droop lip
// (bottom ring pulled in 6%, 0 extra tris, reads as layered needles).
function createPineGeometry() {
  const geo = new THREE.ConeGeometry(1.25, 2.6, 8);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -1.2) {
      pos.setX(i, pos.getX(i) * 0.94);
      pos.setZ(i, pos.getZ(i) * 0.94);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

// Grass tuft: 3 crossed quads (1×2 segs each = 4 tris, 12 total), base at y=0,
// tapered to a point tip with a forward arc bend. Opaque, DoubleSide — no
// alpha texture, so no transparent overdraw on tiled mobile GPUs.
function createGrassTuftGeometry() {
  const W = 0.55;
  const H = 0.65;
  const blades = [];
  for (let b = 0; b < 3; b++) {
    const p = new THREE.PlaneGeometry(W, H, 1, 2);
    p.translate(0, H / 2, 0); // base at origin => placer sits it on the ground
    const pos = p.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const t = pos.getY(i) / H; // 0 base .. 1 tip
      const w = t < 0.5 ? 1 - t * 0.5 : Math.max(0.06, 1 - t * 0.94);
      const bend = t * t * 0.22 + t * 0.06 * (b - 1);
      pos.setX(i, x * w);
      pos.setZ(i, pos.getZ(i) * w + bend);
    }
    p.rotateY((b / 3) * Math.PI * 2);
    blades.push(p);
  }
  // Manual merge (avoids a BufferGeometryUtils import for 3 tiny planes).
  let vTotal = 0;
  let iTotal = 0;
  for (const b of blades) { vTotal += b.attributes.position.count; iTotal += b.index.count; }
  const merged = new THREE.BufferGeometry();
  const mp = new Float32Array(vTotal * 3);
  const mn = new Float32Array(vTotal * 3);
  const mu = new Float32Array(vTotal * 2);
  const mi = new Uint16Array(iTotal);
  let vo = 0;
  let io = 0;
  for (const b of blades) {
    mp.set(b.attributes.position.array, vo * 3);
    mn.set(b.attributes.normal.array, vo * 3);
    mu.set(b.attributes.uv.array, vo * 2);
    const idx = b.index.array;
    for (let i = 0; i < idx.length; i++) mi[io + i] = vo + idx[i];
    vo += b.attributes.position.count;
    io += idx.length;
    b.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(mn, 3));
  merged.setAttribute('uv', new THREE.BufferAttribute(mu, 2));
  merged.setIndex(new THREE.BufferAttribute(mi, 1));
  merged.computeVertexNormals();
  return merged;
}

let _kit = null;
export function createVegetationKit() {
  // Singleton: tessellated geometries are static binary buffers — baking them
  // once (~a few ms at boot) instead of per preview/per regenerate. Before,
  // buildPresetGroup() called createVegetationKit() fresh every time, re-running
  // jitter + grass-merge + computeVertexNormals needlessly.
  if (_kit) return _kit;
  const geometries = {
    // P0: 7 sides + butt flare (was 6-sided hexagon, visible at spawn distance).
    trunk: new THREE.CylinderGeometry(0.22, 0.34, 1.4, 7),
    pine: createPineGeometry(),
    // P0: same tri counts, baked asymmetric jitter (rotation adds variety).
    blob: jitterRadial(new THREE.IcosahedronGeometry(1.25, 0), 0.1, 'blob'),
    palmLeaf: createPalmFrondGeometry(),
    bush: jitterRadial(new THREE.IcosahedronGeometry(0.7, 0), 0.12, 'bush'),
    // P0: 8 sides (was 7), flat caps kept.
    cactus: new THREE.CylinderGeometry(0.32, 0.4, 2.4, 8),
    rock: jitterRadial(new THREE.DodecahedronGeometry(1, 0), 0.12, 'rock'),
    grass: createGrassTuftGeometry(),
  };
  const materials = {
    trunk: texturedMat(0xffffff, getBarkTexture(), getBarkBump(), 0.08),
    pine: texturedMat(0xffffff, getLeafTexture(), getLeafBump(), 0.04),
    blob: texturedMat(0xffffff, getLeafTexture(), getLeafBump(), 0.04),
    palmLeaf: texturedMat(0xffffff, getLeafTexture(), getLeafBump(), 0.03, { side: THREE.DoubleSide }),
    bush: texturedMat(0xffffff, getLeafTexture(), getLeafBump(), 0.04),
    cactus: texturedMat(0xffffff, getCactusTexture(), getCactusBump(), 0.06),
    rock: texturedMat(0xffffff, getRockTexture(), getRockBump(), 0.07, { roughness: 1 }),
    grass: texturedMat(0xffffff, getLeafTexture(), getLeafBump(), 0.03, { side: THREE.DoubleSide }),
  };
  _kit = { geometries, materials };
  return _kit;
}

// ---- Small helpers (rng-injected so chunk gen stays deterministic) ----
const rand = (rng, a, b) => a + rng() * (b - a);
const pick = (rng, arr) => arr[(rng() * arr.length) | 0];
const _col = new THREE.Color(); // shared scratch; setColorAt copies values
// Fast tint: offsetHSL() does RGB->HSL->RGB (branchy, ~10x slower than a
// multiply). Lightness-only jitter is visually identical as a scale, so use
// direct channel scaling. dl in [-0.08, 0.08] typical.
function tintFast(hex, dl) {
  _col.set(hex);
  const f = 1 + dl;
  _col.r = _col.r * f > 1 ? 1 : _col.r * f;
  _col.g = _col.g * f > 1 ? 1 : _col.g * f;
  _col.b = _col.b * f > 1 ? 1 : _col.b * f;
  return _col;
}

function setTrunk(meshes, bucket, obstacles, x, y, z, s, rng, tint = PALETTES.trunk) {
  meshes.trunk.setColorAt(bucket.ti, tintFast(tint, rand(rng, -0.03, 0.03)));
  dummy.position.set(x, y, z);
  dummy.rotation.set(rand(rng, -0.08, 0.08), rand(rng, 0, 6.28), rand(rng, -0.08, 0.08));
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  meshes.trunk.setMatrixAt(bucket.ti++, dummy.matrix);
  obstacles.push({ x, z, r: 0.55 * s });
  return bucket.ti - 1; // trunk instance index (palms overwrite it taller)
}

// ---- Placers: one per preset kind. All reuse trunk/crown pools. ----
export function placePine(meshes, bucket, obstacles, x, y, z, s, rng, palette = PALETTES.pine) {
  const ti = setTrunk(meshes, bucket, obstacles, x, y + 0.7 * s, z, s, rng);
  for (let k = 0; k < 2; k++) {
    meshes.pine.setColorAt(bucket.pi, _col.set(pick(rng, palette)));
    dummy.position.set(x, y + (1.9 + k * 1.15) * s, z);
    dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
    dummy.scale.setScalar(s * (k === 0 ? 1 : 0.68));
    dummy.updateMatrix();
    meshes.pine.setMatrixAt(bucket.pi++, dummy.matrix);
  }
  return ti;
}

export function placeBroadleaf(meshes, bucket, obstacles, x, y, z, s, rng) {
  setTrunk(meshes, bucket, obstacles, x, y + 0.7 * s, z, s, rng);
  for (let k = 0; k < 2; k++) {
    meshes.blob.setColorAt(bucket.bi, _col.set(pick(rng, PALETTES.broadleaf)));
    dummy.position.set(x + rand(rng, -0.4, 0.4) * s, y + (2.1 + k * 0.8) * s, z + rand(rng, -0.4, 0.4) * s);
    dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
    dummy.scale.set(s * rand(rng, 0.9, 1.2), s * rand(rng, 0.8, 1), s * rand(rng, 0.9, 1.2));
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  }
}

export function placePalm(meshes, bucket, obstacles, x, y, z, s, rng) {
  const ti = setTrunk(meshes, bucket, obstacles, x, y + 0.7 * s, z, s, rng);
  // taller, slightly tilted trunk for palms (overwrites previous matrix)
  dummy.position.set(x, y + 1.1 * s, z);
  dummy.rotation.order = 'XYZ';
  dummy.rotation.set(0.15, rand(rng, 0, 6.28), 0.12);
  dummy.scale.setScalar(s * 1.15);
  dummy.updateMatrix();
  meshes.trunk.setMatrixAt(ti, dummy.matrix);
  const topY = y + 2.2 * s;
  const topX = x + 0.25;
  const topZ = z + 0.2;
  // Two tiers: 3 outer skirt fronds (strong droop) + 3 inner spears (upright,
  // azimuth-offset). Base-anchored geometry => base sits exactly at the crown.
  for (let k = 0; k < PALM_FRONDS; k++) {
    const outer = k < 3;
    const j = k % 3;
    const a = (j / 3) * Math.PI * 2 + (outer ? 0 : Math.PI / 3) + rand(rng, -0.15, 0.15);
    const yaw = Math.PI / 2 - a;
    const pitch = outer ? rand(rng, 0.45, 0.65) : rand(rng, 0.08, 0.26);
    meshes.palm.setColorAt(bucket.palmi, tintFast(PALETTES.palmLeaf, rand(rng, -0.03, 0.03)));
    dummy.position.set(topX, topY + (outer ? -0.05 : 0.14) * s, topZ);
    dummy.rotation.order = 'YXZ'; // yaw, then droop pitch
    dummy.rotation.set(pitch, yaw, rand(rng, -0.12, 0.12));
    dummy.scale.setScalar(s * rand(rng, 0.85, 1.0));
    dummy.updateMatrix();
    meshes.palm.setMatrixAt(bucket.palmi++, dummy.matrix);
  }
  dummy.rotation.order = 'XYZ'; // restore for other placers sharing `dummy`
  // coconut cluster
  meshes.blob.setColorAt(bucket.bi, _col.set(PALETTES.coconut));
  dummy.position.set(topX, topY - 0.05, topZ);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.setScalar(0.32 * s);
  dummy.updateMatrix();
  meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
}

export function placeBush(meshes, bucket, x, y, z, s, rng, tint = PALETTES.bush) {
  // Was offsetHSL(hue±0.02, 0, light±0.04): hue shift baked as r/b skew, ~10x cheaper.
  _col.set(tint);
  const h = rand(rng, -0.02, 0.02);
  const l = rand(rng, -0.04, 0.04);
  _col.r *= (1 + h + l);
  _col.b *= (1 - h + l);
  _col.g *= (1 + l);
  meshes.bush.setColorAt(bucket.bu, _col);
  dummy.position.set(x, y + 0.3, z);
  dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  meshes.bush.setMatrixAt(bucket.bu++, dummy.matrix);
}

export function placeCactus(meshes, bucket, obstacles, x, y, z, s, rng) {
  _col.set(PALETTES.cactus);
  const l = rand(rng, -0.03, 0.03) + 0.05;
  _col.r *= (1 + l);
  _col.g *= (1 + l);
  _col.b *= (1 + l);
  meshes.cactus.setColorAt(bucket.ci, _col);
  dummy.position.set(x, y + 1.1 * s, z);
  dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  meshes.cactus.setMatrixAt(bucket.ci++, dummy.matrix);
  obstacles.push({ x, z, r: 0.5 * s });
}

// Grass tuft: walkable (no obstacle), base sits exactly on the ground.
// Caller guards `bucket.gi < POOL.grass`; POOL lives in chunks.js.
export function placeGrass(meshes, bucket, x, y, z, s, rng, tint = PALETTES.grass) {
  meshes.grass.setColorAt(bucket.gi, tintFast(tint, rand(rng, -0.04, 0.04)));
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  meshes.grass.setMatrixAt(bucket.gi++, dummy.matrix);
}

export function placeRock(meshes, bucket, obstacles, x, y, z, s, rng, tint = 0x9aa0a3, collide = false) {
  // Was offsetHSL(0, -0.05, ±): saturation dip ≈ pull r/b toward g; do it directly.
  _col.set(tint);
  const l = rand(rng, -0.05, 0.02);
  _col.r *= (1 + l * 0.9);
  _col.g *= (1 + l);
  _col.b *= (1 + l * 0.9);
  meshes.rock.setColorAt(bucket.ri, _col);
  dummy.position.set(x, y + s * 0.25, z);
  dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), rand(rng, 0, 3));
  dummy.scale.set(s * rand(rng, 0.8, 1.3), s * rand(rng, 0.6, 1), s * rand(rng, 0.8, 1.3));
  dummy.updateMatrix();
  meshes.rock.setMatrixAt(bucket.ri++, dummy.matrix);
  if (collide || s > 0.9) obstacles.push({ x, z, r: s * 0.8 });
}

// ---- Non-instanced single tree (hero trees, previews, tests) ----
// Returns a THREE.Group using the same shapes/palette as the instanced pools.
export function buildPresetGroup(presetId, { materials } = {}) {
  const preset = presetById(presetId) ?? presetById('broadleaf');
  const kit = createVegetationKit();
  const mats = materials ?? kit.materials;
  const geos = kit.geometries;
  const g = new THREE.Group();
  const add = (geo, mat, color, pos, rot, scale) => {
    const m = new THREE.Mesh(geo, mat.clone());
    m.material.color.set(color);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const s = 1;
  if (preset.kind === 'pine' || preset.kind === 'pineSnow') {
    const pal = preset.kind === 'pineSnow' ? PALETTES.snowPine : PALETTES.pine;
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 0.7, 0], [0, 0, 0], [s, s, s]);
    add(geos.pine, mats.pine, pal[0], [0, 1.9, 0], [0, 0, 0], [s, s, s]);
    add(geos.pine, mats.pine, pal[1], [0, 3.05, 0], [0, 1, 0], [0.68, 0.68, 0.68]);
  } else if (preset.kind === 'palm') {
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 1.1, 0], [0.15, 0, 0.12], [1.15, 1.15, 1.15]);
    for (let k = 0; k < PALM_FRONDS; k++) {
      const outer = k < 3;
      const j = k % 3;
      const a = (j / 3) * Math.PI * 2 + (outer ? 0 : Math.PI / 3);
      const yaw = Math.PI / 2 - a;
      const pitch = outer ? 0.55 : 0.17;
      const m = add(geos.palmLeaf, mats.palmLeaf, PALETTES.palmLeaf,
        [0.25, 2.2 + (outer ? -0.05 : 0.14), 0.2],
        [0, 0, 0], [1, 1, 1]);
      m.rotation.order = 'YXZ';
      m.rotation.set(pitch, yaw, 0);
    }
    add(geos.blob, mats.blob, PALETTES.coconut, [0.25, 2.15, 0.2], [0, 0, 0], [0.32, 0.32, 0.32]);
  } else if (preset.kind === 'cactus') {
    add(geos.cactus, mats.cactus, PALETTES.cactus, [0, 1.1, 0], [0, 0, 0], [s, s, s]);
  } else if (preset.kind === 'grass') {
    add(geos.grass, mats.grass, PALETTES.grass, [0, 0, 0], [0, 0, 0], [s, s, s]);
  } else if (preset.kind === 'rock' || preset.kind === 'bush' || preset.kind === 'dryBush') {
    const geo = preset.kind === 'rock' ? geos.rock : geos.bush;
    const mat = preset.kind === 'rock' ? mats.rock : mats.bush;
    const col = preset.kind === 'rock' ? 0x9aa0a3 : preset.kind === 'dryBush' ? PALETTES.dryBush : PALETTES.bush;
    add(geo, mat, col, [0, 0.3, 0], [0, 0, 0], [s, s * 0.8, s]);
  } else {
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 0.7, 0], [0, 0, 0], [s, s, s]);
    add(geos.blob, mats.blob, PALETTES.broadleaf[0], [0, 2.1, 0], [0, 0, 0], [s, s, s]);
    add(geos.blob, mats.blob, PALETTES.broadleaf[1], [0.3, 2.9, 0.2], [1, 1, 0], [s, s * 0.9, s]);
  }
  g.userData.presetId = preset.id;
  return g;
}
