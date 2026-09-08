// Procedural world core: seeded noise -> stepped terrain + winding river + biomes.
// Implements docs/generate_random_words.md sections 1, 2, 4:
//   1. Perlin/Simplex noise -> y = floor(noise * maxHeight) stepped terrain
//      + second noise |noise2| carves a winding river channel.
//   2. Biome by height + moisture/temperature + regional noise; asset choice per biome.
//   4. Seed -> grid -> height & biome -> instancing; spawn at (0, ymax, 0).
//
// Updated: river is now fully random per seed (not fixed), and biomes expanded
// to cover rừng rậm / thảo nguyên / đồi núi / chân núi / cao nguyên / cax tơ (desert cactus) / núi lửa / tuyết
// Each region has different vegetation density (handled in chunks.js).

import * as THREE from 'three';
import { fbmFactory, makeNoise2D } from './noise.js';

export const BIOMES = {
  RIVER: 'river',
  BEACH: 'beach',
  JUNGLE: 'jungle',       // rừng rậm - dense jungle, highest tree density
  SAVANNA: 'savanna',     // thảo nguyên - open grassland, few trees, many flowers/grass
  HILLS: 'hills',         // đồi núi - rolling hills
  FOOTHILLS: 'foothills', // chân núi - rocky foothills / transition
  PLATEAU: 'plateau',     // cao nguyên - flat high plain
  DESERT: 'desert',       // cax tơ / desert with cactus
  VOLCANO: 'volcano',     // núi lửa - volcanic ash & basalt, sparse
  MOUNTAIN: 'mountain',   // generic high rocky mountain
  SNOW: 'snow',           // tuyết
};

// Placement-facing surface classes. A biome describes the visual/ecological
// look; this smaller vocabulary describes what can safely receive gameplay
// props. In particular, mountain terrain is intentionally not buildable soil.
export const SURFACES = {
  WATER: 'water',
  BEACH: 'beach',
  SOIL: 'soil',
  ROCK: 'rock',
  SNOW: 'snow',
  VOLCANIC: 'rock', // volcano uses rock surface but with ash tint
};

// Tunables for the generator.
// Jungle-first: most of the map should be lush lowland (green) with rare
// rocky peaks. Previous defaults (maxHeight 5, rock 1.4, snow 2.0) made ~55%
// of non-river terrain read as gray mountain, which is what the screenshot shows.
export const GEN_DEFAULTS = {
  maxHeight: 4.8,
  levels: 6,
  stepSize: 0.52,
  heightFreq: 0.028,
  moistureFreq: 0.032,
  tempFreq: 0.024,
  riverFreq: 0.036,
  riverAmp: 13,
  riverHalf: 3.1,
  bankOuter: 6.2,
  snowLine: 2.15,
  rockLine: 1.35,
  desertTemp: 0.54, // easier desert
  desertMoist: 0.46,
  savannaMoist: 0.50,
  savannaTemp: 0.46,
  volcanoThresh: 0.58,
  plateauThresh: 0.52,
};

export const GEN = { ...GEN_DEFAULTS };

export function resetProceduralGen() {
  Object.assign(GEN, GEN_DEFAULTS);
}

export function updateProceduralGen(config) {
  Object.assign(GEN, config);
}

let seed = 'FOREST_123';
let heightFbm = null;
let moistureFbm = null;
let tempNoise = null;
let riverNoise = null;
let biomeNoise = null;
let volcanoFbm = null;
let plateauFbm = null;
let riverHalfNoise = null;

export function getSeed() {
  return seed;
}

