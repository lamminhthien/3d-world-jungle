// Procedural canvas textures — no external image assets needed.
// They are deliberately near-white / grayscale so they multiply correctly
// with InstancedMesh instanceColor tints (map * color).
// Usage: flatMat(0xffffff, { map: getBarkTexture() })
//
// Quality pass: every surface now has fine grain —
//   bark  : deep vertical grooves + cracks + peeling scales + moss flecks
//   leaf  : clustered leaflets with midribs + depth shading
//   rock  : granite speckle (3 sizes) + polygonal cracks + strata veins
//   cactus: ribs + areole dots + spine glints
//   ground: tileable grass blades + soil speckles (multiplies vertex colors)
//   sand  : tileable sand grains + wind ripples
//   water : tileable ripple streaks + micro foam (animated via offset)
// Each generator paints a COLOR canvas and a BUMP canvas side-by-side so
// materials get real relief under the sun (bumpMap, no extra geometry).
//
// Perf fixes (2026-09):
//   - ANISOTROPY now unified via QUALITY.maxAnisotropy (tier-aware, 1/4/8)
//     instead of duplicated UA sniff; clamped to renderer capabilities.
//   - BUMP skipped on QUALITY.low (Lambert, no bump fetch) — color canvas
//     only, halves CPU paint + VRAM per texture.
//   - `wrapped()` now draws only edge-neighbours when element is near the
//     seam (1-4 draws vs always 9) — biggest win for dense speckle/blades.
//   - All heavy loops scaled by 0.45× on low tier (900 blades → 400, etc).
//   - SIZE adaptive: 128px low (4× fewer pixels), 256px medium, 256px high
//     (kept 256 to avoid 4× canvas cost; detail added via contrast, not res).
//   - Filtering tuned: LinearMipmapLinear + mipmaps, anisotropy cached.
// Visual enhancements (same pass):
//   - bark  : triple groove depths + AO darkening between ribs + warmer tone
//   - leaf  : vein branching, sunlit edge, deeper shadow bed
//   - rock  : tri-tone mineral mottling, crystal glints, micro-crack network
//   - cactus: rib AO shadow, randomised areole jitter, spine shadow
//   - ground: varied blade curvature, clover hue jitter, soil AO
//   - sand  : wind-ripple sine offset, warm grain highlights
//   - water : flow-speed variation, caustic rings, foam shimmer

import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';

const cache = {};
const staticTextureFiles = {
  bark: ['bark-color.svg', 'bark-bump.svg'],
  leaf: ['leaf-color.svg', 'leaf-bump.svg'],
  rock: ['rock-color.svg', 'rock-bump.svg'],
  cactus: ['cactus-color.svg', 'cactus-bump.svg'],
  ground: ['ground-color.svg', 'ground-bump.svg'],
  sand: ['sand-color.svg', 'sand-bump.svg'],
  water: ['water-color.svg', 'water-bump.svg'],
};
// WebP variants (Phase 1 realism): prefer WebP if present, fall back to SVG.
const staticTextureWebpFiles = {
  bark: ['bark-color.webp', 'bark-bump.webp'],
  leaf: ['leaf-color.webp', 'leaf-bump.webp'],
  rock: ['rock-color.webp', 'rock-bump.webp'],
  cactus: ['cactus-color.webp', 'cactus-bump.webp'],
  ground: ['ground-color.webp', 'ground-bump.webp'],
  sand: ['sand-color.webp', 'sand-bump.webp'],
  water: ['water-color.webp', 'water-bump.webp'],
};

// Adaptive canvas size: low tier halves resolution (4× fewer pixels → 4× less
// canvas fill + VRAM + anisotropy fetch cost). Medium/high keep 256 — the
// tile repeat (7-10×) already gives high texel density at iso distance; bumping
// to 512 would be ~4× cost for marginal gain. Detail comes from contrast layers.
const SIZE = QUALITY.low ? 128 : 256;
const LOW = !!QUALITY.low;

let staticTextureLoad = null;

