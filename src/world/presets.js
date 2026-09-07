// Static reusable vegetation presets + textured materials.
// ---------------------------------------------------------
// Before: tree/rock shapes were hard-coded inside chunks.js (and a dead
// trees.js). To add a new look you had to edit the generator.
// After: every look lives here as a STATIC PRESET object. The chunk
// generator, the legacy trees.js scatter, or a single preview Group all
// call the same place*() helpers, so looks stay consistent.
//
// Presets are data (id, kind, palette, scale range, collision) +
// small placer functions. Textures come from ./textures.js (build-time baked
// assets with procedural fallback) and multiply with instanceColor tints.

import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';
import { dummy } from '../utils.js';
import { getBarkTexture, getBarkBump, getCactusTexture, getCactusBump, getRockTexture, getRockBump } from './textures.js';

// ---- Palettes ----
export const PALETTES = {
  pine: [0x2e7d4f, 0x256b43, 0x37935d],
  snowPine: [0xdfeee8, 0xcfe3d8, 0x9fc3b4],
  broadleaf: [0x5da344, 0x74bd4a, 0x4a8540, 0x8ac14f],
  // Canopy gradient: deep emerald -> vivid mid -> sunlit lime (punchy cartoon).
  canopyDeep: 0x2f8f3e,
  canopyMid: 0x46c24a,
  canopyLight: 0xa8e63f,
  canopyTeal: 0x2fbfa0,
  kapokLeaf: 0x3ec85c,
  palmLeaf: 0x37c26a,
  bananaLeaf: 0x4fe07a,
  bush: 0x46b455,
  dryBush: 0xd8b83c,
  grass: 0x5fd44e,
  grassGold: 0xe8d44f,
  dryGrass: 0xe0c25e,
  trunk: 0x8a5a33,
  trunkDark: 0x6b4423,
  trunkRainbow: 0x9e7b8e,
  coconut: 0x5c3d24,
  cactus: 0x35d05a,
  // Candy blossom canopy (spring flowering trees).
  blossom: [0xff6fb5, 0xff9ecf, 0xffc9e3, 0xfff0f6, 0xe0aaff, 0xffb37e],
  // Rainbow canopy: each puff gets its own candy color.
  rainbow: [0xff4f7e, 0xff8c42, 0xffd93b, 0x52e28a, 0x41c7e2, 0xb388ff, 0xff6fb5],
  // Golden accent tree: amber canopy pops against the greens.
  golden: [0xffc93b, 0xffb52e, 0xffe066],
  // Flower heads: one vivid color per instance (12 brights).
  flower: [0xff2e88, 0xff3b30, 0xff9500, 0xffcc00, 0xffffff, 0xb388ff,
    0x7b2ff7, 0xff6fa5, 0x00c2ff, 0xff5e3a, 0x7dff5e, 0xff4fd8],
  flowerStem: 0x3fa34d,
  // Fruits: one type per tree (mango / orange / apple / banana / coconut / berry).
  fruitMango: 0xff9f1c,
  fruitOrange: 0xff6a00,
  fruitApple: 0xff2233,
  fruitBanana: 0xffe93b,
  fruitCoconut: 0x6b4a2f,
  fruitBerry: 0xff2e88,
};

