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

import * as THREE from 'three';

const cache = {};
const SIZE = 256;

function makeTex(canvas, srgb = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function makePair(colorCanvas, bumpCanvas) {
  const map = makeTex(colorCanvas, true);
  const bumpMap = makeTex(bumpCanvas, false);
  return { map, bumpMap };
}

function newCanvas(size = SIZE) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

// Draw wrapped (tileable): callback runs for the point and its 8 neighbours
// so strokes crossing an edge continue on the opposite edge.
function wrapped(g, size, x, y, fn) {
  for (let ox = -size; ox <= size; ox += size) {
    for (let oy = -size; oy <= size; oy += size) {
      fn(x + ox, y + oy);
    }
  }
}

function grain(g, b, size, n, alpha, light, dark) {
  for (let i = 0; i < n; i++) {
    const v = light + Math.random() * (dark - light);
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1 + Math.random() * 2.5;
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
  const [cc, g] = newCanvas(size);
  const [bc, b] = newCanvas(size);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  // Long vertical grooves — 3 depths for relief layering.
  const grooves = [
    { step: 5, w: 2.5, tone: 118, alpha: 0.75, bump: 40 },
    { step: 11, w: 1.5, tone: 165, alpha: 0.6, bump: 90 },
    { step: 23, w: 1, tone: 205, alpha: 0.5, bump: 130 },
  ];
  for (const { step, w, tone, alpha, bump } of grooves) {
    for (let x = Math.random() * step; x < size; x += step + Math.random() * 3) {
      const sway = 2 + Math.random() * 5;
      const ph = Math.random() * Math.PI * 2;
      // color groove
      g.strokeStyle = `rgba(${tone},${tone},${tone},${alpha})`;
      g.lineWidth = w;
      g.beginPath();
      for (let y = -8; y <= size + 8; y += 8) {
        const xx = x + Math.sin((y / size) * Math.PI * 2 + ph) * sway;
        if (y === -8) g.moveTo(xx, y);
        else g.lineTo(xx, y);
      }
      g.stroke();
      // matching bump valley
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

  // Peeling scale highlights between grooves (raised ridges).
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 2 + Math.random() * 5;
    const h = 4 + Math.random() * 10;
    g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.3})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px - w / 2, py - h / 2, w, h));
    b.fillStyle = `rgba(200,200,200,${0.4 + Math.random() * 0.3})`;
    wrapped(b, size, x, y, (px, py) => b.fillRect(px - w / 2, py - h / 2, w, h));
  }

  // Deep zig-zag cracks.
  for (let i = 0; i < 9; i++) {
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
    draw(g, 'rgba(70,70,70,0.75)', 1.4);
    draw(b, 'rgba(20,20,20,0.9)', 1.6);
  }

  // Horizontal branch-scar rings.
  for (let i = 0; i < 4; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 7;
    g.strokeStyle = 'rgba(120,120,120,0.5)';
    g.lineWidth = 1.5;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
      g.stroke();
    });
    b.strokeStyle = 'rgba(60,60,60,0.6)';
    b.lineWidth = 1.5;
    wrapped(b, size, x, y, (px, py) => {
      b.beginPath();
      b.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
      b.stroke();
    });
  }

  // Moss / lichen flecks (kept pale so the brown tint stays correct).
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 2.5;
    g.fillStyle = `rgba(215,225,205,${0.3 + Math.random() * 0.35})`;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    });
  }

  grain(g, b, size, 500, 0.4, 150, 235);
  return makePair(cc, bc);
}

