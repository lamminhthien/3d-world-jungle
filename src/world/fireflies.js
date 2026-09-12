// Fireflies stripped for performance (shader points + per-frame recycle noise
// removed). Stub keeps the same API so main.js / testMode keep working.
export function createFireflies() {
  return {
    points: null,
    nightFactor: () => 0,
    visible: false,
    applyGraphics() {},
    update() {},
    dispose() {},
  };
}