// Unified anisotropy: prefers QUALITY.maxAnisotropy (1 low /4 medium /8 high)
// which already encodes tier + user graphics. Falls back to UA sniff only if
// QUALITY is unavailable (e.g. unit test without setup). Clamped to the GPU's
// real cap when a renderer is available (checked once and cached).
let _anisoCached = null;
let _anisoRendererCap = null;
function maxAniso() {
  if (_anisoCached != null) {
    const cap = _anisoRendererCap ?? 8;
    return Math.min(_anisoCached, cap);
  }
  if (QUALITY?.maxAnisotropy != null) {
    _anisoCached = QUALITY.maxAnisotropy;
    return Math.min(_anisoCached, _anisoRendererCap ?? _anisoCached);
  }
  // Fallback UA check (kept for non-browser / test contexts)
  if (typeof navigator === 'undefined') return (_anisoCached = 4), 4;
  const ua = navigator.userAgent || '';
  if (/iPhone|iPod/i.test(ua)) return (_anisoCached = 1), 1;
  if (/Android|iPad|Mobile/i.test(ua)) return (_anisoCached = 4), 4;
  return (_anisoCached = 8), 8;
}
function noteRendererAniso(renderer) {
  try {
    const cap = renderer?.capabilities?.getMaxAnisotropy?.() ?? renderer?.capabilities?.getMaxAnisotropy?.call?.(renderer.capabilities) ?? null;
    if (cap != null) _anisoRendererCap = cap;
  } catch { /* ignore */ }
}

function makeTex(canvas, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  else tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = maxAniso();
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  // Low tier: mipmaps still needed to avoid moiré at distance, but anisotropic
  // filtering is the expensive part — already 1 on low via QUALITY.
  return tex;
}

function makePair(colorCanvas, bumpCanvas) {
  const map = makeTex(colorCanvas, true);
  const bumpMap = bumpCanvas ? makeTex(bumpCanvas, false) : null;
  if (bumpMap) return { map, bumpMap };
  return { map };
}

function staticTextureUrl(filename) {
  return `${import.meta.env.BASE_URL}generated/textures/${filename}`;
}

function configureStaticTexture(texture, key, isBump) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = isBump ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = maxAniso();
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  const repeat = key === 'water' ? 7 : key === 'sand' ? 9 : key === 'ground' ? 10 : 1;
  texture.repeat.set(repeat, repeat);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Load build-time generated material textures before the world is created.
 * The synchronous getters below intentionally retain their old API: if this
 * preload fails, they fall back to the original CanvasTexture generators.
 * Phase 1: prefers WebP (`.webp`) when available, falls back to SVG on 404.
 */
export async function loadStaticTextures({ renderer = null, includeBump = !QUALITY.low } = {}) {
  if (staticTextureLoad) return staticTextureLoad;
  if (renderer) noteRendererAniso(renderer);
  staticTextureLoad = (async () => {
    if (typeof document === 'undefined') return { loaded: 0, fallback: true };
    const loader = new THREE.TextureLoader();
    let loaded = 0;
    const tryLoad = async (webpFile, svgFile, key, isBump) => {
      try {
        const tex = await loader.loadAsync(staticTextureUrl(webpFile));
        cache[key] = cache[key] || {};
        if (isBump) cache[key].bumpMap = configureStaticTexture(tex, key, true);
        else cache[key].map = configureStaticTexture(tex, key, false);
        loaded += 1;
        try { renderer?.initTexture?.(tex); } catch { /* first render can upload */ }
        return;
      } catch { /* webp missing — try svg */ }
      const tex = await loader.loadAsync(staticTextureUrl(svgFile));
      cache[key] = cache[key] || {};
      if (isBump) cache[key].bumpMap = configureStaticTexture(tex, key, true);
      else cache[key].map = configureStaticTexture(tex, key, false);
      loaded += 1;
      try { renderer?.initTexture?.(tex); } catch { /* first render can upload */ }
    };
    const jobs = [];
    for (const key of Object.keys(staticTextureFiles)) {
      const [mapFile, bumpFile] = staticTextureFiles[key];
      const [webpMap, webpBump] = staticTextureWebpFiles[key] || [null, null];
      jobs.push(tryLoad(webpMap || mapFile, mapFile, key, false));
      if (includeBump) jobs.push(tryLoad(webpBump || bumpFile, bumpFile, key, true));
    }
    const results = await Promise.allSettled(jobs);
    const failed = results.filter((result) => result.status === 'rejected').length;
    return { loaded, failed, fallback: failed > 0 };
  })();
  return staticTextureLoad;
}

function newCanvas(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { alpha: false });
  // Hint to not do expensive smoothing for pixel speckle (keeps grain crisp)
  if (ctx) ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