/* ------------------------------- LEAF ------------------------------- */
/** Leaf clusters: leaflets with midribs, veins, depth shading, sun flecks. */
function buildLeaf() {
  const size = SIZE;
  const [cc, g] = newCanvas(size);
  const [bc, b] = newCanvas(size);
  g.fillStyle = '#f4f4f4';
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  // Deep shadow bed first (gaps between leaflets).
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 7;
    g.fillStyle = `rgba(150,150,150,${0.25 + Math.random() * 0.3})`;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    });
    b.fillStyle = `rgba(70,70,70,${0.3 + Math.random() * 0.3})`;
    wrapped(b, size, x, y, (px, py) => {
      b.beginPath();
      b.arc(px, py, r, 0, Math.PI * 2);
      b.fill();
    });
  }

  // Leaflets: ellipse + midrib + side veins + edge light.
  for (let i = 0; i < 110; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const w = 4 + Math.random() * 7;
    const h = 7 + Math.random() * 12;
    const a = Math.random() * Math.PI * 2;
    const tone = 208 + Math.random() * 47; // near-white keeps tint pure
    const lift = 150 + Math.random() * 80;
    wrapped(g, size, x, y, (px, py) => {
      g.save();
      g.translate(px, py);
      g.rotate(a);
      g.fillStyle = `rgba(${tone | 0},${tone | 0},${tone | 0},0.9)`;
      g.beginPath();
      g.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      g.fill();
      // midrib
      g.strokeStyle = 'rgba(150,150,150,0.55)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, -h);
      g.lineTo(0, h);
      g.stroke();
      // side veins
      g.strokeStyle = 'rgba(165,165,165,0.4)';
      for (let v = -2; v <= 2; v++) {
        g.beginPath();
        g.moveTo(0, v * (h / 3));
        g.lineTo(w * 0.8, v * (h / 3) - h * 0.18);
        g.moveTo(0, v * (h / 3));
        g.lineTo(-w * 0.8, v * (h / 3) - h * 0.18);
        g.stroke();
      }
      // sunlit edge
      g.strokeStyle = 'rgba(255,255,255,0.7)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.ellipse(0, 0, w - 0.8, h - 0.8, 0, -0.6, 0.9);
      g.stroke();
      g.restore();
    });
    wrapped(b, size, x, y, (px, py) => {
      b.save();
      b.translate(px, py);
      b.rotate(a);
      b.fillStyle = `rgba(${lift | 0},${lift | 0},${lift | 0},0.85)`;
      b.beginPath();
      b.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
      b.fill();
      b.restore();
    });
  }

  // Bright translucency flecks (sun through canopy).
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1.5 + Math.random() * 3;
    g.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.4})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, s, s));
  }

  return makePair(cc, bc);
}

