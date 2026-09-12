// Wind particles stripped for performance (110 points + 3 gust decals +
// per-frame groundHeight noise removed). Stub keeps the same API so callers
// don't need guards.
export function createWindParticles() {
  return { update() {}, dispose() {}, applyGraphics() {}, points: null, gusts: null };
}