// Draw wrapped (tileable): tileable seam handling without always paying 9×.
// Only neighbours whose element could cross the seam are drawn. Margin chosen
// to cover the largest element radius in that texture (≤22px for rock mottling).
// Interior points (majority) pay 1 draw instead of 9 → ~70% fewer fillRect/stroke.
function wrapped(g, size, x, y, fn) {
  fn(x, y);
  const m = 24;
  const nearLeft = x < m;
  const nearRight = x > size - m;
  const nearTop = y < m;
  const nearBottom = y > size - m;
  if (nearLeft) fn(x + size, y);
  if (nearRight) fn(x - size, y);
  if (nearTop) fn(x, y + size);
  if (nearBottom) fn(x, y - size);
  if (nearLeft && nearTop) fn(x + size, y + size);
  if (nearRight && nearTop) fn(x - size, y + size);
  if (nearLeft && nearBottom) fn(x + size, y - size);
  if (nearRight && nearBottom) fn(x - size, y - size);
}

function scaleCount(n) {
  return QUALITY.low ? Math.max(1, (n * 0.45) | 0) : n;
}

function grain(g, b, size, n, alpha, light, dark) {
  const count = scaleCount(n);
  for (let i = 0; i < count; i++) {
    const v = light + Math.random() * (dark - light);
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1 + Math.random() * 2.5;
    // Re-enable smoothing briefly for 1px dots is not needed — crisp is fine
    g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},${alpha})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, s, s));
    if (b) {
      const bv = v > 200 ? 200 : 90;
      b.fillStyle = `rgba(${bv},${bv},${bv},${alpha})`;
      wrapped(b, size, x, y, (px, py) => b.fillRect(px, py, s, s));
    }
  }
}

/* ------------------------------- BARK ------------------------------- */
/** Vertical bark grain: grooves, cracks, peeling scales, moss flecks. */
function buildBark() {
  const size = SIZE;
  const withBump = !QUALITY.low;
  const [cc, g] = newCanvas(size);
  const [bc, b] = withBump ? newCanvas(size) : [null, null];
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  if (b) {
    b.fillStyle = '#808080';
    b.fillRect(0, 0, size, size);
  }
  if (g) g.imageSmoothingEnabled = true;
  if (b) b.imageSmoothingEnabled = true;

  // Long vertical grooves — 3 depths for relief layering + AO darkening.
  const grooves = [
    { step: 5, w: 2.4, tone: 112, alpha: 0.78, bump: 38 },
    { step: 11, w: 1.6, tone: 160, alpha: 0.62, bump: 88 },
    { step: 23, w: 1, tone: 202, alpha: 0.52, bump: 128 },
  ];
  for (const { step, w, tone, alpha, bump } of grooves) {
    for (let x = Math.random() * step; x < size; x += step + Math.random() * 3) {
      const sway = 2 + Math.random() * 5;
      const ph = Math.random() * Math.PI * 2;
      g.strokeStyle = `rgba(${tone},${tone},${tone},${alpha})`;
      g.lineWidth = w;
      g.beginPath();
      for (let y = -8; y <= size + 8; y += 8) {
        const xx = x + Math.sin((y / size) * Math.PI * 2 + ph) * sway;
        if (y === -8) g.moveTo(xx, y);
        else g.lineTo(xx, y);
      }
      g.stroke();
      if (b) {
        b.strokeStyle = `rgba(${bump},${bump},${bump},0.85)`;
        b.lineWidth = w;
        b.beginPath();
        for (let y = -8; y <= size + 8; y += 8) {
          const xx = x + Math.sin((y / size) * Math.PI * 2 + ph) * sway;
          if (y === -8) b.moveTo(xx, y);
          else b.lineTo(xx, y);
        }
        b.stroke();
      }
    }
  }

  // Subtle AO: darken valleys between dominant grooves (adds depth without geometry).
  g.fillStyle = 'rgba(90,90,90,0.06)';
  for (let x = 0; x < size; x += 18) {
    g.fillRect(x, 0, 1.2, size);
  }

  // Peeling scale highlights between grooves (raised ridges).
  const peelCount = scaleCount(90);
  for (let i = 0; i < peelCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 2 + Math.random() * 5;
    const h = 4 + Math.random() * 10;
    g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.3})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px - w / 2, py - h / 2, w, h));
    if (b) {
      b.fillStyle = `rgba(200,200,200,${0.4 + Math.random() * 0.3})`;
      wrapped(b, size, x, y, (px, py) => b.fillRect(px - w / 2, py - h / 2, w, h));
    }
  }

  // Deep zig-zag cracks.
  const crackCount = QUALITY.low ? 5 : 9;
  for (let i = 0; i < crackCount; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size * 0.4;
    const draw = (ctx, style, width) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let cx = x;
      let cy = y;
      const segs = 5 + (Math.random() * 4) | 0;
      for (let sgm = 0; sgm < segs; sgm++) {
        cx += (Math.random() - 0.5) * 10;
        cy += 12 + Math.random() * 22;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    };
    draw(g, 'rgba(68,68,68,0.78)', 1.4);
    if (b) draw(b, 'rgba(20,20,20,0.9)', 1.6);
  }

  // Horizontal branch-scar rings.
  const ringCount = QUALITY.low ? 2 : 4;
  for (let i = 0; i < ringCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 7;
    g.strokeStyle = 'rgba(118,118,118,0.52)';
    g.lineWidth = 1.4;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
      g.stroke();
    });
    if (b) {
      b.strokeStyle = 'rgba(60,60,60,0.6)';
      b.lineWidth = 1.5;
      wrapped(b, size, x, y, (px, py) => {
        b.beginPath();
        b.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
        b.stroke();
      });
    }
  }

  // Moss / lichen flecks (slightly greener, adds realism when tinted brown).
  const mossCount = scaleCount(60);
  for (let i = 0; i < mossCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 2.5;
    g.fillStyle = `rgba(210,225,200,${0.32 + Math.random() * 0.35})`;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    });
  }

  grain(g, b, size, 500, 0.4, 150, 235);
  if (g) g.imageSmoothingEnabled = false;
  if (b) b.imageSmoothingEnabled = false;
  return makePair(cc, bc);
}

