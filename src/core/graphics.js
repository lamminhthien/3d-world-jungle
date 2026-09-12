// Central graphics settings — one place for quality presets + persistence.
// Targets: low/mid Android, iPhone (A13+ tile GPUs), iPad, Apple Silicon MacBooks.
//
// Presets scale: resolution (DPR multiplier), shadows, view distance (chunk
// radius), vegetation/animal/particle density, post FX, wind sway, FPS cap.
// "auto" resolves to low/medium/high from device tier, then adaptive quality
// can step resolution up/down at runtime without touching the stored preset.

const STORAGE_KEY = 'jungle_graphics_v1';

export const GRAPHICS_PRESETS = {
  // Heavy graphics stripped: no post FX (rays/flare/gi), no HQ water, no
  // wind sway particles, no clouds/rain/fireflies extras. Presets now only
  // scale resolution, view distance, vegetation/animals, shadows, fps.
  low: {
    label: 'Low · Battery saver',
    resolution: 0.7, shadows: 'off', viewDistance: 1,
    vegetation: 0.5, animals: 0.35, particles: 0.4,
    clouds: false, cloudCount: 0, rain: false, fireflies: false,
    rays: false, flare: false, gi: false,
    windSway: false, waterHigh: false, fpsCap: 30,
  },
  medium: {
    label: 'Medium · Balanced',
    resolution: 0.8, shadows: 'low', viewDistance: 2,
    vegetation: 0.75, animals: 0.65, particles: 0.7,
    clouds: false, cloudCount: 0, rain: false, fireflies: false,
    rays: false, flare: false, gi: false,
    windSway: false, waterHigh: false, fpsCap: 45,
  },
  high: {
    label: 'High · Detailed',
    resolution: 1.0, shadows: 'high', viewDistance: 2,
    vegetation: 1.0, animals: 1.0, particles: 1.0,
    clouds: false, cloudCount: 0, rain: false, fireflies: false,
    rays: false, flare: false, gi: false,
    windSway: false, waterHigh: false, fpsCap: 60,
  },
  ultra: {
    label: 'Ultra · Apple Silicon / Desktop',
    resolution: 1.0, shadows: 'high', viewDistance: 2,
    vegetation: 1.0, animals: 1.0, particles: 1.0,
    clouds: false, cloudCount: 0, rain: false, fireflies: false,
    rays: false, flare: false, gi: false,
    windSway: false, waterHigh: false, fpsCap: 60,
  },
};

const DEFAULTS = {
  preset: 'auto', // auto | low | medium | high | ultra
  // Per-setting overrides. `null` = follow preset. Set once user touches an
  // advanced control so preset switching still works for untouched keys.
  overrides: {},
};

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function cloneDefaults() {
  try { return structuredClone(DEFAULTS); } catch { return JSON.parse(JSON.stringify(DEFAULTS)); }
}
export function loadGraphicsStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = safeParse(raw) || {};
    return {
      preset: typeof parsed.preset === 'string' ? parsed.preset : 'auto',
      overrides: parsed.overrides && typeof parsed.overrides === 'object' ? parsed.overrides : {},
    };
  } catch { return cloneDefaults(); }
}

