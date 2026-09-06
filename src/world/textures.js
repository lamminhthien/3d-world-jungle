// Procedural canvas textures — no external image assets needed.
// They are deliberately near-white / grayscale so they multiply correctly
// with InstancedMesh instanceColor tints (map * color).
// Usage: flatMat(0xffffff, { map: getBarkTexture() })

import * as THREE from 'three';

const cache = {};

function makeCanvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function noiseOver(g, size, n, alpha, dark = true) {
  for (let i = 0; i < n; i++) {
    const v = dark ? 150 + Math.random() * 90 : 200 + Math.random() * 55;
    g.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},${alpha})`;
    const s = 1 + Math.random() * 3;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
}

/** Vertical bark streaks (trunks, brown tint comes from instanceColor). */
export function getBarkTexture() {
  if (cache.bark) return cache.bark;
  cache.bark = makeCanvas(128, (g, size) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    // vertical grooves
    for (let x = 0; x < size; x += 4) {
      const shade = 170 + Math.random() * 60;
      g.fillStyle = `rgba(${shade | 0},${shade | 0},${shade | 0},0.55)`;
      const w = 1 + Math.random() * 2;
      g.fillRect(x, 0, w, size);
    }
    // knots / speckle
    noiseOver(g, size, 350, 0.5);
    // a few dark cracks
    g.strokeStyle = 'rgba(90,90,90,0.6)';
    g.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * size;
      g.beginPath();
      g.moveTo(x, 0);
      g.bezierCurveTo(x + 4, size * 0.3, x - 4, size * 0.6, x + 2, size);
      g.stroke();
    }
  });
  return cache.bark;
}

/** Soft leaf dither (canopies, palms, bushes — tinted green via instanceColor). */
export function getLeafTexture() {
  if (cache.leaf) return cache.leaf;
  cache.leaf = makeCanvas(128, (g, size) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    noiseOver(g, size, 900, 0.35);
    // lighter highlights = fake translucency variation
    for (let i = 0; i < 120; i++) {
      g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.4})`;
      const s = 2 + Math.random() * 4;
      g.fillRect(Math.random() * size, Math.random() * size, s, s);
    }
    // subtle veins
    g.strokeStyle = 'rgba(160,160,160,0.35)';
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      g.moveTo(Math.random() * size, 0);
      g.lineTo(Math.random() * size, size);
      g.stroke();
    }
  });
  return cache.leaf;
}

/** Speckled granite (rocks — tinted grey/sand via instanceColor). */
export function getRockTexture() {
  if (cache.rock) return cache.rock;
  cache.rock = makeCanvas(128, (g, size) => {
    g.fillStyle = '#f2f2f2';
    g.fillRect(0, 0, size, size);
    noiseOver(g, size, 700, 0.5);
    g.fillStyle = 'rgba(120,120,120,0.5)';
    for (let i = 0; i < 40; i++) {
      g.fillRect(Math.random() * size, Math.random() * size, 2, 2);
    }
  });
  return cache.rock;
}

/** Ribbed cactus skin. */
export function getCactusTexture() {
  if (cache.cactus) return cache.cactus;
  cache.cactus = makeCanvas(128, (g, size) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, size, size);
    for (let x = 0; x < size; x += 8) {
      const grad = g.createLinearGradient(x, 0, x + 8, 0);
      grad.addColorStop(0, 'rgba(170,170,170,0.7)');
      grad.addColorStop(0.5, 'rgba(255,255,255,0.1)');
      grad.addColorStop(1, 'rgba(170,170,170,0.7)');
      g.fillStyle = grad;
      g.fillRect(x, 0, 8, size);
    }
    noiseOver(g, size, 200, 0.3);
  });
  return cache.cactus;
}

export function disposeTextures() {
  for (const k of Object.keys(cache)) cache[k]?.dispose?.();
  for (const k of Object.keys(cache)) delete cache[k];
}