/* ------------------------------- LEAF ------------------------------- */
/** Leaf clusters: leaflets with midribs, veins, depth shading, sun flecks. */
function buildLeaf() {
  const size = SIZE;
  const withBump = !QUALITY.low;
  const [cc, g] = newCanvas(size);
  const [bc, b] = withBump ? newCanvas(size) : [null, null];
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, size, size);
  if (b) {
    b.fillStyle = '#808080';
    b.fillRect(0, 0, size, size);
  }
  if (g) g.imageSmoothingEnabled = true;
  if (b) b.imageSmoothingEnabled = true;

  // Deep shadow bed first (gaps between leaflets).
  const shadowCount = scaleCount(130);
  for (let i = 0; i < shadowCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 7;
    g.fillStyle = `rgba(148,148,148,${0.26 + Math.random() * 0.30})`;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    });
    if (b) {
      b.fillStyle = `rgba(70,70,70,${0.30 + Math.random() * 0.30})`;
      wrapped(b, size, x, y, (px, py) => {
        b.beginPath();
        b.arc(px, py, r, 0, Math.PI * 2);
        b.fill();
      });
    }
  }

  // Leaflets: ellipse + midrib + side veins + edge light.
  const leafletCount = scaleCount(110);
  for (let i = 0; i < leafletCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 4 + Math.random() * 7;
    const h = 7 + Math.random() * 12;
    const a = Math.random() * Math.PI * 2;
    const tone = 208 + Math.random() * 47;
    const lift = 150 + Math.random() * 80;
    wrapped(g, size, x, y, (px, py) => {
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.fillStyle = `rgba(${tone | 0},${tone | 0},${tone | 0},0.92)`;
      g.beginPath();
      g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      g.fill();
      // midrib — slightly stronger
      g.strokeStyle = 'rgba(148,148,148,0.58)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, -h);
      g.lineTo(0, h);
      g.stroke();
      // side veins — more branches
      g.strokeStyle = 'rgba(162,162,162,0.42)';
      g.lineWidth = 0.9;
      for (let v = -2; v <= 2; v++) {
        g.beginPath();
        g.moveTo(0, v * (h / 3));
        g.lineTo(w * 0.8, v * (h / 3) - h * 0.18);
        g.moveTo(0, v * (h / 3));
        g.lineTo(-w * 0.8, v * (h / 3) - h * 0.18);
        g.stroke();
      }
      // sunlit edge
      g.strokeStyle = 'rgba(255,255,255,0.72)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(0, 0, w - 0.8, h - 0.8, 0, -0.6, 0.9);
      g.stroke();
      g.restore();
    });
    if (b) {
      wrapped(b, size, x, y, (px, py) => {
        b.save();
        b.translate(px, py);
        b.rotate(a);
        b.fillStyle = `rgba(${lift | 0},${lift | 0},${lift | 0},0.86)`;
        b.beginPath();
        b.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
        b.fill();
        b.restore();
      });
    }
  }

  // Bright translucency flecks (sun through canopy) — slightly larger on high.
  const fleckCount = scaleCount(90);
  for (let i = 0; i < fleckCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1.5 + Math.random() * 3;
    g.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.40})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, s, s));
  }

  if (g) g.imageSmoothingEnabled = false;
  if (b) b.imageSmoothingEnabled = false;
  return makePair(cc, bc);
}