function persist(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

// ---------- Device detection (no WebGL context needed) ----------
function nav() { return typeof navigator !== 'undefined' ? navigator : {}; }
function ua() { return nav().userAgent || ''; }

export function isAndroidDevice() { return /Android/i.test(ua()); }
export function isIPhoneDevice() { return /iPhone|iPod/i.test(ua()); }
export function isIPadDevice() {
  if (/iPad/i.test(ua())) return true;
  // iPadOS 13+ reports as Macintosh — detect via touch points.
  try {
    return /Mac/i.test(ua()) && nav().maxTouchPoints > 1;
  } catch { return false; }
}
export function isIOSDevice() { return isIPhoneDevice() || isIPadDevice(); }
export function isMacDevice() { return /Mac/i.test(ua()); }

export function isAppleSiliconMac() {
  // Heuristic: Mac + high core count + no Intel identifier. Safari on Apple
  // Silicon reports "Macintosh" with arm-looking concurrency; Rosetta/Intel
  // Macs typically have different core/memory combos. Best-effort only —
  // used just to pick a sensible default preset, never to gate features.
  if (!isMacDevice() || isIPadDevice()) return false;
  const cores = nav().hardwareConcurrency || 0;
  const mem = nav().deviceMemory || 0; // often undefined on Safari
  // Apple Silicon Macs: 8+ cores common; Intel MacBooks often 4-8 too, so
  // only treat 8+ core Macs as Apple Silicon class (plenty fast either way).
  return cores >= 8 || mem >= 8;
}

export function getGpuHint() {
  // Best-effort WebGL renderer string (e.g. "Apple GPU", "Adreno", "Mali").
  // Cached — creating a context once at boot is cheap.
  if (typeof document === 'undefined') return '';
  try {
    if (getGpuHint._cached !== undefined) return getGpuHint._cached;
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) { getGpuHint._cached = ''; return ''; }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    getGpuHint._cached = name;
    // Lose the context immediately.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch { return ''; }
}

/** 'low' | 'medium' | 'high' | 'ultra' — used when preset is 'auto'. */
export function detectDeviceTier() {
  const n = nav();
  const cores = n.hardwareConcurrency || 0;
  const mem = n.deviceMemory || 0; // GB, Chrome-Android only; undefined on Safari
  const smallScreen = typeof screen !== 'undefined'
    ? Math.min(screen.width, screen.height) < 420
    : false;
  const gpu = getGpuHint().toLowerCase();

  // Explicit low-end signals.
  const oldAdreno = /adreno.*[123]\d\d|mali.*t\d|mali-g3|mali-g5/.test(gpu);
  if (isIPhoneDevice()) {
    // Modern iPhones (A15+) handle medium; older / small-screen stay low.
    // We can't read the chip, so use cores + screen as proxy.
    if (smallScreen && cores <= 4) return 'low';
    return 'medium';
  }
  if (isIPadDevice()) return 'medium';
  if (isAndroidDevice()) {
    if (mem && mem <= 3) return 'low';
    if ((cores && cores <= 4) || oldAdreno || smallScreen) return 'low';
    if ((mem && mem <= 6) || cores <= 6) return 'medium';
    return 'high';
  }
  if (isAppleSiliconMac()) return 'high';
  if (isMacDevice()) return 'high';
  // Desktop default: high (ultra is opt-in — DPR 2 + radius 3 is heavy even
  // on discrete GPUs with bloom on).
  if (cores >= 8) return 'high';
  return 'medium';
}

/** Resolve 'auto' -> concrete tier preset. */
export function resolvePresetName(state) {
  if (state.preset && state.preset !== 'auto') return state.preset;
  const tier = detectDeviceTier();
  if (tier === 'low') return 'low';
  if (tier === 'medium') return 'medium';
  if (tier === 'ultra') return 'ultra';
  return 'high';
}

/** Effective settings = preset values + user overrides. */
export function getEffectiveGraphics(state) {
  const name = resolvePresetName(state);
  const base = GRAPHICS_PRESETS[name] || GRAPHICS_PRESETS.medium;
  return { presetName: name, ...base, ...(state.overrides || {}) };
}

// ---------- Live store ----------
let _state = loadGraphicsStored();
const _listeners = new Set();
// Perf: getGraphics() is called per-frame from ~10 systems (fireflies,
// river, wind, clouds, env rain...). Each call previously spread a new
// object. Cache the effective object and only rebuild on state change.
let _effCache = null;
function _computeEff() {
  _effCache = getEffectiveGraphics(_state);
  return _effCache;
}

export function getGraphicsState() { return _state; }
export function getGraphics() { return _effCache || _computeEff(); }

export function setPreset(preset) {
  _state = { preset, overrides: {} };
  persist(_state);
  emit();
}

export function setOverride(key, value) {
  const overrides = { ...(_state.overrides || {}) };
  if (value === null || value === undefined) delete overrides[key];
  else overrides[key] = value;
  _state = { ..._state, overrides };
  persist(_state);
  emit();
}

export function resetGraphics() {
  _state = cloneDefaults();
  persist(_state);
  emit();
}

export function onGraphicsChange(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

function emit() {
  _computeEff();
  for (const fn of _listeners) {
    try { fn(_effCache, _state); } catch { /* non-fatal */ }
  }
}

// FPS-cap helper shared with the main loop (30/45/60/90/120 list + presets).
export function defaultFpsCap() {
  return getGraphics().fpsCap || 60;
}

// Prime the cache at module load so first-frame callers get a stable ref.
_computeEff();