// ---- Static preset catalog: pick by id for hand placement / UI ----
export const VEGETATION_PRESETS = [
  { id: 'pine-tall',     kind: 'pine',      sMin: 0.8, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle', 'mountain'] },
  { id: 'pine-snow',     kind: 'pineSnow',  sMin: 0.7, sMax: 1.2,  collisionR: 0.55, biomes: ['snow', 'mountain'] },
  { id: 'broadleaf',     kind: 'broadleaf', sMin: 0.8, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle'] },
  { id: 'fruit-tree',    kind: 'fruitTree', sMin: 0.8, sMax: 1.4,  collisionR: 0.55, biomes: ['jungle'] },
  { id: 'blossom-tree',  kind: 'blossom',   sMin: 0.8, sMax: 1.4,  collisionR: 0.55, biomes: ['jungle'] },
  { id: 'rainbow-tree',   kind: 'rainbow',   sMin: 0.9, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle'] },
  { id: 'golden-tree',    kind: 'golden',    sMin: 0.8, sMax: 1.4,  collisionR: 0.55, biomes: ['jungle'] },
  { id: 'kapok-giant',   kind: 'kapok',     sMin: 1.0, sMax: 1.6,  collisionR: 0.7,  biomes: ['jungle'] },
  { id: 'banana-clump',  kind: 'banana',    sMin: 0.7, sMax: 1.2,  collisionR: 0.5,  biomes: ['jungle', 'beach'] },
  { id: 'palm',          kind: 'palm',      sMin: 0.8, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle', 'beach'] },
  { id: 'bush',          kind: 'bush',      sMin: 0.6, sMax: 1.4,  collisionR: 0,    biomes: ['jungle'] },
  { id: 'flowering-bush',kind: 'flowerBush',sMin: 0.5, sMax: 1.0,  collisionR: 0,    biomes: ['jungle', 'beach'] },
  { id: 'flower-patch',  kind: 'flowers',   sMin: 0.6, sMax: 1.1,  collisionR: 0,    biomes: ['jungle', 'beach'] },
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
  // Crown shadow at the stem -> sunlit blade (baked along the height).
  bakeTopLight(geo, 0.82, 1.06);
  return geo;
}

// Fronds per palm — single source of truth for pool sizing (chunks/trees).
// Desktop: 8 in 2 tiers (4 outer skirt + 4 inner spears), low: 6 for perf.
export const PALM_FRONDS = QUALITY.low ? 6 : 8;

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

// Baked top-light: per-vertex grayscale (dark roots -> bright crown) that
// multiplies with instanceColor. Gives canopies real depth — sunlit top,
// shadowed underside — from geometry alone, no texture print needed.
// Runs once at kit build; zero per-frame cost.
function bakeTopLight(geo, bottom = 0.68, top = 1.1) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const span = Math.max(1e-4, bb.max.y - bb.min.y);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = THREE.MathUtils.clamp((pos.getY(i) - bb.min.y) / span, 0, 1);
    // Smoothstepped so the shadowing pools at the base and lifts at the rim.
    const f = bottom + (top - bottom) * (t * t * (3 - 2 * t));
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = f;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

// Pine crown: 8 sides, 3 height bands with alternating skirt widths (reads
// as layered needle branches) + droop lip at the rim.
function createPineGeometry() {
  const geo = new THREE.ConeGeometry(1.25, 2.6, 8, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (y + 1.3) / 2.6; // 0 base .. 1 apex
    // Alternate skirt fullness per band: even bands flare, odd tuck in.
    if (t > 0.02 && t < 0.98) {
      const band = Math.min(2, (t * 3) | 0);
      const f = band % 2 === 0 ? 1.07 : 0.93;
      pos.setX(i, pos.getX(i) * f);
      pos.setZ(i, pos.getZ(i) * f);
    }
    if (y < -1.2) {
      pos.setX(i, pos.getX(i) * 0.94);
      pos.setZ(i, pos.getZ(i) * 0.94);
    }
  }
  geo.computeVertexNormals();
  return bakeTopLight(geo, 0.62, 1.12);
}

// Cartoon-realistic trunk: tapered, gently bent (baked S-curve), root flare
// at the base (bottom ring pushed outward — reads as buttress roots), 3
// height segments so per-instance tilt/lean looks organic instead of stiff.
function createTrunkGeometry() {
  const geo = new THREE.CylinderGeometry(0.2, 0.34, 1.6, 7, 3);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = (y + 0.8) / 1.6; // 0 bottom .. 1 top
    // Gentle baked bend so straight instances still feel grown, not extruded.
    const bend = Math.sin(t * 1.4) * 0.07;
    let nx = x + bend;
    let nz = z + bend * 0.4;
    // Root flare: bottom 25% splays outward like buttress roots.
    if (y < -0.4) {
      const f = 1 + (-0.4 - y) * 0.85;
      nx *= f;
      nz *= f;
    }
    pos.setXYZ(i, nx, y, nz);
  }
  geo.computeVertexNormals();
  return geo;
}

// Canopy puff: faceted icosahedron (cartoon look) with a cushioned squash
// (bottom vertices tucked in 15% so blobs stack like cotton instead of balls),
// baked asymmetric jitter for silhouette variety, and baked top-light so the
// crown glows and the underside sits in soft shadow — no texture needed.
// Desktop uses detail 1 (80 facets, rounder foliage); low tier keeps 20.
function createCanopyGeometry() {
  const g = new THREE.IcosahedronGeometry(1.25, QUALITY.low ? 0 : 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) pos.setY(i, pos.getY(i) * 0.85);
  }
  g.computeVertexNormals();
  jitterRadial(g, QUALITY.low ? 0.09 : 0.07, 'canopy');
  return bakeTopLight(g, 0.66, 1.1);
}

// Flower stem: thin green spike, base at origin.
function createFlowerStemGeometry() {
  const g = new THREE.CylinderGeometry(0.025, 0.045, 0.55, 5);
  g.translate(0, 0.275, 0);
  return bakeTopLight(g, 0.75, 1.05);
}

// Flower head: squashed 5-petal cup (a short 5-sided cone reads as petals
// top-down; the faceted rim catches the sun), base at origin so the placer
// sits it exactly on the stem tip.
function createFlowerHeadGeometry() {
  const g = new THREE.ConeGeometry(0.19, 0.16, 5, 1);
  g.translate(0, 0.08, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Flare the rim outward like an open bloom.
    if (pos.getY(i) > 0.1) {
      pos.setX(i, pos.getX(i) * 1.18);
      pos.setZ(i, pos.getZ(i) * 1.18);
    }
  }
  g.computeVertexNormals();
  jitterRadial(g, 0.08, 'flower');
  return bakeTopLight(g, 0.8, 1.12);
}

// Leaf card: cheap billboard for dense foliage (2 tris, double-sided, vertex-colored).
// Tier-gated: desktop only (~3000 cards), low tier 0. Reads as extra leaf volume
// around the blob canopy without adding 80-tri puffs. Alpha masked via alphaTest.
function createLeafCardGeometry() {
  const geo = new THREE.PlaneGeometry(0.55, 0.78);
  // Slight bend for volume — droop the tip
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > 0) pos.setZ(i, pos.getZ(i) + 0.11);
  }
  geo.computeVertexNormals();
  bakeTopLight(geo, 0.75, 1.08);
  return geo;
}

// Reed variant: taller river-bank grass (1.1u vs 0.65u tuft) for Phase 4.
function createReedGeometry() {
  const W = 0.35;
  const H = 1.1;
  const blades = [];
  for (let b = 0; b < 3; b++) {
    const p = new THREE.PlaneGeometry(W, H, 1, 3);
    p.translate(0, H / 2, 0);
    const pos = p.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const t = pos.getY(i) / H;
      const w = t < 0.4 ? 1 - t * 0.3 : Math.max(0.08, 1 - t * 0.92);
      const bend = t * t * 0.35 + t * 0.05 * (b - 1);
      pos.setX(i, x * w);
      pos.setZ(i, pos.getZ(i) * w + bend);
    }
    p.rotateY((b / 3) * Math.PI * 2 + 0.15);
    blades.push(p);
  }
  let vTotal = 0, iTotal = 0;
  for (const b of blades) { vTotal += b.attributes.position.count; iTotal += b.index.count; }
  const merged = new THREE.BufferGeometry();
  const mp = new Float32Array(vTotal * 3);
  const mn = new Float32Array(vTotal * 3);
  const mu = new Float32Array(vTotal * 2);
  const mi = new Uint16Array(iTotal);
  let vo = 0, io = 0;
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
  bakeTopLight(merged, 0.6, 1.12);
  return merged;
}