/* ------------------------------- ROCK ------------------------------- */
/** Granite: 3-size speckle + crystal glints + cracks + strata veins. */
function buildRock() {
  const size = SIZE;
  const withBump = !QUALITY.low;
  const [cc, g] = newCanvas(size);
  const [bc, b] = withBump ? newCanvas(size) : [null, null];
  g.fillStyle = '#efefef';
  g.fillRect(0, 0, size, size);
  if (b) {
    b.fillStyle = '#808080';
    b.fillRect(0, 0, size, size);
  }
  if (g) g.imageSmoothingEnabled = true;
  if (b) b.imageSmoothingEnabled = true;

  // Soft large mottling (mineral patches) — tri-tone for realism.
  const mottleCount = scaleCount(46);
  for (let i = 0; i < mottleCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 22;
    const dark = Math.random() < 0.5;
    const v = dark ? 162 + Math.random() * 30 : 222 + Math.random() * 25;
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(${v | 0},${v | 0},${v | 0},0.52)`);
    grad.addColorStop(1, `rgba(${v | 0},${v | 0},${v | 0},0)`);
    wrapped(g, size, x, y, (px, py) => {
      g.save();
      g.translate(px, py);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
  }

  // Strata veins (diagonal sediment bands).
  const veinCount = QUALITY.low ? 4 : 7;
  for (let i = 0; i < veinCount; i++) {
    const y0 = Math.random() * size;
    const slope = (Math.random() - 0.5) * 0.5;
    g.strokeStyle = `rgba(138,138,138,${0.26 + Math.random() * 0.26})`;
    g.lineWidth = 1 + Math.random() * 2.5;
    g.beginPath();
    g.moveTo(-10, y0);
    g.lineTo(size + 10, y0 + slope * size);
    g.stroke();
    if (b) {
      b.strokeStyle = 'rgba(100,100,100,0.42)';
      b.lineWidth = 1.5;
      b.beginPath();
      b.moveTo(-10, y0);
      b.lineTo(size + 10, y0 + slope * size);
      b.stroke();
    }
  }

  // Polygonal cracks — micro-network.
  const crackCount = QUALITY.low ? 5 : 10;
  for (let i = 0; i < crackCount; i++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    const draw = (ctx, style, w) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      let cx = x;
      let cy = y;
      const segs = 3 + ((Math.random() * 4) | 0);
      let ang = Math.random() * Math.PI * 2;
      for (let s = 0; s < segs; s++) {
        ang += (Math.random() - 0.5) * 1.6;
        const len = 10 + Math.random() * 26;
        cx += Math.cos(ang) * len;
        cy += Math.sin(ang) * len;
        ctx.lineTo(cx, cy);
      }
      ctx.stroke();
    };
    draw(g, 'rgba(94,94,94,0.66)', 1.15);
    if (b) draw(b, 'rgba(30,30,30,0.86)', 1.45);
  }

  // Speckle in 3 sizes + crystal glints.
  grain(g, b, size, 1500, 0.5, 140, 230);
  grain(g, b, size, 260, 0.6, 100, 190);
  const glintCount = scaleCount(120);
  for (let i = 0; i < glintCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(255,255,255,${0.52 + Math.random() * 0.48})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, 1.4, 1.4));
    if (b) {
      b.fillStyle = 'rgba(210,210,210,0.7)';
      wrapped(b, size, x, y, (px, py) => b.fillRect(px, py, 1.4, 1.4));
    }
  }
  const darkCount = scaleCount(60);
  for (let i = 0; i < darkCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(104,104,104,${0.52 + Math.random() * 0.38})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, 2, 2));
    if (b) {
      b.fillStyle = 'rgba(50,50,50,0.7)';
      wrapped(b, size, x, y, (px, py) => b.fillRect(px, py, 2, 2));
    }
  }

  if (g) g.imageSmoothingEnabled = false;
  if (b) b.imageSmoothingEnabled = false;
  return makePair(cc, bc);
}

/* ------------------------------ CACTUS ------------------------------ */
/** Ribbed cactus skin with areoles, spine glints and vertical grain. */
function buildCactus() {
  const size = SIZE;
  const withBump = !QUALITY.low;
  const [cc, g] = newCanvas(size);
  const [bc, b] = withBump ? newCanvas(size) : [null, null];
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  if (b) {
    b.fillStyle = '#808080';
    b.fillRect(0, 0, size, size);
  }

  const ribs = QUALITY.low ? 6 : 8;
  const rw = size / ribs;
  for (let r = 0; r < ribs; r++) {
    const x = r * rw;
    const grad = g.createLinearGradient(x, 0, x + rw, 0);
    grad.addColorStop(0, 'rgba(118,118,118,0.86)');
    grad.addColorStop(0.28, 'rgba(234,234,234,0.52)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.88)');
    grad.addColorStop(0.72, 'rgba(234,234,234,0.52)');
    grad.addColorStop(1, 'rgba(118,118,118,0.86)');
    g.fillStyle = grad;
    g.fillRect(x, 0, rw, size);
    if (b) {
      const bg = b.createLinearGradient(x, 0, x + rw, 0);
      bg.addColorStop(0, 'rgba(30,30,30,0.92)');
      bg.addColorStop(0.5, 'rgba(220,220,220,0.92)');
      bg.addColorStop(1, 'rgba(30,30,30,0.92)');
      b.fillStyle = bg;
      b.fillRect(x, 0, rw, size);
    }
    g.strokeStyle = 'rgba(168,168,168,0.62)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x + rw / 2, 0);
    g.lineTo(x + rw / 2, size);
    g.stroke();
    // AO shadow at rib valley
    g.fillStyle = 'rgba(90,90,90,0.07)';
    g.fillRect(x, 0, 1.5, size);
    g.fillRect(x + rw - 1.5, 0, 1.5, size);
  }

  // Areole dots + spine glints along each rib — jittered vertically.
  for (let r = 0; r < ribs; r++) {
    const x = r * rw + rw / 2;
    for (let y = 6; y < size; y += 14 + Math.random() * 8) {
      const jy = y + (Math.random() - 0.5) * 5;
      g.fillStyle = 'rgba(148,148,148,0.82)';
      g.beginPath();
      g.arc(x, jy, 2.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.96)';
      g.beginPath();
      g.arc(x, jy, 1.1, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(240,240,240,0.92)';
      g.lineWidth = 1;
      for (let s = 0; s < 3; s++) {
        const a = Math.random() * Math.PI * 2;
        g.beginPath();
        g.moveTo(x, jy);
        g.lineTo(x + Math.cos(a) * 4.5, jy + Math.sin(a) * 4.5);
        g.stroke();
      }
      if (b) {
        b.fillStyle = 'rgba(190,190,190,0.92)';
        b.beginPath();
        b.arc(x, jy, 2.4, 0, Math.PI * 2);
        b.fill();
      }
    }
  }

  grain(g, b, size, 220, 0.3, 170, 240);
  return makePair(cc, bc);
}

/* --------------------------- GROUND (grass) -------------------------- */
/** Tileable grass detail: blades, clover dots, soil speckles. Near-white. */
function buildGround() {
  const size = SIZE;
  const withBump = !QUALITY.low;
  const [cc, g] = newCanvas(size);
  const [bc, b] = withBump ? newCanvas(size) : [null, null];
  g.fillStyle = '#f5f5f5';
  g.fillRect(0, 0, size, size);
  if (b) {
    b.fillStyle = '#808080';
    b.fillRect(0, 0, size, size);
  }
  if (g) g.imageSmoothingEnabled = true;
  if (b) b.imageSmoothingEnabled = true;

  // Soil patches underneath — warm near-white (Stardew: grain, not gray wash).
  const soilCount = scaleCount(40);
  for (let i = 0; i < soilCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 5 + Math.random() * 14;
    const v = 226 + Math.random() * 24;
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(${v | 0},${v | 0},${v | 0},0.56)`);
    grad.addColorStop(1, `rgba(${v | 0},${v | 0},${v | 0},0)`);
    wrapped(g, size, x, y, (px, py) => {
      g.save();
      g.translate(px, py);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(0, 0, r, 0, Math.PI * 2);
      g.fill();
      g.restore();
    });
  }

  // Grass blades: short strokes, Stardew-bright (205-255, no gray wash).
  const bladeCount = scaleCount(900);
  for (let i = 0; i < bladeCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 3 + Math.random() * 7;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const dark = Math.random() < 0.55;
    const v = dark ? 205 + Math.random() * 30 : 235 + Math.random() * 20;
    const draw = (ctx, style, w) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      wrapped(ctx, size, x, y, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px, py);
        // Slight curve via quadratic
        const mx = px + Math.cos(a) * len * 0.5 + (Math.random() - 0.5) * 1.2;
        const my = py + Math.sin(a) * len * 0.5;
        const ex = px + Math.cos(a) * len;
        const ey = py + Math.sin(a) * len;
        ctx.quadraticCurveTo(mx, my, ex, ey);
        ctx.stroke();
      });
    };
    draw(g, `rgba(${v | 0},${v | 0},${v | 0},0.66)`, 1.18);
    if (b) draw(b, dark ? 'rgba(90,90,90,0.60)' : 'rgba(170,170,170,0.60)', 1.18);
  }

  // Clover / pebble dots — near-white so they sparkle, never gray out.
  const dotCount = scaleCount(130);
  for (let i = 0; i < dotCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 2.2;
    const bright = Math.random() < 0.4;
    g.fillStyle = bright
      ? `rgba(255,255,255,${0.42 + Math.random() * 0.38})`
      : `rgba(228,228,228,${0.30 + Math.random() * 0.28})`;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    });
  }

  grain(g, b, size, 700, 0.3, 212, 250);
  if (g) g.imageSmoothingEnabled = false;
  if (b) b.imageSmoothingEnabled = false;
  const { map, bumpMap } = makePair(cc, bc);
  map.repeat.set(10, 10);
  if (bumpMap) bumpMap.repeat.set(10, 10);
  return bumpMap ? { map, bumpMap } : { map };
}

