// Pre-game bundle/GPU cache pipeline (runs BEFORE entering the game).
// ---------------------------------------------------------------------------
// Goal: first play downloads + caches everything, later opens are near-instant,
// entering the game never janks (shaders/textures already on the GPU).
//
// 4-step pipeline (progress reported on the loading screen):
//   1. Register Service Worker -> js/css/html bundle kept in Cache Storage
//      on this device (PROD only; skipped in dev to avoid HMR friction).
//   2. Request persistent storage -> stop the browser from evicting the cache.
//   3. Warm the current bundle -> pre-fetch the js/css files this page uses
//      so HTTP cache / SW already has them.
//   4. Warm generated textures + GPU upload (renderer.initTexture) — static
//      production assets are loaded before the world is built; Canvas remains
//      an automatic fallback when an asset is unavailable.
//
// Quick answer: the bundle is built once and shared by all devices; the CACHE (SW Cache
// Storage, HTTP cache, GPU textures/shaders) is PER-DEVICE —
// whichever device visits first builds the cache for itself, it cannot be shared
// because browsers/GPUs differ.

import { version as APP_VERSION } from '../../package.json';
import {
  getBarkBump,
  getBarkTexture,
  getCactusBump,
  getCactusTexture,
  getGroundBump,
  getGroundTexture,
  getLeafBump,
  getLeafTexture,
  getRockBump,
  getRockTexture,
  getSandBump,
  getSandTexture,
  getWaterBump,
  getWaterTexture,
  loadStaticTextures,
} from '../world/textures.js';
import { QUALITY } from './setup.js';

// Yield the UI one beat so the loading bar paints before the next heavy step.
const yieldUI = () =>
  new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

// Register the SW versioned by package.json: new version = new SW = new cache.
async function registerBundleSW() {
  if (!('serviceWorker' in navigator)) return { active: false, reason: 'no-sw' };
  if (!import.meta.env.PROD) return { active: false, reason: 'dev-skip' };
  try {
    const url = `${import.meta.env.BASE_URL}sw.js?v=${encodeURIComponent(APP_VERSION)}`;
    const reg = await Promise.race([
      navigator.serviceWorker.register(url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('sw-timeout')), 8000)),
    ]);
    // Wait for the SW to control the page (so bundle fetches go through cache immediately).
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    return { active: !!reg.active || !!reg.installing || !!reg.waiting, reason: 'ok' };
  } catch (err) {
    return { active: false, reason: String(err?.message || err) };
  }
}

async function ensurePersistentStorage() {
  try {
    if (navigator.storage?.persist) return { persisted: await navigator.storage.persist() };
  } catch {
    /* ignore: API unsupported or denied */
  }
  return { persisted: false };
}

// Pre-fetch the bundle this page uses (main.js, style.css...) to warm the cache.
async function warmBundleFiles(onFrac) {
  const urls = new Set();
  document.querySelectorAll('script[src]').forEach((el) => urls.add(el.src));
  document.querySelectorAll('link[rel="stylesheet"][href]').forEach((el) => urls.add(el.href));
  const list = [...urls];
  let done = 0;
  onFrac(0);
  await Promise.all(
    list.map(async (u) => {
      try {
        await fetch(u, { credentials: 'same-origin' });
      } catch {
        /* offline/miss: SW or next visit handles it */
      }
      done += 1;
      onFrac(done / Math.max(1, list.length));
      await yieldUI();
    }),
  );
}

// Load all material textures + push to GPU during loading.
async function warmTextures(renderer, onFrac) {
  const pairs = [
    [getBarkTexture, getBarkBump],
    [getLeafTexture, getLeafBump],
    [getRockTexture, getRockBump],
    [getCactusTexture, getCactusBump],
    [getGroundTexture, getGroundBump],
    [getSandTexture, getSandBump],
    [getWaterTexture, getWaterBump],
  ];
  const includeBump = !QUALITY.low;
  const canUpload = renderer && typeof renderer.initTexture === 'function';
  const staticReport = await loadStaticTextures({ renderer, includeBump });
  let done = 0;
  const total = pairs.length * (includeBump ? 2 : 1);
  onFrac(0);
  for (const [getMap, getBump] of pairs) {
    for (const get of includeBump ? [getMap, getBump] : [getMap]) {
      const tex = get();
      try {
        if (canUpload && tex) renderer.initTexture(tex);
      } catch {
        /* GPU busy: ignore, first render uploads by itself */
      }
      done += 1;
      onFrac(done / total);
      await yieldUI();
    }
  }
  return staticReport;
}

/**
 * Run the full pipeline before playing.
 * @param {(frac:number, msg:string) => void} onProgress frac 0..1 global
 * @returns summary { sw, persisted } for debugging (see window.__jungleCache)
 */
export async function runPreGameCache({ renderer = null, onProgress = () => {} } = {}) {
  const report = (frac, msg) => {
    try {
      onProgress(Math.min(1, Math.max(0, frac)), msg);
    } catch {
      /* missing loading UI: still let the game run */
    }
  };

  // 0.00-0.20: Service Worker (bundle cache on this device).
  report(0.02, '📦 Enabling cache storage…');
  const sw = await registerBundleSW();
  report(0.2, sw.active ? '📦 Cache ready!' : '📦 Cache skipped (dev/offline mode)…');
  await yieldUI();

  // 0.20–0.25: persistent storage.
  const { persisted } = await ensurePersistentStorage();
  report(0.25, persisted ? '💾 Storage reserved!' : '💾 Preparing resources…');
  await yieldUI();

  // 0.25-0.45: warm the current bundle.
  await warmBundleFiles((f) => report(0.25 + f * 0.2, '📥 Downloading game bundle…'));
  await yieldUI();

  // 0.45-0.85: texture + GPU upload.
  await warmTextures(renderer, (f) => report(0.45 + f * 0.4, '🎨 Loading baked ground, rock, tree & river textures…'));

  report(0.85, '🌍 Building the world…');
  await yieldUI();
  const summary = { version: APP_VERSION, sw, persisted };
  try {
    window.__jungleCache = summary;
  } catch {
    /* non-browser? ignore */
  }
  return summary;
}
