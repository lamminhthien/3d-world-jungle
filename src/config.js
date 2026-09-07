// Central tuning constants for the jungle world.
// Edit values here instead of hunting through world / player code.

export const RIVER_HALF = 3.1;

export const BRIDGES = [-10, 12];

export const SPAWN = { x: 10.5, z: 2 };

export const SPEED = 4.6;

export const DEFAULT_SEED = 'FOREST_123';
export const DEFAULT_MAX_FPS = 60;

export const MAX_TREES = 220;
export const BUSH_COUNT = 120;
export const ROCK_COUNT = 150;
export const CLOUD_COUNT = 9;
export const FOAM_COUNT = 26;

// Vegetation tuning. Centralized so chunk-streamed world + static previews stay in sync.
// Genshin-style: you can push tree/grass/flower density to make Mondstadt meadows or Sumeru jungles.
export const VEGETATION = {
  treeDensity: 0.65,   // 0.35 sparse park → 1.2 Sumeru rainforest
  treeScale: 0.9,      // 0.65 bonsai → 1.25 Natlan giants
  grassDensity: 1.0,   // 0.5 barren → 1.8 Fontaine meadow (multiplies POOL.grass scatter)
  flowerDensity: 1.0,  // 0.5 few blooms → 1.5 Inazuma flower fields
  bambooDensity: 0.6,  // 0 full jungle → 1.0 bamboo forest (Liyue/Sumeru)
  willowDensity: 0.5,  // riverbank willows (Fontaine)
};

// Genshin-inspired world nations — each is just GEN params + palette, still seeded.
export const NATIONS = {
  MONDSTADT: { name: 'Mondstadt · Anemo', wind: 1.6, grass: 1.6, flowers: 1.4 },
  LIYUE: { name: 'Liyue · Geo', cliffs: 1.3, pines: 1.2, rocks: 1.4 },
  INAZUMA: { name: 'Inazuma · Electro', sakura: 1.5, beach: 1.2, rain: 0.3 },
  SUMERU_JUNGLE: { name: 'Sumeru · Dendro', jungle: 1.3, kapok: 1.2 },
  SUMERU_DESERT: { name: 'Sumeru · Desert', dunes: 1.4, cactus: 1.2 },
  FONTAINE: { name: 'Fontaine · Hydro', lakes: 1.2, willows: 1.4, reeds: 1.3 },
  NATLAN: { name: 'Natlan · Pyro', volcano: 1.3, ember: 1.2 },
};

export const ANIMALS = {
  birdCount: 22,
  deerCount: 6,
  fishCount: 14,
  butterflyCount: 18, // new: Inazuma/Monstadt fields
  boarCount: 4,       // new: forest boar
  crabCount: 10,      // new: beach crabs
};

export const SCENE = {
  shrineDensity: 0.02,   // per chunk chance for Statue/Waypoint (Genshin waypoints)
  ruinDensity: 0.03,     // ancient ruins (Liyue/Inazuma)
  waypointGlow: true,
};

export const WORLD = {
  size: 90,
  groundSegments: 64,
  playRadius: 37,
  fogColor: 0xa8dcf0,
  // Genshin-like: each nation can override near/far for vibe (e.g. Inazuma foggy, Natlan clear)
  fogNear: 80,
  fogFar: 160,
  // Meadow / beach polish
  grassFieldAmp: 1.8,    // Fontaine meadow extra scatter radius
  beachPalmBoost: 1.4,   // beach.cove + Inazuma beach get 40% more palms
  duneHeight: 0.35,      // beach dune wave
};

// Day-night + weather tuning (docs/weather-day-night-cycles.md).
export const ENV = {
  dayLengthSec: 600, // 1 game day = 10 real minutes
  startTime: 10.0, // 10:00 morning
  weatherIntervalSec: 75, // re-roll weather roughly every 75s
};

export const CAMERA = {
  frustumSize: 22,
  minZoom: 12,
  maxZoom: 38,
  azimuth: Math.PI / 4,
  polarElevationDeg: 35.264,
  distance: 60,
};