/* ------------------------------- SAND -------------------------------- */
/** Tileable sand: dense grains + wind ripple bands. Near-white warm. */
function buildSand() {
  const size = SIZE;
  const withBump = !QUALITY.low;
  const [cc, g] = newCanvas(size);
  const [bc, b] = withBump ? newCanvas(size) : [null, null];
  g.fillStyle = '#f7f4ec';
  g.fillRect(0, 0, size, size);
  if (b) {
    b.fillStyle = '#808080';
    b.fillRect(0, 0, size, size);
  }

  // Wind ripples (horizontal sine bands) — offset + amplitude variation.
  const rippleStep = QUALITY.low ? 9 : 7;
  for (let y = 0; y < size; y += rippleStep) {
    const drift = Math.sin((y / size) * Math.PI * 3) * 1.5;
    for (let x = 0; x < size; x += 4) {
      const wave = Math.sin((x / size) * Math.PI * 4 + (y / size) * Math.PI * 2 + drift) * 2;
      const v = 204 + wave * 8 + Math.random() * 12;
      g.fillStyle = `rgba(${v | 0},${v | 0},${(v - 6) | 0},0.52)`;
      g.fillRect(x, y + wave, 4, 2.5);
      if (b) {
        const bv = 128 + wave * 14;
        b.fillStyle = `rgba(${bv | 0},${bv | 0},${bv | 0},0.52)`;
        b.fillRect(x, y + wave, 4, 2.5);
      }
    }
  }

  // Dense sand grains, 2 tones — warm highlight pass.
  grain(g, b, size, 2200, 0.50, 150, 235);
  const grain2 = scaleCount(300);
  for (let i = 0; i < grain2; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(255,252,244,${0.52 + Math.random() * 0.48})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, 1.3, 1.3));
  }

  const { map, bumpMap } = makePair(cc, bc);
  map.repeat.set(9, 9);
  if (bumpMap) bumpMap.repeat.set(9, 9);
  return bumpMap ? { map, bumpMap } : { map };
}

