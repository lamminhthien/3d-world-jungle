// Clouds stripped for performance (9 merged meshes + per-frame drift removed).
// Stub keeps the same API. Sky stays clear; fog + sun/moon still animate.
export function createClouds() {
  return { clouds: [], cloudMat: null, update() {}, applyGraphics() {} };
}