export function initProcedural(seedStr) {
  // Always start from clean defaults so jitter does not accumulate across regenerations
  resetProceduralGen();
  seed = String(seedStr || 'FOREST_123');
  const h = makeNoise2D(`h:${seed}`);
  const m = makeNoise2D(`m:${seed}`);
  const t = makeNoise2D(`t:${seed}`);
  const r = makeNoise2D(`r:${seed}`);
  const b = makeNoise2D(`b:${seed}`);
  const v = makeNoise2D(`v:${seed}`);
  const p = makeNoise2D(`p:${seed}`);
  const rh = makeNoise2D(`rh:${seed}`);
  heightFbm = fbmFactory(h, 4);
  moistureFbm = fbmFactory(m, 3);
  tempNoise = fbmFactory(t, 2);
  riverNoise = fbmFactory(r, 3);
  biomeNoise = fbmFactory(b, 3);
  volcanoFbm = fbmFactory(v, 3);
  plateauFbm = fbmFactory(p, 2);
  riverHalfNoise = fbmFactory(rh, 2);

  // ---- Random river per seed (not fixed) ----
  // Each seed gets its own river shape: amplitude, frequency, width vary
  // but stay in plausible bounds. Uses a seed-derived RNG so same seed => same river.
  try {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (Math.imul(hash ^ seed.charCodeAt(i), 16777619) >>> 0);
    const rng = () => {
      hash = Math.imul(hash ^ (hash >>> 15), 2246822519) >>> 0;
      hash = Math.imul(hash ^ (hash >>> 13), 3266489917) >>> 0;
      return (hash >>> 0) / 4294967296;
    };
    // Only randomize if not overridden by a world preset (which calls updateProceduralGen after init)
    // We store the original defaults to detect override, but just randomize gently here:
    // 30% of worlds get no river (arid plateau/volcano/desert worlds) — makes river truly random.
    const riverChance = rng();
    if (riverChance < 0.12) {
      // Arid world: no permanent river, dry riverbed only
      GEN.riverHalf = 0.6 + rng() * 0.6; // tiny dry wash
      GEN.riverAmp = 6 + rng() * 6;
      GEN.riverFreq = 0.025 + rng() * 0.02;
      GEN.bankOuter = GEN.riverHalf + 1.5 + rng() * 1.0;
    } else {
      GEN.riverAmp = 7 + rng() * 14; // 7-21
      GEN.riverFreq = 0.018 + rng() * 0.045; // 0.018-0.063 (gentle to very winding)
      GEN.riverHalf = 1.8 + rng() * 2.8; // 1.8-4.6
      GEN.bankOuter = GEN.riverHalf + 1.8 + rng() * 2.8; // 3.6-9.2
    }
    // Slight terrain variation per seed too (keeps worlds from feeling same)
    // Always apply per-seed jitter — presets will override after init anyway
    {
      GEN.maxHeight = 3.8 + rng() * 2.8; // 3.8-6.6
      GEN.levels = 4 + (rng() * 3 | 0); // 4-6
      GEN.snowLine = 1.9 + rng() * 0.85; // 1.9-2.75
      GEN.rockLine = 1.15 + rng() * 0.55; // 1.15-1.7
      GEN.savannaMoist = 0.42 + rng() * 0.08;
      GEN.volcanoThresh = 0.58 + rng() * 0.12; // some worlds volcano-rich, some rare
      GEN.plateauThresh = 0.52 + rng() * 0.12;
    }
  } catch {}
}

// Winding river centre on x for a given z (second noise field + harmonic).
export function riverXAt(z) {
  if (!riverNoise) initProcedural(seed);
  // Add seed-random extra meander: second harmonic with different scale
  return riverNoise(0.5, z * GEN.riverFreq) * GEN.riverAmp + riverNoise(z * 0.02, 3.7) * 8 + riverNoise(z * 0.008, z * 0.003) * 3;
}

export function riverDist(x, z) {
  return Math.abs(x - riverXAt(z));
}

// Dynamic river half-width that wiggles along the river (natural widening/narrowing)
export function riverHalfAt(z) {
  if (!riverHalfNoise) return GEN.riverHalf;
  const wobble = riverHalfNoise(z * 0.04, 0.5) * 0.55; // -0.55..0.55
  return Math.max(0.8, GEN.riverHalf * (0.78 + wobble * 0.42));
}