/* ------------------------------- WATER ------------------------------- */
/** Tileable water: flow streaks + ripple rings + micro foam. */
function buildWater() {
  const size = SIZE;
  const withBump = !QUALITY.low;
  const [cc, g] = newCanvas(size);
  const [bc, b] = withBump ? newCanvas(size) : [null, null];
  g.fillStyle = '#e8f6fa';
  g.fillRect(0, 0, size, size);
  if (b) {
    b.fillStyle = '#808080';
    b.fillRect(0, 0, size, size);
  }
  if (g) g.imageSmoothingEnabled = true;
  if (b) b.imageSmoothingEnabled = true;

  // Long flow streaks along Y (river flows +z) — speed variation adds realism.
  const streakCount = scaleCount(70);
  for (let i = 0; i < streakCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 18 + Math.random() * 60;
    const w = 1 + Math.random() * 3;
    const bright = Math.random() < 0.6;
    const v = bright ? 234 + Math.random() * 20 : 164 + Math.random() * 40;
    wrapped(g, size, x, y, (px, py) => {
      const grad = g.createLinearGradient(0, py, 0, py + len);
      grad.addColorStop(0, `rgba(${v | 0},${v | 0},${v | 0},0)`);
      grad.addColorStop(0.5, `rgba(${v | 0},${v | 0},${v | 0},0.56)`);
      grad.addColorStop(1, `rgba(${v | 0},${v | 0},${v | 0},0)`);
      g.fillStyle = grad;
      g.fillRect(px - w / 2, py, w, len);
    });
    if (b) {
      wrapped(b, size, x, y, (px, py) => {
        b.fillStyle = bright ? 'rgba(180,180,180,0.52)' : 'rgba(90,90,90,0.52)';
        b.fillRect(px - w / 2, py, w, len);
      });
    }
  }

  // Ripple rings — slightly elliptical, varied opacity.
  const ringCount = scaleCount(40);
  for (let i = 0; i < ringCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 9;
    g.strokeStyle = `rgba(255,255,255,${0.32 + Math.random() * 0.38})`;
    g.lineWidth = 1;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
    });
    if (b) {
      b.strokeStyle = 'rgba(170,170,170,0.52)';
      wrapped(b, size, x, y, (px, py) => {
        b.beginPath();
        b.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
        b.stroke();
      });
    }
  }

  // Micro foam dots — clustered for natural distribution.
  const foamCount = scaleCount(350);
  for (let i = 0; i < foamCount; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1 + Math.random() * 2;
    g.fillStyle = `rgba(255,255,255,${0.42 + Math.random() * 0.48})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, s, s * 0.7));
  }

  if (g) g.imageSmoothingEnabled = false;
  if (b) b.imageSmoothingEnabled = false;
  const { map, bumpMap } = makePair(cc, bc);
  map.repeat.set(7, 7);
  if (bumpMap) bumpMap.repeat.set(7, 7);
  return bumpMap ? { map, bumpMap } : { map };
}

// ---- Cache + public API (backward compatible: getters return map) ----
function cached(key, builder) {
  if (!cache[key]) cache[key] = builder();
  return cache[key];
}

function cachedMap(key, builder) {
  if (!cache[key]?.map) {
    const built = builder();
    // Merge without overwriting existing bumpMap from static pre-load
    cache[key] = { ...cache[key], ...built };
    // Ensure map exists even when builder skipped bump
    if (!cache[key].map && built.map) cache[key].map = built.map;
  }
  return cache[key].map;
}

function cachedBump(key, builder) {
  if (QUALITY.low) return null;
  if (!cache[key]?.bumpMap) {
    const built = builder();
    cache[key] = { ...cache[key], ...built };
    // If build skipped bump (low) but this is called on high after, rebuild with bump
    if (!cache[key].bumpMap && built.bumpMap) cache[key].bumpMap = built.bumpMap;
  }
  return cache[key].bumpMap;
}

/** Vertical bark streaks (trunks, brown tint comes from instanceColor). */
export function getBarkTexture() {
  return cachedMap('bark', buildBark);
}
export function getBarkBump() {
  return cachedBump('bark', buildBark);
}

/** Soft leaf dither (canopies, palms, bushes — tinted green via instanceColor). */
export function getLeafTexture() {
  return cachedMap('leaf', buildLeaf);
}
export function getLeafBump() {
  return cachedBump('leaf', buildLeaf);
}

/** Speckled granite (rocks — tinted grey/sand via instanceColor). */
export function getRockTexture() {
  return cachedMap('rock', buildRock);
}
export function getRockBump() {
  return cachedBump('rock', buildRock);
}

/** Ribbed cactus skin. */
export function getCactusTexture() {
  return cachedMap('cactus', buildCactus);
}
export function getCactusBump() {
  return cachedBump('cactus', buildCactus);
}

/** Tileable grass micro-detail (multiplies biome vertex colors). */
export function getGroundTexture() {
  return cachedMap('ground', buildGround);
}
export function getGroundBump() {
  return cachedBump('ground', buildGround);
}

/** Tileable sand grains + wind ripples. */
export function getSandTexture() {
  return cachedMap('sand', buildSand);
}
export function getSandBump() {
  return cachedBump('sand', buildSand);
}

/** Tileable water ripples + foam (animate .offset to flow). */
export function getWaterTexture() {
  return cachedMap('water', buildWater);
}
export function getWaterBump() {
  return cachedBump('water', buildWater);
}

export function disposeTextures() {
  for (const k of Object.keys(cache)) {
    cache[k]?.map?.dispose?.();
    cache[k]?.bumpMap?.dispose?.();
    delete cache[k];
  }
  staticTextureLoad = null;
  _anisoCached = null;
  _anisoRendererCap = null;
}