/* ------------------------------- ROCK ------------------------------- */
/** Granite: 3-size speckle + crystal glints + cracks + strata veins. */
function buildRock() {
  const size = SIZE;
  const [cc, g] = newCanvas(size);
  const [bc, b] = newCanvas(size);
  g.fillStyle = '#efefef';
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  // Soft large mottling (mineral patches).
  for (let i = 0; i < 46; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 8 + Math.random() * 22;
    const dark = Math.random() < 0.5;
    const v = dark ? 165 + Math.random() * 30 : 225 + Math.random() * 25;
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(${v | 0},${v | 0},${v | 0},0.5)`);
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
  for (let i = 0; i < 7; i++) {
    const y0 = Math.random() * size;
    const slope = (Math.random() - 0.5) * 0.5;
    g.strokeStyle = `rgba(140,140,140,${0.25 + Math.random() * 0.25})`;
    g.lineWidth = 1 + Math.random() * 2.5;
    g.beginPath();
    g.moveTo(-10, y0);
    g.lineTo(size + 10, y0 + slope * size);
    g.stroke();
    b.strokeStyle = 'rgba(100,100,100,0.4)';
    b.lineWidth = 1.5;
    b.beginPath();
    b.moveTo(-10, y0);
    b.lineTo(size + 10, y0 + slope * size);
    b.stroke();
  }

  // Polygonal cracks.
  for (let i = 0; i < 10; i++) {
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
    draw(g, 'rgba(95,95,95,0.65)', 1.2);
    draw(b, 'rgba(30,30,30,0.85)', 1.5);
  }

  // Speckle in 3 sizes + crystal glints.
  grain(g, b, size, 1500, 0.5, 140, 230);
  grain(g, b, size, 260, 0.6, 100, 190);
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.5})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, 1.4, 1.4));
    b.fillStyle = 'rgba(210,210,210,0.7)';
    wrapped(b, size, x, y, (px, py) => b.fillRect(px, py, 1.4, 1.4));
  }
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(105,105,105,${0.5 + Math.random() * 0.4})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, 2, 2));
    b.fillStyle = 'rgba(50,50,50,0.7)';
    wrapped(b, size, x, y, (px, py) => b.fillRect(px, py, 2, 2));
  }

  return makePair(cc, bc);
}

/* ------------------------------ CACTUS ------------------------------ */
/** Ribbed cactus skin with areoles, spine glints and vertical grain. */
function buildCactus() {
  const size = SIZE;
  const [cc, g] = newCanvas(size);
  const [bc, b] = newCanvas(size);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  const ribs = 8;
  const rw = size / ribs;
  for (let r = 0; r < ribs; r++) {
    const x = r * rw;
    // rounded rib shading
    const grad = g.createLinearGradient(x, 0, x + rw, 0);
    grad.addColorStop(0, 'rgba(120,120,120,0.85)');
    grad.addColorStop(0.28, 'rgba(235,235,235,0.5)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.72, 'rgba(235,235,235,0.5)');
    grad.addColorStop(1, 'rgba(120,120,120,0.85)');
    g.fillStyle = grad;
    g.fillRect(x, 0, rw, size);
    const bg = b.createLinearGradient(x, 0, x + rw, 0);
    bg.addColorStop(0, 'rgba(30,30,30,0.9)');
    bg.addColorStop(0.5, 'rgba(220,220,220,0.9)');
    bg.addColorStop(1, 'rgba(30,30,30,0.9)');
    b.fillStyle = bg;
    b.fillRect(x, 0, rw, size);
    // rib centre spine line
    g.strokeStyle = 'rgba(170,170,170,0.6)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x + rw / 2, 0);
    g.lineTo(x + rw / 2, size);
    g.stroke();
  }

  // Areole dots + spine glints along each rib.
  for (let r = 0; r < ribs; r++) {
    const x = r * rw + rw / 2;
    for (let y = 6; y < size; y += 14 + Math.random() * 8) {
      const jy = y + (Math.random() - 0.5) * 5;
      g.fillStyle = 'rgba(150,150,150,0.8)';
      g.beginPath();
      g.arc(x, jy, 2.4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath();
      g.arc(x, jy, 1.1, 0, Math.PI * 2);
      g.fill();
      // tiny spines
      g.strokeStyle = 'rgba(240,240,240,0.9)';
      g.lineWidth = 1;
      for (let s = 0; s < 3; s++) {
        const a = Math.random() * Math.PI * 2;
        g.beginPath();
        g.moveTo(x, jy);
        g.lineTo(x + Math.cos(a) * 4.5, jy + Math.sin(a) * 4.5);
        g.stroke();
      }
      b.fillStyle = 'rgba(190,190,190,0.9)';
      b.beginPath();
      b.arc(x, jy, 2.4, 0, Math.PI * 2);
      b.fill();
    }
  }

  grain(g, b, size, 220, 0.3, 170, 240);
  return makePair(cc, bc);
}

/* --------------------------- GROUND (grass) -------------------------- */
/** Tileable grass detail: blades, clover dots, soil speckles. Near-white. */
function buildGround() {
  const size = SIZE;
  const [cc, g] = newCanvas(size);
  const [bc, b] = newCanvas(size);
  g.fillStyle = '#f5f5f5';
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  // Soil patches underneath.
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 5 + Math.random() * 14;
    const v = 195 + Math.random() * 30;
    const grad = g.createRadialGradient(0, 0, 0, 0, 0, r);
    grad.addColorStop(0, `rgba(${v | 0},${v | 0},${v | 0},0.55)`);
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

  // Grass blades: short strokes in varied directions.
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 3 + Math.random() * 7;
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const dark = Math.random() < 0.55;
    const v = dark ? 150 + Math.random() * 50 : 215 + Math.random() * 40;
    const draw = (ctx, style, w) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      wrapped(ctx, size, x, y, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
        ctx.stroke();
      });
    };
    draw(g, `rgba(${v | 0},${v | 0},${v | 0},0.65)`, 1.2);
    draw(b, dark ? 'rgba(90,90,90,0.6)' : 'rgba(170,170,170,0.6)', 1.2);
  }

  // Clover / pebble dots.
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 1 + Math.random() * 2.2;
    const bright = Math.random() < 0.4;
    g.fillStyle = bright
      ? `rgba(255,255,255,${0.4 + Math.random() * 0.4})`
      : `rgba(170,170,170,${0.3 + Math.random() * 0.3})`;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.arc(px, py, r, 0, Math.PI * 2);
      g.fill();
    });
  }

  grain(g, b, size, 700, 0.35, 160, 240);
  const { map, bumpMap } = makePair(cc, bc);
  map.repeat.set(10, 10);
  bumpMap.repeat.set(10, 10);
  return { map, bumpMap };
}

/* ------------------------------- SAND -------------------------------- */
/** Tileable sand: dense grains + wind ripple bands. Near-white warm. */
function buildSand() {
  const size = SIZE;
  const [cc, g] = newCanvas(size);
  const [bc, b] = newCanvas(size);
  g.fillStyle = '#f7f4ec';
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  // Wind ripples (horizontal sine bands).
  for (let y = 0; y < size; y += 7) {
    for (let x = 0; x < size; x += 4) {
      const wave = Math.sin((x / size) * Math.PI * 4 + (y / size) * Math.PI * 2) * 2;
      const v = 205 + wave * 8 + Math.random() * 12;
      g.fillStyle = `rgba(${v | 0},${v | 0},${(v - 6) | 0},0.5)`;
      g.fillRect(x, y + wave, 4, 2.5);
      const bv = 128 + wave * 14;
      b.fillStyle = `rgba(${bv | 0},${bv | 0},${bv | 0},0.5)`;
      b.fillRect(x, y + wave, 4, 2.5);
    }
  }

  // Dense sand grains, 2 tones.
  grain(g, b, size, 2200, 0.5, 150, 235);
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    g.fillStyle = `rgba(255,252,244,${0.5 + Math.random() * 0.5})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, 1.3, 1.3));
  }

  const { map, bumpMap } = makePair(cc, bc);
  map.repeat.set(9, 9);
  bumpMap.repeat.set(9, 9);
  return { map, bumpMap };
}

