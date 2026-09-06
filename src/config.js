// Central tuning constants for the jungle world.
// Edit values here instead of hunting through world / player code.

export const RIVER_HALF = 3.1;

export const BRIDGES = [-10, 12];

export const SPAWN = { x: 10.5, z: 2 };

export const SPEED = 6;

export const DEFAULT_SEED = 'FOREST_123';

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
  // NOTE: Ortho camera đứng cách target ~60 units (CAMERA.distance),
  // nên fog near/far phải lớn hơn 60 nếu không cả màn hình sẽ chìm trong sương.
  // Clear: gần như không sương ở trung tâm, chỉ fade ở rìa xa.
  fogNear: 80,
  fogFar: 160,
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
