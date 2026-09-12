// Post FX removed for performance (god rays / lens flare / AO composer).
// This module is kept as a stub so existing imports keep working — all
// effects report as disabled and the renderer draws directly.
// Removed heavy deps: EffectComposer, RenderPass, OutputPass,
// volumetrics.js, lensFlare.js, globalIllumination.js (AO).

export function isRaysEnabled() { return false; }
export function isFlareEnabled() { return false; }
export function isGIEnabled() { return false; }
export function setRaysEnabled() {}
export function setFlareEnabled() {}
export function setGIEnabled() {}

export function createComposer() { return null; }
export function updateAdvancedEffects() {}
export function disposeComposer() {}