// Fruit: small round cartoon orb (mango/orange/apple/coconut/berry differ by
// tint + non-uniform placer scale, not geometry — one pool serves all).
function createFruitGeometry() {
  return jitterRadial(new THREE.IcosahedronGeometry(0.18, 0), 0.07, 'fruit');
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
  // Dark roots -> bright tips, like sunlit grass.
  bakeTopLight(merged, 0.62, 1.1);
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
    trunk: createTrunkGeometry(),
    pine: createPineGeometry(),
    blob: createCanopyGeometry(),
    palmLeaf: createPalmFrondGeometry(),
    leafCard: createLeafCardGeometry(),
    reed: createReedGeometry(),
    bush: bakeTopLight(jitterRadial(new THREE.IcosahedronGeometry(0.7, 0), 0.12, 'bush'), 0.7, 1.08),
    // P0: 8 sides (was 7), flat caps kept.
    cactus: new THREE.CylinderGeometry(0.32, 0.4, 2.4, 8),
    rock: jitterRadial(new THREE.DodecahedronGeometry(1, 0), 0.12, 'rock'),
    grass: createGrassTuftGeometry(),
    flowerStem: createFlowerStemGeometry(),
    flowerHead: createFlowerHeadGeometry(),
    fruit: createFruitGeometry(),
  };
  const flatFruit = (extra = {}) => (QUALITY.low
    ? new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, ...extra })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 0.55, metalness: 0, ...extra }));
  // Foliage: NO color/bump maps — the leaflet print looked blotchy stretched
  // over big canopy facets (see screenshot). Depth comes from the faceted
  // geometry + baked top-light vertex colors × vivid instanceColor tints.
  // vertexColors:true requires every foliage geometry to carry a 'color'
  // attribute (baked via bakeTopLight above).
  const foliageMat = (roughness = 0.9, extra = {}) => (QUALITY.low
    ? new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, vertexColors: true, ...extra })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness, metalness: 0, vertexColors: true, ...extra }));
  const materials = {
    trunk: texturedMat(0xffffff, getBarkTexture(), getBarkBump(), 0.08),
    pine: foliageMat(0.9),
    blob: foliageMat(0.9),
    palmLeaf: foliageMat(0.85, { side: THREE.DoubleSide }),
    // Leaf cards: alphaTest not transparent (avoids sorting, keeps tiled GPUs happy).
    // Desktop only; low tier renders 0 cards (same draw call vanishes when count=0).
    leafCard: foliageMat(0.85, { side: THREE.DoubleSide, alphaTest: 0.5 }),
    reed: foliageMat(0.9, { side: THREE.DoubleSide }),
    bush: foliageMat(0.9),
    cactus: texturedMat(0xffffff, getCactusTexture(), getCactusBump(), 0.06),
    rock: texturedMat(0xffffff, getRockTexture(), getRockBump(), 0.07, { roughness: 1 }),
    grass: foliageMat(0.9, { side: THREE.DoubleSide }),
    flowerStem: foliageMat(0.9),
    flowerHead: foliageMat(0.6),
    // Fruits: clean smooth cartoon orbs (no grain map — speckle would read as dirt).
    fruit: flatFruit(),
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

// Dense foliage helpers — desktop only (tier-gated via bucket capacity checks).
// Reuse the blob pool for 2 satellite puffs per tree: overlap ±0.4u, scale 0.7-0.9
// Leaf cards: cheap 2-tri billboards around the canopy shell (alphaTest).
function addSatelliteBlobs(meshes, bucket, x, y, z, s, rng, baseTint) {
  if (QUALITY.low) return;
  if (bucket.bi + 2 > (meshes.blob?.count ?? Infinity) && bucket.bi + 2 > 5600) return;
  for (let k = 0; k < 2; k++) {
    if (bucket.bi >= (meshes.blob?.instanceMatrix?.count ?? 5600)) break;
    // Guard against overflow: pool sizing lives in chunks.js POOL.crowns
    if (bucket.bi >= 5600) break;
    meshes.blob.setColorAt(bucket.bi, tintFast(baseTint, rand(rng, -0.04, 0.04)));
    dummy.position.set(x + rand(rng, -0.4, 0.4) * s, y + rand(rng, 2.0, 3.2) * s, z + rand(rng, -0.4, 0.4) * s);
    dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
    const sc = rand(rng, 0.7, 0.9) * s;
    dummy.scale.set(sc * rand(rng, 0.9, 1.1), sc * 0.85, sc * rand(rng, 0.9, 1.1));
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  }
}

function addLeafCards(meshes, bucket, x, y, z, s, rng, tint) {
  if (QUALITY.low) return;
  if (!meshes.leafCard || bucket.lci === undefined) return;
  const n = 2 + ((rng() * 3) | 0); // 2-4 cards per tree
  for (let k = 0; k < n; k++) {
    if (bucket.lci >= (meshes.leafCard?.instanceMatrix?.count ?? 3000)) break;
    meshes.leafCard.setColorAt(bucket.lci, tintFast(tint, rand(rng, -0.03, 0.03)));
    const a = rng() * Math.PI * 2;
    const r = rand(rng, 0.6, 1.2) * s;
    dummy.position.set(x + Math.cos(a) * r, y + rand(rng, 2.0, 3.0) * s, z + Math.sin(a) * r);
    dummy.rotation.set(rand(rng, -0.2, 0.4), a + rand(rng, -0.5, 0.5), rand(rng, -0.3, 0.3));
    dummy.scale.setScalar(s * rand(rng, 0.8, 1.15));
    dummy.updateMatrix();
    meshes.leafCard.setMatrixAt(bucket.lci++, dummy.matrix);
  }
}

// Branch: reuses the trunk pool (thin tilted instance, no collision).
// Keeps the pool count at 1 draw call instead of adding a branch geometry.
function addBranch(meshes, bucket, x, y, z, s, rng, tint = PALETTES.trunkDark) {
  meshes.trunk.setColorAt(bucket.ti, tintFast(tint, rand(rng, -0.03, 0.03)));
  dummy.position.set(x, y, z);
  dummy.rotation.set(rand(rng, 0.5, 0.9), rand(rng, 0, 6.28), rand(rng, -0.3, 0.3));
  dummy.scale.set(0.32 * s, 0.75 * s, 0.32 * s);
  dummy.updateMatrix();
  meshes.trunk.setMatrixAt(bucket.ti++, dummy.matrix);
}

// Single fruit orb. elongate stretches Y (bananas), tint picks the species.
function addFruit(meshes, bucket, x, y, z, s, rng, tint, elongate = 1) {
  if (!meshes.fruit || bucket.fri === undefined) return;
  meshes.fruit.setColorAt(bucket.fri, tintFast(tint, rand(rng, -0.03, 0.03)));
  dummy.position.set(x, y, z);
  dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
  dummy.scale.set(s, s * elongate, s);
  dummy.updateMatrix();
  meshes.fruit.setMatrixAt(bucket.fri++, dummy.matrix);
}

// Single blossom: green stem + vivid head. Stemless when stemH <= 0
// (petals scattered on the ground under blossom trees).
function addFlower(meshes, bucket, x, y, z, s, rng, tint, stemH = 0.55) {
  if (!meshes.flowerHead || bucket.fhi === undefined) return;
  if (stemH > 0 && meshes.flowerStem && bucket.fsti !== undefined) {
    meshes.flowerStem.setColorAt(bucket.fsti, tintFast(PALETTES.flowerStem, rand(rng, -0.04, 0.04)));
    dummy.position.set(x, y, z);
    dummy.rotation.set(rand(rng, -0.12, 0.12), rand(rng, 0, 6.28), rand(rng, -0.12, 0.12));
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    meshes.flowerStem.setMatrixAt(bucket.fsti++, dummy.matrix);
  }
  meshes.flowerHead.setColorAt(bucket.fhi, tintFast(tint, rand(rng, -0.02, 0.02)));
  dummy.position.set(x, y + (stemH > 0 ? stemH * s : 0.06), z);
  dummy.rotation.set(rand(rng, -0.3, 0.3), rand(rng, 0, 6.28), rand(rng, -0.3, 0.3));
  dummy.scale.set(s * rand(rng, 0.8, 1.2), s * 0.85, s * rand(rng, 0.8, 1.2));
  dummy.updateMatrix();
  meshes.flowerHead.setMatrixAt(bucket.fhi++, dummy.matrix);
}

// ---- Placers: one per preset kind. All reuse trunk/crown pools. ----
export function placePine(meshes, bucket, obstacles, x, y, z, s, rng, palette = PALETTES.pine) {
  const ti = setTrunk(meshes, bucket, obstacles, x, y + 0.8 * s, z, s, rng);
  // 3-tier cartoon conifer: wide dark base -> sunlit tip (was 2 flat tiers).
  const tiers = [
    { dy: 1.85, sc: 1.0, col: palette[1] ?? palette[0] },
    { dy: 2.75, sc: 0.74, col: palette[0] ?? palette[1] },
    { dy: 3.45, sc: 0.5, col: palette[2] ?? palette[0] },
  ];
  for (const t of tiers) {
    meshes.pine.setColorAt(bucket.pi, tintFast(t.col, rand(rng, -0.02, 0.02)));
    dummy.position.set(x + rand(rng, -0.12, 0.12) * s, y + t.dy * s, z + rand(rng, -0.12, 0.12) * s);
    dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
    dummy.scale.setScalar(s * t.sc);
    dummy.updateMatrix();
    meshes.pine.setMatrixAt(bucket.pi++, dummy.matrix);
  }
  return ti;
}

export function placeBroadleaf(meshes, bucket, obstacles, x, y, z, s, rng) {
  setTrunk(meshes, bucket, obstacles, x, y + 0.8 * s, z, s, rng);
  // Forked limbs reaching into the canopy (2 thin trunk instances).
  addBranch(meshes, bucket, x, y + 1.5 * s, z, s, rng);
  addBranch(meshes, bucket, x, y + 1.7 * s, z, s * 0.8, rng);
  // 3-puff cartoon canopy: deep shadow base, mid body, sunlit crown.
  const puffs = [
    { dy: 2.15, ox: 0, oz: 0, sx: 1.25, sy: 0.95, tint: PALETTES.canopyDeep },
    { dy: 2.85, ox: 0.45, oz: 0.3, sx: 1.0, sy: 0.9, tint: PALETTES.canopyMid },
    { dy: 3.45, ox: -0.2, oz: -0.25, sx: 0.72, sy: 0.7, tint: PALETTES.canopyLight },
  ];
  for (const p of puffs) {
    meshes.blob.setColorAt(bucket.bi, tintFast(p.tint, rand(rng, -0.03, 0.03)));
    dummy.position.set(x + (p.ox + rand(rng, -0.2, 0.2)) * s, y + p.dy * s, z + (p.oz + rand(rng, -0.2, 0.2)) * s);
    dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
    dummy.scale.set(s * p.sx * rand(rng, 0.92, 1.08), s * p.sy, s * p.sx * rand(rng, 0.92, 1.08));
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  }
  // Dense upgrade (desktop): 2 satellite puffs + leaf cards around shell.
  addSatelliteBlobs(meshes, bucket, x, y, z, s, rng, PALETTES.canopyMid);
  addLeafCards(meshes, bucket, x, y, z, s, rng, PALETTES.canopyLight);
}

// Mango / orange / apple tree: stout trunk, rounded canopy, fruit ring.
// One fruit species per tree (tint + elongate fixed per call).
export function placeFruitTree(meshes, bucket, obstacles, x, y, z, s, rng) {
  const species = pick(rng, [
    { tint: PALETTES.fruitMango, elongate: 1.15 },
    { tint: PALETTES.fruitOrange, elongate: 1.0 },
    { tint: PALETTES.fruitApple, elongate: 0.95 },
    { tint: PALETTES.fruitBerry, elongate: 0.8 },
  ]);
  setTrunk(meshes, bucket, obstacles, x, y + 0.75 * s, z, s, rng, PALETTES.trunkDark);
  addBranch(meshes, bucket, x, y + 1.4 * s, z, s * 0.9, rng);
  const puffs = [
    { dy: 2.0, ox: 0, oz: 0, sc: 1.15, tint: PALETTES.canopyMid },
    { dy: 2.65, ox: 0.4, oz: -0.3, sc: 0.9, tint: PALETTES.canopyLight },
    { dy: 2.5, ox: -0.45, oz: 0.35, sc: 0.85, tint: PALETTES.canopyMid },
  ];
  for (const p of puffs) {
    meshes.blob.setColorAt(bucket.bi, tintFast(p.tint, rand(rng, -0.03, 0.03)));
    dummy.position.set(x + p.ox * s, y + p.dy * s, z + p.oz * s);
    dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
    dummy.scale.setScalar(s * p.sc);
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  }
  addSatelliteBlobs(meshes, bucket, x, y, z, s, rng, PALETTES.canopyMid);
  addLeafCards(meshes, bucket, x, y, z, s, rng, PALETTES.canopyLight);
  // Fruit ring hanging on the canopy shell.
  const n = 4 + ((rng() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rand(rng, -0.3, 0.3);
    const r = rand(rng, 0.7, 1.1) * s;
    addFruit(meshes, bucket,
      x + Math.cos(a) * r, y + rand(rng, 1.7, 2.4) * s, z + Math.sin(a) * r,
      s * rand(rng, 0.75, 1.0), rng, species.tint, species.elongate);
  }
}

// Flowering blossom tree: pink/white puffs + fallen petals underneath.
export function placeBlossomTree(meshes, bucket, obstacles, x, y, z, s, rng) {
  setTrunk(meshes, bucket, obstacles, x, y + 0.8 * s, z, s, rng);
  addBranch(meshes, bucket, x, y + 1.5 * s, z, s, rng);
  for (let k = 0; k < 3; k++) {
    meshes.blob.setColorAt(bucket.bi, tintFast(pick(rng, PALETTES.blossom), rand(rng, -0.02, 0.02)));
    dummy.position.set(x + rand(rng, -0.55, 0.55) * s, y + (2.1 + k * 0.62) * s, z + rand(rng, -0.55, 0.55) * s);
    dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
    dummy.scale.set(s * rand(rng, 0.95, 1.2), s * rand(rng, 0.8, 0.95), s * rand(rng, 0.95, 1.2));
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  }
  addSatelliteBlobs(meshes, bucket, x, y, z, s, rng, pick(rng, PALETTES.blossom));
  addLeafCards(meshes, bucket, x, y, z, s, rng, pick(rng, PALETTES.blossom));
  // Fallen petal scatter (stemless blossoms on the grass).
  const n = 3 + ((rng() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2;
    const r = rand(rng, 1.2, 2.4) * s;
    addFlower(meshes, bucket, x + Math.cos(a) * r, y + 0.02, z + Math.sin(a) * r,
      rand(rng, 0.6, 1.0), rng, pick(rng, PALETTES.blossom), 0);
  }
}

// Rainbow eucalyptus: candy-colored puffs (one vivid hue each) on a pale
// trunk — the rare eye-catcher on the horizon.
export function placeRainbowTree(meshes, bucket, obstacles, x, y, z, s, rng) {
  setTrunk(meshes, bucket, obstacles, x, y + 0.8 * s, z, s, rng, PALETTES.trunkRainbow);
  addBranch(meshes, bucket, x, y + 1.5 * s, z, s, rng, PALETTES.trunkRainbow);
  addBranch(meshes, bucket, x, y + 1.7 * s, z, s * 0.8, rng, PALETTES.trunkRainbow);
  // Shuffle a fresh candy order per tree so no two rainbows match.
  const cols = [...PALETTES.rainbow];
  for (let i = cols.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [cols[i], cols[j]] = [cols[j], cols[i]];
  }
  const puffs = [
    { dy: 2.15, ox: 0, oz: 0, sc: 1.25 },
    { dy: 2.85, ox: 0.45, oz: 0.3, sc: 1.0 },
    { dy: 3.45, ox: -0.2, oz: -0.25, sc: 0.75 },
    { dy: 2.6, ox: -0.5, oz: 0.4, sc: 0.85 },
  ];
  for (let k = 0; k < puffs.length; k++) {
    const p = puffs[k];
    meshes.blob.setColorAt(bucket.bi, tintFast(cols[k % cols.length], rand(rng, -0.02, 0.02)));
    dummy.position.set(x + (p.ox + rand(rng, -0.2, 0.2)) * s, y + p.dy * s, z + (p.oz + rand(rng, -0.2, 0.2)) * s);
    dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
    dummy.scale.set(s * p.sc, s * p.sc * 0.9, s * p.sc);
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  }
}

// Golden ginkgo: amber canopy that glows against the green jungle.
export function placeGoldenTree(meshes, bucket, obstacles, x, y, z, s, rng) {
  setTrunk(meshes, bucket, obstacles, x, y + 0.8 * s, z, s, rng, PALETTES.trunkDark);
  addBranch(meshes, bucket, x, y + 1.5 * s, z, s, rng);
  for (let k = 0; k < 3; k++) {
    meshes.blob.setColorAt(bucket.bi, tintFast(pick(rng, PALETTES.golden), rand(rng, -0.02, 0.02)));
    dummy.position.set(x + rand(rng, -0.55, 0.55) * s, y + (2.1 + k * 0.62) * s, z + rand(rng, -0.55, 0.55) * s);
    dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
    dummy.scale.set(s * rand(rng, 0.95, 1.2), s * rand(rng, 0.8, 0.95), s * rand(rng, 0.95, 1.2));
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  }
  addSatelliteBlobs(meshes, bucket, x, y, z, s, rng, PALETTES.golden[0]);
  addLeafCards(meshes, bucket, x, y, z, s, rng, pick(rng, PALETTES.golden));
}

// Kapok emergent giant: tallest silhouette, buttress roots, umbrella crown.
export function placeKapok(meshes, bucket, obstacles, x, y, z, s, rng) {
  const ti = setTrunk(meshes, bucket, obstacles, x, y + 1.15 * s, z, s, rng, PALETTES.trunkDark);
  // Stretch the trunk tall (overwrite): emergent towers over the canopy.
  dummy.position.set(x, y + 1.15 * s, z);
  dummy.rotation.set(rand(rng, -0.05, 0.05), rand(rng, 0, 6.28), rand(rng, -0.05, 0.05));
  dummy.scale.set(1.15 * s, 2.3 * s, 1.15 * s);
  dummy.updateMatrix();
  meshes.trunk.setMatrixAt(ti, dummy.matrix);
  // 3 buttress roots splaying from the base.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + rand(rng, -0.3, 0.3);
    meshes.trunk.setColorAt(bucket.ti, tintFast(PALETTES.trunkDark, rand(rng, -0.03, 0.03)));
    dummy.position.set(x + Math.cos(a) * 0.5 * s, y + 0.35 * s, z + Math.sin(a) * 0.5 * s);
    dummy.rotation.set(0.6, -a, 0.25);
    dummy.scale.set(0.4 * s, 0.8 * s, 0.4 * s);
    dummy.updateMatrix();
    meshes.trunk.setMatrixAt(bucket.ti++, dummy.matrix);
  }
  // Umbrella crown: flat wide center + 4 satellites.
  meshes.blob.setColorAt(bucket.bi, tintFast(PALETTES.kapokLeaf, rand(rng, -0.03, 0.03)));
  dummy.position.set(x, y + 4.6 * s, z);
  dummy.rotation.set(0, rand(rng, 0, 3), 0);
  dummy.scale.set(1.6 * s, 0.75 * s, 1.6 * s);
  dummy.updateMatrix();
  meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rand(rng, -0.25, 0.25);
    meshes.blob.setColorAt(bucket.bi, tintFast(k % 2 ? PALETTES.canopyMid : PALETTES.kapokLeaf, rand(rng, -0.03, 0.03)));
    dummy.position.set(x + Math.cos(a) * 1.35 * s, y + rand(rng, 4.0, 4.4) * s, z + Math.sin(a) * 1.35 * s);
    dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
    dummy.scale.set(s * rand(rng, 0.85, 1.05), s * 0.65, s * rand(rng, 0.85, 1.05));
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  }
  // Desktop extra satellite + leaf cards for fuller umbrella
  addSatelliteBlobs(meshes, bucket, x, y, z, s, rng, PALETTES.kapokLeaf);
  addLeafCards(meshes, bucket, x, y, z, s, rng, PALETTES.kapokLeaf);
}

// Banana clump: green pseudo-stem + broad droopy leaves + banana bunch.
export function placeBanana(meshes, bucket, obstacles, x, y, z, s, rng) {
  setTrunk(meshes, bucket, obstacles, x, y + 0.55 * s, z, s * 0.8, rng, 0x7ab648);
  const topY = y + 1.55 * s;
  for (let k = 0; k < PALM_FRONDS; k++) {
    const a = (k / PALM_FRONDS) * Math.PI * 2 + rand(rng, -0.2, 0.2);
    const yaw = Math.PI / 2 - a;
    meshes.palm.setColorAt(bucket.palmi, tintFast(PALETTES.bananaLeaf, rand(rng, -0.04, 0.04)));
    dummy.position.set(x, topY, z);
    dummy.rotation.order = 'YXZ';
    dummy.rotation.set(rand(rng, 0.35, 0.75), yaw, rand(rng, -0.1, 0.1));
    // Broad banana blades: stretch the frond wider via non-uniform scale.
    dummy.scale.set(s * rand(rng, 1.5, 1.9), s * rand(rng, 0.85, 1.0), s * rand(rng, 0.85, 1.0));
    dummy.updateMatrix();
    meshes.palm.setMatrixAt(bucket.palmi++, dummy.matrix);
  }
  dummy.rotation.order = 'XYZ';
  // Banana bunch hanging under the crown.
  const bx = x + rand(rng, -0.3, 0.3);
  const bz = z + rand(rng, -0.3, 0.3);
  for (let k = 0; k < 3; k++) {
    addFruit(meshes, bucket, bx + rand(rng, -0.15, 0.15), topY - 0.25 - k * 0.16 * s, bz + rand(rng, -0.15, 0.15),
      s * 0.7, rng, PALETTES.fruitBanana, 1.5);
  }
}

export function placePalm(meshes, bucket, obstacles, x, y, z, s, rng) {
  const ti = setTrunk(meshes, bucket, obstacles, x, y + 0.8 * s, z, s, rng);
  // taller, slightly tilted trunk for palms (overwrites previous matrix)
  dummy.position.set(x, y + 1.25 * s, z);
  dummy.rotation.order = 'XYZ';
  dummy.rotation.set(0.15, rand(rng, 0, 6.28), 0.12);
  dummy.scale.setScalar(s * 1.15);
  dummy.updateMatrix();
  meshes.trunk.setMatrixAt(ti, dummy.matrix);
  const topY = y + 2.45 * s;
  const topX = x + 0.25;
  const topZ = z + 0.2;
  // Two tiers: outer skirt (strong droop) + inner spears (upright, azimuth-offset).
  // Desktop 8 = 4+4, low 6 = 3+3. Base-anchored geometry sits exactly at crown.
  const perTier = PALM_FRONDS / 2 | 0;
  const offset = Math.PI / perTier;
  for (let k = 0; k < PALM_FRONDS; k++) {
    const outer = k < perTier;
    const j = k % perTier;
    const a = (j / perTier) * Math.PI * 2 + (outer ? 0 : offset) + rand(rng, -0.15, 0.15);
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
  // Coconut cluster: true brown orbs from the fruit pool (was a grey blob).
  for (let k = 0; k < 3; k++) {
    addFruit(meshes, bucket,
      topX + rand(rng, -0.22, 0.22) * s, topY - 0.18 * s - (k === 2 ? 0.18 * s : 0), topZ + rand(rng, -0.22, 0.22) * s,
      s * rand(rng, 0.7, 0.85), rng, PALETTES.fruitCoconut, 1.0);
  }
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
  // Cartoon tuft: squash + secondary lump offset for a two-lobe shrub.
  dummy.scale.set(s * rand(rng, 1.0, 1.25), s * 0.8, s * rand(rng, 1.0, 1.25));
  dummy.updateMatrix();
  meshes.bush.setMatrixAt(bucket.bu++, dummy.matrix);
}

// Flowering bush: green tuft + vivid blossoms dotted on the crown.
export function placeFloweringBush(meshes, bucket, x, y, z, s, rng) {
  placeBush(meshes, bucket, x, y, z, s, rng, pick(rng, [PALETTES.bush, 0x6fae4e, 0x4e9e52]));
  const n = 3 + ((rng() * 3) | 0);
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2;
    const r = rand(rng, 0.1, 0.55) * s;
    addFlower(meshes, bucket,
      x + Math.cos(a) * r, y + rand(rng, 0.35, 0.65) * s, z + Math.sin(a) * r,
      s * rand(rng, 0.55, 0.85), rng, pick(rng, PALETTES.flower), 0);
  }
}

// Flower patch: lush cluster of tall stems with mixed vivid heads.
// Bigger (5-8 blooms) so the jungle floor reads as a flower meadow.
export function placeFlowerPatch(meshes, bucket, x, y, z, s, rng) {
  const n = 5 + ((rng() * 4) | 0);
  for (let k = 0; k < n; k++) {
    addFlower(meshes, bucket,
      x + rand(rng, -1.0, 1.0) * s, y, z + rand(rng, -1.0, 1.0) * s,
      s * rand(rng, 0.85, 1.3), rng, pick(rng, PALETTES.flower), rand(rng, 0.5, 0.7));
  }
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

// Reed: taller river-bank variant (1.1u) — reuses grass logic but with reed geometry.
export function placeReed(meshes, bucket, x, y, z, s, rng, tint = PALETTES.grass) {
  if (!meshes.reed || bucket.reedi === undefined) return;
  meshes.reed.setColorAt(bucket.reedi, tintFast(tint, rand(rng, -0.04, 0.04)));
  dummy.position.set(x, y, z);
  dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  meshes.reed.setMatrixAt(bucket.reedi++, dummy.matrix);
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
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 0.8, 0], [0, 0, 0], [s, s, s]);
    add(geos.pine, mats.pine, pal[1] ?? pal[0], [0, 1.85, 0], [0, 0, 0], [s, s, s]);
    add(geos.pine, mats.pine, pal[0], [0, 2.75, 0], [0, 1, 0], [0.74, 0.74, 0.74]);
    add(geos.pine, mats.pine, pal[2] ?? pal[0], [0, 3.45, 0], [0, 2, 0], [0.5, 0.5, 0.5]);
  } else if (preset.kind === 'palm') {
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 1.25, 0], [0.15, 0, 0.12], [1.15, 1.15, 1.15]);
    for (let k = 0; k < PALM_FRONDS; k++) {
      const outer = k < 3;
      const j = k % 3;
      const a = (j / 3) * Math.PI * 2 + (outer ? 0 : Math.PI / 3);
      const yaw = Math.PI / 2 - a;
      const pitch = outer ? 0.55 : 0.17;
      const m = add(geos.palmLeaf, mats.palmLeaf, PALETTES.palmLeaf,
        [0.25, 2.45 + (outer ? -0.05 : 0.14), 0.2],
        [0, 0, 0], [1, 1, 1]);
      m.rotation.order = 'YXZ';
      m.rotation.set(pitch, yaw, 0);
    }
    add(geos.fruit, mats.fruit, PALETTES.fruitCoconut, [0.25, 2.27, 0.2], [0, 0, 0], [0.8, 0.8, 0.8]);
  } else if (preset.kind === 'fruitTree') {
    add(geos.trunk, mats.trunk, PALETTES.trunkDark, [0, 0.75, 0], [0, 0, 0], [s, s, s]);
    add(geos.blob, mats.blob, PALETTES.canopyMid, [0, 2.0, 0], [0, 0, 0], [1.15, 1.0, 1.15]);
    add(geos.blob, mats.blob, PALETTES.canopyLight, [0.4, 2.65, -0.3], [0, 1, 0], [0.9, 0.85, 0.9]);
    add(geos.fruit, mats.fruit, PALETTES.fruitMango, [0.7, 1.9, 0.4], [0, 0, 0], [0.9, 1.0, 0.9]);
    add(geos.fruit, mats.fruit, PALETTES.fruitMango, [-0.6, 2.1, -0.5], [0, 0, 0], [0.9, 1.0, 0.9]);
  } else if (preset.kind === 'blossom') {
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 0.8, 0], [0, 0, 0], [s, s, s]);
    add(geos.blob, mats.blob, PALETTES.blossom[0], [0, 2.1, 0], [0, 0, 0], [1.1, 0.95, 1.1]);
    add(geos.blob, mats.blob, PALETTES.blossom[1], [0.3, 2.75, 0.2], [1, 1, 0], [0.95, 0.85, 0.95]);
    add(geos.flowerHead, mats.flowerHead, PALETTES.blossom[2], [1.4, 0.08, 0.6], [0, 0, 0], [0.9, 0.8, 0.9]);
  } else if (preset.kind === 'rainbow') {
    add(geos.trunk, mats.trunk, PALETTES.trunkRainbow, [0, 0.8, 0], [0, 0, 0], [s, s, s]);
    add(geos.blob, mats.blob, PALETTES.rainbow[0], [0, 2.15, 0], [0, 0, 0], [1.25, 1.1, 1.25]);
    add(geos.blob, mats.blob, PALETTES.rainbow[3], [0.45, 2.85, 0.3], [0, 1, 0], [1.0, 0.9, 1.0]);
    add(geos.blob, mats.blob, PALETTES.rainbow[5], [-0.2, 3.45, -0.25], [1, 1, 0], [0.75, 0.7, 0.75]);
    add(geos.blob, mats.blob, PALETTES.rainbow[2], [-0.5, 2.6, 0.4], [0, 2, 0], [0.85, 0.8, 0.85]);
  } else if (preset.kind === 'golden') {
    add(geos.trunk, mats.trunk, PALETTES.trunkDark, [0, 0.8, 0], [0, 0, 0], [s, s, s]);
    add(geos.blob, mats.blob, PALETTES.golden[0], [0, 2.1, 0], [0, 0, 0], [1.1, 0.95, 1.1]);
    add(geos.blob, mats.blob, PALETTES.golden[1], [0.3, 2.75, 0.2], [1, 1, 0], [0.95, 0.85, 0.95]);
    add(geos.blob, mats.blob, PALETTES.golden[2], [-0.2, 3.3, -0.2], [0, 2, 0], [0.7, 0.65, 0.7]);
  } else if (preset.kind === 'kapok') {
    add(geos.trunk, mats.trunk, PALETTES.trunkDark, [0, 1.15, 0], [0, 0, 0], [1.15, 2.3, 1.15]);
    add(geos.blob, mats.blob, PALETTES.kapokLeaf, [0, 4.6, 0], [0, 0, 0], [1.6, 0.75, 1.6]);
    add(geos.blob, mats.blob, PALETTES.canopyMid, [1.35, 4.2, 0], [0, 1, 0], [1.0, 0.65, 1.0]);
    add(geos.blob, mats.blob, PALETTES.canopyMid, [-1.35, 4.2, 0], [0, 2, 0], [1.0, 0.65, 1.0]);
  } else if (preset.kind === 'banana') {
    add(geos.trunk, mats.trunk, 0x7ab648, [0, 0.44, 0], [0, 0, 0], [0.8, 0.8, 0.8]);
    const m = add(geos.palmLeaf, mats.palmLeaf, PALETTES.bananaLeaf, [0, 1.55, 0], [0, 0, 0], [1.7, 1, 1]);
    m.rotation.order = 'YXZ';
    m.rotation.set(0.5, 0, 0);
    add(geos.fruit, mats.fruit, PALETTES.fruitBanana, [0.2, 1.2, 0.1], [0, 0, 0], [0.7, 1.05, 0.7]);
  } else if (preset.kind === 'flowerBush') {
    add(geos.bush, mats.bush, PALETTES.bush, [0, 0.3, 0], [0, 0, 0], [s, s * 0.8, s]);
    add(geos.flowerHead, mats.flowerHead, PALETTES.flower[0], [0.3, 0.6, 0.2], [0, 0, 0], [0.8, 0.7, 0.8]);
    add(geos.flowerHead, mats.flowerHead, PALETTES.flower[2], [-0.3, 0.55, -0.1], [0, 0, 0], [0.8, 0.7, 0.8]);
  } else if (preset.kind === 'flowers') {
    add(geos.flowerStem, mats.flowerStem, PALETTES.flowerStem, [0, 0, 0], [0, 0, 0], [s, s, s]);
    add(geos.flowerHead, mats.flowerHead, PALETTES.flower[0], [0, 0.55, 0], [0, 0, 0], [s, s * 0.85, s]);
    add(geos.flowerStem, mats.flowerStem, PALETTES.flowerStem, [0.35, 0, 0.15], [0, 0, 0.1], [0.9, 0.9, 0.9]);
    add(geos.flowerHead, mats.flowerHead, PALETTES.flower[2], [0.35, 0.5, 0.15], [0, 0, 0], [0.9, 0.8, 0.9]);
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
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 0.8, 0], [0, 0, 0], [s, s, s]);
    add(geos.blob, mats.blob, PALETTES.canopyDeep, [0, 2.15, 0], [0, 0, 0], [1.25, 0.95, 1.25]);
    add(geos.blob, mats.blob, PALETTES.canopyMid, [0.45, 2.85, 0.3], [0, 1, 0], [1.0, 0.9, 1.0]);
    add(geos.blob, mats.blob, PALETTES.canopyLight, [-0.2, 3.45, -0.25], [1, 1, 0], [0.72, 0.7, 0.72]);
  }
  g.userData.presetId = preset.id;
  return g;
}
