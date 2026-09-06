// Central tuning constants for the jungle world.
// Edit values here instead of hunting through world / player code.

export const RIVER_HALF = 3.1;

export const BRIDGES = [-10, 12];

export const SPAWN = { x: 10.5, z: 2 };

export const SPEED = 6;

export const MAX_TREES = 220;
export const BUSH_COUNT = 120;
export const ROCK_COUNT = 150;
export const CLOUD_COUNT = 9;
export const FOAM_COUNT = 26;

export const WORLD = {
  size: 90,
  groundSegments: 64,
  playRadius: 37,
  fogColor: 0xa8dcf0,
  fogNear: 45,
  fogFar: 95,
};

export const CAMERA = {
  frustumSize: 22,
  minZoom: 12,
  maxZoom: 38,
  azimuth: Math.PI / 4,
  polarElevationDeg: 35.264,
  distance: 60,
};
