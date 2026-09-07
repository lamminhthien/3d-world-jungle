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
// Densities tuned for a lush rainforest first impression — screenshot showed sparse, barren park.
export const VEGETATION = {
  treeDensity: 0.92,   // 0.35 sparse park → 1.2 Sumeru rainforest (was 0.65 too sparse)
  treeScale: 1.02,     // 0.65 bonsai → 1.25 Natlan giants (slightly bigger for presence)
  grassDensity: 1.45,  // 0.5 barren → 1.8 Fontaine meadow (was 1.0 left gray floor exposed)
  flowerDensity: 1.25, // 0.5 few blooms → 1.5 Inazuma flower fields (more color pops)
  bambooDensity: 0.75, // 0 full jungle → 1.0 bamboo forest (Liyue/Sumeru)
  willowDensity: 0.65, // riverbank willows (Fontaine) — more river life
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
  dragonflyCount: 10, // river jewel — day only, clear sky
  batCount: 9,        // nocturnal — dusk to dawn
};

export const LIFECYCLE = {
  // Vibrant time windows where each beauty peaks (hours)
  dawn: [4.8, 7.2],       // mist, dew, dawn chorus, first light
  morning: [7.0, 11.0],   // rainbow after rain, dragonflies
  midday: [11.0, 14.5],   // heat haze, pollen, brightest butterflies
  goldenHour: [15.5, 18.6], // amber sun, long shadows, pollen motes
  dusk: [18.6, 20.2],     // bats emerge, crickets start, fireflies ignite
  night: [20.2, 4.8],     // aurora 22-03, shooting stars, owl hoots
};

export const WEATHER_CONFIG = {
  weathers: ['clear', 'partlyCloudy', 'overcast', 'mist', 'drizzle', 'rain', 'storm'],
  intervalSec: 75,
  // Vibrant-only: fog removed, ugly grey whiteout gone
  weights: { clear: 0.30, partlyCloudy: 0.16, overcast: 0.14, mist: 0.11, drizzle: 0.11, rain: 0.10, storm: 0.08 },
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
  fogColor: 0xaee3f5,
  // Tighter fog gives depth without washing to gray at distance (screenshot looked hazy gray)
  fogNear: 45,
  fogFar: 110,
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