export function riverBankOuterAt(z) {
  return riverHalfAt(z) + (GEN.bankOuter - GEN.riverHalf);
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

export function volcanoAt(x, z) {
  if (!volcanoFbm) initProcedural(seed);
  return volcanoFbm(x * 0.012, z * 0.012) * 0.5 + 0.5;
}

export function plateauAt(x, z) {
  if (!plateauFbm) initProcedural(seed);
  return plateauFbm(x * 0.008, z * 0.008) * 0.5 + 0.5;
}

export function biomeNoiseAt(x, z) {
  if (!biomeNoise) initProcedural(seed);
  return biomeNoise(x * 0.014, z * 0.014) * 0.5 + 0.5;
}

// Full ground height: stepped terrain carved by the river channel + bank tiers.
// Now uses dynamic width per z for natural variation.
export function proceduralGroundHeight(x, z) {
  const d = riverDist(x, z);
  const rh = riverHalfAt(z);
  const bo = riverBankOuterAt(z);
  if (d < rh) return -0.55; // riverbed
  if (d < rh + 1.5) return -0.25; // wet bank tier
  if (d < bo) return 0.05; // sandy shelf
  return steppedHeight(x, z);
}

export function getBiome(x, z) {
  const d = riverDist(x, z);
  const rh = riverHalfAt(z);
  const bo = riverBankOuterAt(z);
  if (d < rh + 0.4) return BIOMES.RIVER;
  if (d < bo) return BIOMES.BEACH;
  const h = steppedHeight(x, z);
  const moist = moistureAt(x, z);
  const temp = temperatureAt(x, z);
  const volt = volcanoAt(x, z);
  const plat = plateauAt(x, z);
  const bNoise = biomeNoiseAt(x, z);

  // Regional overrides — ensure every seed contains patches of each major biome
  if (volt > GEN.volcanoThresh && temp > 0.42) {
    if (h >= GEN.rockLine - 0.35 || volt > GEN.volcanoThresh + 0.06) return BIOMES.VOLCANO;
  }
  if (bNoise > 0.58 && temp > 0.52 && moist < 0.55) return BIOMES.DESERT;
  if (plat > GEN.plateauThresh && h >= 0.65 && h < GEN.snowLine + 0.45) return BIOMES.PLATEAU;
  if (bNoise < 0.38 && h < 1.45 && moist < 0.62) return BIOMES.SAVANNA;
  if (moist < GEN.savannaMoist && temp > GEN.savannaTemp && h < 1.45) return BIOMES.SAVANNA;
  // Extra prairie belt: broad savanna band in warm lowlands
  if (h < 0.9 && temp > 0.50 && moist < 0.52 && bNoise < 0.48) return BIOMES.SAVANNA;

  if (h >= GEN.snowLine) return BIOMES.SNOW;
  if (h >= GEN.rockLine + 0.70) return BIOMES.MOUNTAIN;
  if (h >= GEN.rockLine + 0.22) return BIOMES.HILLS;
  if (h >= GEN.rockLine - 0.20) return BIOMES.FOOTHILLS;
  if (temp > GEN.desertTemp && moist < GEN.desertMoist) return BIOMES.DESERT;
  return BIOMES.JUNGLE;
}

// ---- Hot-loop fast path (tessellation rebuilds) ----
// buildGroundChunk + collectChunk used to call proceduralGroundHeight() AND
// getBiome() back-to-back for the same (x,z) — each one re-runs riverDist
// (2× fbm-3 river noise) + steppedHeight (fbm-4 height noise), i.e. ~2x the
// noise evals. sampleGround() evaluates each noise field once and returns
// height + biome + river distance together.
export function sampleGround(x, z) {
  const d = riverDist(x, z);
  const rh = riverHalfAt(z);
  const bo = riverBankOuterAt(z);
  let y;
  if (d < rh) y = -0.55;
  else if (d < rh + 1.5) y = -0.25;
  else if (d < bo) y = 0.05;
  else {
    const s = smoothHeight(x, z);
    const lvl = Math.min(GEN.levels, Math.floor((s / GEN.maxHeight) * GEN.levels));
    y = lvl * GEN.stepSize;
  }
  let biome;
  if (d < rh + 0.4) biome = BIOMES.RIVER;
  else if (d < bo) biome = BIOMES.BEACH;
  else {
    const h = y;
    const moist = moistureAt(x, z);
    const temp = temperatureAt(x, z);
    const volt = volcanoAt(x, z);
    const plat = plateauAt(x, z);
    const bNoise = biomeNoiseAt(x, z);
    if (volt > GEN.volcanoThresh && temp > 0.42 && (h >= GEN.rockLine - 0.35 || volt > GEN.volcanoThresh + 0.06)) biome = BIOMES.VOLCANO;
    else if (bNoise > 0.58 && temp > 0.52 && moist < 0.55) biome = BIOMES.DESERT;
    else if (plat > GEN.plateauThresh && h >= 0.65 && h < GEN.snowLine + 0.45) biome = BIOMES.PLATEAU;
    else if (bNoise < 0.38 && h < 1.45 && moist < 0.62) biome = BIOMES.SAVANNA;
    else if (moist < GEN.savannaMoist && temp > GEN.savannaTemp && h < 1.45) biome = BIOMES.SAVANNA;
    else if (h < 0.9 && temp > 0.50 && moist < 0.52 && bNoise < 0.48) biome = BIOMES.SAVANNA;
    else if (h >= GEN.snowLine) biome = BIOMES.SNOW;
    else if (h >= GEN.rockLine + 0.70) biome = BIOMES.MOUNTAIN;
    else if (h >= GEN.rockLine + 0.22) biome = BIOMES.HILLS;
    else if (h >= GEN.rockLine - 0.20) biome = BIOMES.FOOTHILLS;
    else if (temp > GEN.desertTemp && moist < GEN.desertMoist) biome = BIOMES.DESERT;
    else biome = BIOMES.JUNGLE;
  }
  return { y, biome, d };
}

export function surfaceForBiome(biome) {
  if (biome === BIOMES.RIVER) return SURFACES.WATER;
  if (biome === BIOMES.BEACH) return SURFACES.BEACH;
  if (biome === BIOMES.MOUNTAIN || biome === BIOMES.HILLS || biome === BIOMES.FOOTHILLS) return SURFACES.ROCK;
  if (biome === BIOMES.VOLCANO) return SURFACES.ROCK;
  if (biome === BIOMES.PLATEAU) return SURFACES.ROCK;
  if (biome === BIOMES.SNOW) return SURFACES.SNOW;
  if (biome === BIOMES.DESERT) return SURFACES.SOIL; // desert soil (cactus can build)
  if (biome === BIOMES.SAVANNA) return SURFACES.SOIL;
  return SURFACES.SOIL;
}

// Sample the centre, corners and edge midpoints of a rectangular footprint.
// Placement is generated only at rebuild time, so this deliberately favors a
// conservative result over a noisy single-point decision at biome boundaries.
export function sampleFootprint(x, z, halfX, halfZ = halfX) {
  const points = [
    [0, 0],
    [-halfX, -halfZ], [0, -halfZ], [halfX, -halfZ],
    [-halfX, 0],                     [halfX, 0],
    [-halfX, halfZ],  [0, halfZ],    [halfX, halfZ],
  ];
  let minY = Infinity;
  let maxY = -Infinity;
  const surfaces = new Set();
  const biomes = new Set();
  for (const [ox, oz] of points) {
    const sample = sampleGround(x + ox, z + oz);
    minY = Math.min(minY, sample.y);
    maxY = Math.max(maxY, sample.y);
    surfaces.add(surfaceForBiome(sample.biome));
    biomes.add(sample.biome);
  }
  return { minY, maxY, deltaY: maxY - minY, surfaces, biomes };
}

export function isBuildableSurface(surface) {
  return surface === SURFACES.SOIL || surface === SURFACES.BEACH;
}

// Vegetation density multiplier per biome (trees/cacti/grass vary by region)
// Used by chunks.js to scale scatter.
export const BIOME_DENSITY = {
  [BIOMES.JUNGLE]:   { trees: 1.0,  grass: 1.0, flowers: 1.0, bamboo: 1.0, cactus: 0,   rocks: 0.7 },
  [BIOMES.SAVANNA]:  { trees: 0.28, grass: 1.45, flowers: 1.25, bamboo: 0.1, cactus: 0,   rocks: 0.6 },
  [BIOMES.HILLS]:    { trees: 0.52, grass: 0.95, flowers: 0.7, bamboo: 0.35, cactus: 0,   rocks: 1.1 },
  [BIOMES.FOOTHILLS]:{ trees: 0.38, grass: 0.8,  flowers: 0.5, bamboo: 0.2, cactus: 0,   rocks: 1.25 },
  [BIOMES.PLATEAU]:  { trees: 0.32, grass: 1.2,  flowers: 0.6, bamboo: 0.15, cactus: 0,   rocks: 0.9 },
  [BIOMES.DESERT]:   { trees: 0.08, grass: 0.25, flowers: 0.15, bamboo: 0,   cactus: 1.0, rocks: 1.0 },
  [BIOMES.VOLCANO]:  { trees: 0.12, grass: 0.2,  flowers: 0.1, bamboo: 0,   cactus: 0,   rocks: 1.4 },
  [BIOMES.MOUNTAIN]: { trees: 0.45, grass: 0.5,  flowers: 0.3, bamboo: 0.3, cactus: 0,   rocks: 1.3 },
  [BIOMES.SNOW]:     { trees: 0.22, grass: 0.15, flowers: 0.05, bamboo: 0,  cactus: 0,   rocks: 1.1 },
  [BIOMES.BEACH]:    { trees: 0.3,  grass: 0.7,  flowers: 0.5, bamboo: 0.15, cactus: 0,   rocks: 0.8 },
  [BIOMES.RIVER]:    { trees: 0,    grass: 0,    flowers: 0,   bamboo: 0,   cactus: 0,   rocks: 0 },
};

export function densityForBiome(biome) {
  return BIOME_DENSITY[biome] || BIOME_DENSITY[BIOMES.JUNGLE];
}

// Vertex / ground colors per biome (vivid cartoon look).
// Jungle greens pushed slightly more saturated/warm so the world reads lush
// even in shadow; mountain gray warmed toward stone brown to avoid cold wash.
const biomeColors = {
  [BIOMES.RIVER]: [0xe8cf7e, 0xd4b45e],
  [BIOMES.BEACH]: [0xf2d789, 0xe9c86e],
  [BIOMES.JUNGLE]: [0x6be05a, 0x2e9d3a],
  [BIOMES.SAVANNA]: [0xc8e06a, 0x9ab84a], // thảo nguyên - dry yellow-green prairie
  [BIOMES.HILLS]: [0x7fbf6a, 0x5a9a45],   // đồi núi - rolling green hill
  [BIOMES.FOOTHILLS]: [0xa8a99a, 0x8a9a85], // chân núi - rocky-green transition
  [BIOMES.PLATEAU]: [0xd4c49a, 0xb8a87a], // cao nguyên - tan high plain
  [BIOMES.DESERT]: [0xf2cf6e, 0xdd9f3f],
  [BIOMES.VOLCANO]: [0x5a4a45, 0x3d2f2b], // núi lửa - dark ash / basalt
  [BIOMES.MOUNTAIN]: [0xa8a99a, 0x7e8378],
  [BIOMES.SNOW]: [0xffffff, 0xd8ecf7],
};

// Flower-meadow speckle tints dotted over the jungle floor (hash-driven,
// no extra noise — a few % of vertices blush pink/gold/white like petals).
const MEADOW_DOTS = [0xff8fb5, 0xffd93b, 0xffffff, 0xc99aff, 0xff7e4f];

const _bcB = new THREE.Color();
const _bcScratch = new THREE.Color();
// Fast deterministic 0..1 hash from world coords — integer imul chain, no
// Math.sin (sin stalls the FPU pipeline and was called ~15k×/rebuild).
// Quantize to decimeters so adjacent verts in a flat tread hash consistently.
export function hashXZ(x, z) {
  let h = Math.imul(Math.floor(x * 10) | 0, 374761393) + Math.imul(Math.floor(z * 10) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function biomeGroundColor(biome, random, target = _bcScratch, x = 0, z = 0, y = 0) {
  const [a, b] = biomeColors[biome] || biomeColors[BIOMES.JUNGLE];
  // Perf: called per ground vertex (~15k times per full rebuild on SEG 24).
  // Writes into a shared scratch color (no allocs). The two lightness tweaks
  // (random grain ±0.02 + terrace stripe ±0.012) are fused into ONE offsetHSL:
  // each offsetHSL does an RGB->HSL->RGB round trip, so two calls = 2x cost.
  // Read r/g/b synchronously — do not hold the reference.
  //
  // NOTE: y here is already the stepped height, so lvl = y / stepSize needs
  // no extra noise (Math.round matches the old behavior).
  target.setHex(a).lerp(_bcB.setHex(b), random());
  const lvl = Math.round(y / GEN.stepSize);
  // Softer terrace banding: was ±0.012 which carved harsh grid on gray peaks
  const dl = (random() - 0.5) * 0.036 + (lvl % 2 === 0 ? 0.008 : -0.008);
  target.offsetHSL(0, 0, dl);
  if (biome === BIOMES.JUNGLE) {
    // Lime/teal patches + tiny petal dots: the floor blooms with color.
    const h = hashXZ(x, z);
    if (h > 0.84) {
      target.lerp(_bcB.setHex(h > 0.92 ? 0x2fd6a0 : 0xb8e63a), 0.45);
    } else if (h < 0.055) {
      target.lerp(_bcB.setHex(MEADOW_DOTS[(h * 9973 | 0) % MEADOW_DOTS.length]), 0.6);
    }
    target.offsetHSL(0, 0.045, 0); // stronger saturation lift for the jungle
  } else if (biome === BIOMES.SAVANNA) {
    // Thảo nguyên - golden dry grass flecks
    const h = hashXZ(x, z);
    if (h > 0.88) target.lerp(_bcB.setHex(0xe8d44f), 0.35);
    else if (h < 0.06) target.lerp(_bcB.setHex(0xfff0b0), 0.35);
    target.offsetHSL(0, 0.03, 0);
  } else if (biome === BIOMES.SNOW) {
    if (hashXZ(x, z) < 0.18) target.lerp(_bcB.setHex(0x8d9299), 0.45);
  } else if (biome === BIOMES.MOUNTAIN || biome === BIOMES.HILLS) {
    if (y >= GEN.snowLine - GEN.stepSize && hashXZ(x, z) > 0.72) {
      target.lerp(_bcB.setHex(0xdde7ee), 0.5);
    }
  } else if (biome === BIOMES.PLATEAU) {
    if (hashXZ(x, z) > 0.78) target.lerp(_bcB.setHex(0xc2b08a), 0.35);
    target.offsetHSL(0, -0.02, 0.02);
  } else if (biome === BIOMES.VOLCANO) {
    // Ash flecks + cooling lava glow spots
    const h = hashXZ(x, z);
    if (h > 0.92) target.lerp(_bcB.setHex(0x8a3a2a), 0.45); // ember
    else if (h > 0.82) target.lerp(_bcB.setHex(0x6b5a54), 0.3);
    else if (h < 0.08) target.lerp(_bcB.setHex(0x2a1f1d), 0.4);
  } else if (biome === BIOMES.DESERT) {
    if (hashXZ(x, z) > 0.82) target.lerp(_bcB.setHex(0xc9a86a), 0.3);
  } else if (biome === BIOMES.FOOTHILLS) {
    if (hashXZ(x, z) > 0.75) target.lerp(_bcB.setHex(0x9aa08a), 0.35);
  }
  return target;
}

// Spawn: centre (0, ymax, 0) per doc — highest stepped point near origin, off-river.
// Now avoids volcano & river, prefers jungle/savanna/hills.
export function findSpawn() {
  let best = { x: 4.5, z: 2 };
  let bestY = -Infinity;
  let bestScore = -Infinity;
  for (let x = -10; x <= 10; x += 1) {
    for (let z = -10; z <= 10; z += 1) {
      const s = sampleGround(x, z);
      if (s.biome === BIOMES.RIVER || s.biome === BIOMES.VOLCANO) continue;
      if (riverDist(x, z) < riverHalfAt(z) + 1.2) continue;
      const y = s.y;
      // Prefer hospitable biomes
      let biomeBonus = 0;
      if (s.biome === BIOMES.JUNGLE) biomeBonus = 1.2;
      else if (s.biome === BIOMES.SAVANNA) biomeBonus = 0.9;
      else if (s.biome === BIOMES.HILLS) biomeBonus = 0.6;
      else if (s.biome === BIOMES.PLATEAU) biomeBonus = 0.4;
      else if (s.biome === BIOMES.FOOTHILLS) biomeBonus = 0.2;
      const score = y + biomeBonus;
      if (score > bestScore) {
        bestScore = score;
        bestY = y;
        best = { x, z };
      }
    }
  }
  // Fallback if no good spot
  if (bestScore === -Infinity) return { x: best.x, z: best.z, y: bestY };
  return { x: best.x, z: best.z, y: bestY };
}