/* ------------------------------- WATER ------------------------------- */
/** Tileable water: flow streaks + ripple rings + micro foam. */
function buildWater() {
  const size = SIZE;
  const [cc, g] = newCanvas(size);
  const [bc, b] = newCanvas(size);
  // Cool pale blue-white; river material tints it via color.
  g.fillStyle = '#e8f6fa';
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  // Long flow streaks along Y (river flows +z).
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const len = 18 + Math.random() * 60;
    const w = 1 + Math.random() * 3;
    const bright = Math.random() < 0.6;
    const v = bright ? 235 + Math.random() * 20 : 165 + Math.random() * 40;
    wrapped(g, size, x, y, (px, py) => {
      const grad = g.createLinearGradient(0, py, 0, py + len);
      grad.addColorStop(0, `rgba(${v | 0},${v | 0},${v | 0},0)`);
      grad.addColorStop(0.5, `rgba(${v | 0},${v | 0},${v | 0},0.55)`);
      grad.addColorStop(1, `rgba(${v | 0},${v | 0},${v | 0},0)`);
      g.fillStyle = grad;
      g.fillRect(px - w / 2, py, w, len);
    });
    wrapped(b, size, x, y, (px, py) => {
      b.fillStyle = bright ? 'rgba(180,180,180,0.5)' : 'rgba(90,90,90,0.5)';
      b.fillRect(px - w / 2, py, w, len);
    });
  }

  // Ripple rings.
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 3 + Math.random() * 9;
    g.strokeStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
    g.lineWidth = 1;
    wrapped(g, size, x, y, (px, py) => {
      g.beginPath();
      g.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
      g.stroke();
    });
    b.strokeStyle = 'rgba(170,170,170,0.5)';
    wrapped(b, size, x, y, (px, py) => {
      b.beginPath();
      b.ellipse(px, py, r, r * 0.55, 0, 0, Math.PI * 2);
      b.stroke();
    });
  }

  // Micro foam dots.
  for (let i = 0; i < 350; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const s = 1 + Math.random() * 2;
    g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.5})`;
    wrapped(g, size, x, y, (px, py) => g.fillRect(px, py, s, s * 0.7));
  }

  const { map, bumpMap } = makePair(cc, bc);
  map.repeat.set(7, 7);
  bumpMap.repeat.set(7, 7);
  return { map, bumpMap };
}

// ---- Cache + public API (backward compatible: getters return map) ----
function cached(key, builder) {
  if (!cache[key]) cache[key] = builder();
  return cache[key];
}

/** Vertical bark streaks (trunks, brown tint comes from instanceColor). */
export function getBarkTexture() {
  return cached('bark', buildBark).map;
}
export function getBarkBump() {
  return cached('bark', buildBark).bumpMap;
}

/** Soft leaf dither (canopies, palms, bushes — tinted green via instanceColor). */
export function getLeafTexture() {
  return cached('leaf', buildLeaf).map;
}
export function getLeafBump() {
  return cached('leaf', buildLeaf).bumpMap;
}

/** Speckled granite (rocks — tinted grey/sand via instanceColor). */
export function getRockTexture() {
  return cached('rock', buildRock).map;
}
export function getRockBump() {
  return cached('rock', buildRock).bumpMap;
}

/** Ribbed cactus skin. */
export function getCactusTexture() {
  return cached('cactus', buildCactus).map;
}
export function getCactusBump() {
  return cached('cactus', buildCactus).bumpMap;
}

/** Tileable grass micro-detail (multiplies biome vertex colors). */
export function getGroundTexture() {
  return cached('ground', buildGround).map;
}
export function getGroundBump() {
  return cached('ground', buildGround).bumpMap;
}

/** Tileable sand grains + wind ripples. */
export function getSandTexture() {
  return cached('sand', buildSand).map;
}
export function getSandBump() {
  return cached('sand', buildSand).bumpMap;
}

/** Tileable water ripples + foam (animate .offset to flow). */
export function getWaterTexture() {
  return cached('water', buildWater).map;
}
export function getWaterBump() {
  return cached('water', buildWater).bumpMap;
}

export function disposeTextures() {
  for (const k of Object.keys(cache)) {
    cache[k]?.map?.dispose?.();
    cache[k]?.bumpMap?.dispose?.();
    delete cache[k];
  }
}
