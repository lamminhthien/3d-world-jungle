// Procedural world core: seeded noise -> stepped terrain + winding river + biomes.
// Implements docs/generate_random_words.md sections 1, 2, 4:
//   1. Perlin/Simplex noise -> y = floor(noise * maxHeight) stepped terrain
//      + second noise |noise2| carves a winding river channel.
//   2. Biome by height + moisture/temperature; asset choice per biome.
//   4. Seed -> grid -> height & biome -> instancing; spawn at (0, ymax, 0).

import * as THREE from 'three';
import { fbmFactory, makeNoise2D } from './noise.js';

export const BIOMES = {
  RIVER: 'river',
  BEACH: 'beach',
  JUNGLE: 'jungle',
  DESERT: 'desert',
  MOUNTAIN: 'mountain',
  SNOW: 'snow',
};

// Tunables for the generator.
export const GEN = {
  maxHeight: 5, // top of stepped terrain
  levels: 6, // number of discrete steps
  stepSize: 0.55, // visual height of one step
  heightFreq: 0.035, // base terrain frequency
  moistureFreq: 0.03,
  tempFreq: 0.022,
  riverFreq: 0.045, // winding of the river along z
  riverAmp: 13, // how far the river meanders on x
  riverHalf: 3.1, // half-width of water channel (matches RIVER_HALF)
  bankOuter: 6.2, // outer edge of sandy/stepped banks
  snowLine: 2.0, // stepped height above which snow appears (lvl >= 4)
  rockLine: 1.4, // above this => mountain rock (lvl >= 3)
};

let seed = 'FOREST_123';
let heightFbm = null;
let moistureFbm = null;
let tempNoise = null;
let riverNoise = null;

export function getSeed() {
  return seed;
}

export function initProcedural(seedStr) {
  seed = String(seedStr || 'FOREST_123');
  const h = makeNoise2D(`h:${seed}`);
  const m = makeNoise2D(`m:${seed}`);
  const t = makeNoise2D(`t:${seed}`);
  const r = makeNoise2D(`r:${seed}`);
  heightFbm = fbmFactory(h, 4);
  moistureFbm = fbmFactory(m, 3);
  tempNoise = fbmFactory(t, 2);
  riverNoise = fbmFactory(r, 3);
}

// Winding river centre on x for a given z (second noise field + harmonic).
export function riverXAt(z) {
  if (!riverNoise) initProcedural(seed);
  return riverNoise(0.5, z * GEN.riverFreq) * GEN.riverAmp + riverNoise(z * 0.02, 3.7) * 8;
}

export function riverDist(x, z) {
  return Math.abs(x - riverXAt(z));
}

// Raw smooth height in [0, maxHeight] before stepping.
// Centred on lowland (lvl 1-2) with tails reaching mountain/snow.
export function smoothHeight(x, z) {
  const n = heightFbm(x * GEN.heightFreq, z * GEN.heightFreq); // ~[-1,1]
  return THREE.MathUtils.clamp(0.45 + n, 0, 1) * GEN.maxHeight;
}

// Stepped height: y = floor(noise * levels) * stepSize (Minecraft-like tiers).
export function steppedHeight(x, z) {
  const s = smoothHeight(x, z);
  const lvl = Math.min(GEN.levels, Math.floor((s / GEN.maxHeight) * GEN.levels));
  return lvl * GEN.stepSize;
}

export function moistureAt(x, z) {
  return moistureFbm(x * GEN.moistureFreq, z * GEN.moistureFreq) * 0.5 + 0.5;
}

export function temperatureAt(x, z) {
  // Warm in the south (+z), cold in the north (-z), plus noise.
  const lat = THREE.MathUtils.clamp(z * 0.008, -0.4, 0.4);
  return THREE.MathUtils.clamp(tempNoise(x * GEN.tempFreq, z * GEN.tempFreq) * 0.5 + 0.5 - lat, 0, 1);
}

// Full ground height: stepped terrain carved by the river channel + bank tiers.
export function proceduralGroundHeight(x, z) {
  const d = riverDist(x, z);
  if (d < GEN.riverHalf) return -0.55; // riverbed
  if (d < GEN.riverHalf + 1.5) return -0.25; // wet bank tier
  if (d < GEN.bankOuter) return 0.05; // sandy shelf
  return steppedHeight(x, z);
}

export function getBiome(x, z) {
  const d = riverDist(x, z);
  if (d < GEN.riverHalf + 0.4) return BIOMES.RIVER;
  if (d < GEN.bankOuter) return BIOMES.BEACH;
  const h = steppedHeight(x, z);
  const moist = moistureAt(x, z);
  const temp = temperatureAt(x, z);
  if (h >= GEN.snowLine) return BIOMES.SNOW;
  if (h >= GEN.rockLine) return BIOMES.MOUNTAIN;
  if (temp > 0.62 && moist < 0.42) return BIOMES.DESERT;
  return BIOMES.JUNGLE;
}

// Vertex / ground colors per biome (low-poly flat look).
const biomeColors = {
  [BIOMES.RIVER]: [0xd9c27a, 0xcbb26a],
  [BIOMES.BEACH]: [0xd9c27a, 0xe2cf8b],
  [BIOMES.JUNGLE]: [0x7ecb5f, 0x5da844],
  [BIOMES.DESERT]: [0xe3c878, 0xd4a94f],
  [BIOMES.MOUNTAIN]: [0x8d9299, 0x6f757c],
  [BIOMES.SNOW]: [0xf2f5f7, 0xdde7ee],
};

export function biomeGroundColor(biome, random) {
  const [a, b] = biomeColors[biome] || biomeColors[BIOMES.JUNGLE];
  const c = new THREE.Color(a).lerp(new THREE.Color(b), random());
  c.offsetHSL(0, 0, (random() - 0.5) * 0.04);
  return c;
}

// Spawn: centre (0, ymax, 0) per doc — highest stepped point near origin, off-river.
export function findSpawn() {
  let best = { x: 4.5, z: 2 };
  let bestY = -Infinity;
  for (let x = -10; x <= 10; x += 1) {
    for (let z = -10; z <= 10; z += 1) {
      if (riverDist(x, z) < GEN.riverHalf + 1.2) continue;
      const y = proceduralGroundHeight(x, z);
      if (y > bestY) {
        bestY = y;
        best = { x, z };
      }
    }
  }
  return { x: best.x, z: best.z, y: bestY };
}
