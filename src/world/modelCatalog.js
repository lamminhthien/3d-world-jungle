// CC0 model catalog — Full library replacement for presets.js
// -------------------------------------------------------
// Maps each vegetation preset kind to one or more CC0 GLB URLs.
// Files live in public/generated/models/kenney/ (see scripts/fetch-nature-models.mjs)
// At runtime, modelCatalog.load() fetches manifest + picks a variant per instance.
//
// Usage:
//   import { MODEL_CATALOG, loadModelCatalog, pickModelForPreset } from './modelCatalog.js';
//   await loadModelCatalog(); // fetch manifest.json (cached)
//   const url = pickModelForPreset('broadleaf', rng); // -> "/generated/models/kenney/tree_oak.glb"
//
import { rngFromString } from './noise.js';

export const BASE_MODELS = '/generated/models';

export const MODEL_CATALOG = {
  // pine: tall conifer hero (closest to tessellated pine in presets.js)
  pine: [
    { file: 'kenney/tree_pineTallA.glb', scale: 1.0, variants: 3 },
    { file: 'kenney/tree_pineTallA_detailed.glb', scale: 1.0 },
    { file: 'kenney/tree_pineRoundA.glb', scale: 1.0 },
    { file: 'kenney/tree_cone.glb', scale: 1.0 },
  ],
  // broadleaf: oak/detailed/default trio — maps to canopyDeep/Mid/Light palette
  broadleaf: [
    { file: 'kenney/tree_oak.glb', scale: 1.0 },
    { file: 'kenney/tree_detailed.glb', scale: 1.0 },
    { file: 'kenney/tree_default.glb', scale: 0.95 },
  ],
  // palm: tall variants (closest to placePalm / PALM_FRONDS)
  palm: [
    { file: 'kenney/tree_palmTall.glb', scale: 1.0 },
    { file: 'kenney/tree_palmDetailedTall.glb', scale: 1.05 },
    { file: 'kenney/tree_palm.glb', scale: 0.9 },
  ],
  // bush: low shrub
  bush: [
    { file: 'kenney/plant_bushLarge.glb', scale: 1.0 },
    { file: 'kenney/plant_bush.glb', scale: 0.9 },
    { file: 'kenney/plant_bushDetailed.glb', scale: 1.0 },
  ],
  // rock / stone
  rock: [
    { file: 'kenney/rock_largeA.glb', scale: 1.0 },
    { file: 'kenney/rock_smallA.glb', scale: 1.0 },
    { file: 'kenney/stone_largeA.glb', scale: 1.0 },
    { file: 'kenney/rock_tallA.glb', scale: 1.0 },
    { file: 'kenney/stone_smallA.glb', scale: 0.85 },
  ],
  cactus: [
    { file: 'kenney/cactus_tall.glb', scale: 1.0 },
    { file: 'kenney/cactus_short.glb', scale: 0.9 },
  ],
  flower: [
    { file: 'kenney/flower_redA.glb', scale: 1.0 },
    { file: 'kenney/flower_yellowA.glb', scale: 1.0 },
  ],
  grass: [
    { file: 'kenney/grass.glb', scale: 1.0 },
    { file: 'kenney/grass_large.glb', scale: 1.15 },
  ],
};

let manifestCache = null;
let manifestPromise = null;

export async function loadModelCatalog() {
  if (manifestCache) return manifestCache;
  if (manifestPromise) return manifestPromise;
  manifestPromise = (async () => {
    try {
      const url = `${import.meta.env.BASE_URL}generated/models/manifest.json`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      const j = await res.json();
      manifestCache = j;
      return j;
    } catch (e) {
      // Offline or manifest missing => procedural fallback
      manifestCache = { version: 0, models: {}, files: {}, verified: 0 };
      return manifestCache;
    }
  })();
  return manifestPromise;
}

export function isModelAvailable(file) {
  if (!manifestCache) return false;
  return !!manifestCache.files?.[file]?.present;
}

export function pickModelForPreset(kind, rng) {
  const list = MODEL_CATALOG[kind];
  if (!list || !list.length) return null;
  const idx = Math.floor(rng() * list.length) | 0;
  const entry = list[idx % list.length];
  const publicUrl = `${BASE_MODELS}/${entry.file}`;
  return { url: `${import.meta.env.BASE_URL}${entry.file}`, publicUrl, scale: entry.scale, file: entry.file };
}

// For instancing: group models by base geometry so we keep 1 draw call per kind.
// Returns the canonical URL for that kind (first variant) — deterministic per seed.
export function canonicalModelUrl(kind) {
  const list = MODEL_CATALOG[kind];
  if (!list?.length) return null;
  return `${import.meta.env.BASE_URL}${list[0].file}`;
}

export function resetCatalogCache() {
  manifestCache = null;
  manifestPromise = null;
}
