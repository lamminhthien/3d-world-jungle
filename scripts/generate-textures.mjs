#!/usr/bin/env node

/**
 * Build-time material texture generator.
 *
 * The runtime used to paint these tileable details into CanvasTexture objects.
 * SVG keeps the generated assets small, deterministic and independent of a
 * native Node canvas package. Three.js rasterizes the SVG once when uploading
 * it to the GPU, while the expensive Canvas drawing loops no longer run in
 * every browser session.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const outputDir = resolve(root, 'public/generated/textures');
const size = 256;

function hash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let state = hash(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822519);
    state = Math.imul(state ^ (state >>> 13), 3266489917);
    return ((state ^ (state >>> 16)) >>> 0) / 4294967296;
  };
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  }[char]));
}

function svgStart(background) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
<rect width="256" height="256" fill="${background}"/>`;
}

function wrapPoint(x, y, draw) {
  const copies = [];
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) copies.push(draw(x + ox, y + oy));
  }
  return copies.join('');
}

function tilePattern(name, { background, bumpBackground = '#808080', draw }) {
  const color = `${svgStart(background)}${draw(false)}${wrapMarker()} </svg>`;
  const bump = `${svgStart(bumpBackground)}${draw(true)}${wrapMarker()} </svg>`;
  return { [`${name}-color`]: color, [`${name}-bump`]: bump };
}

// SVG images naturally repeat when THREE.RepeatWrapping is applied. The marker
// is deliberately invisible and keeps generated files valid even when a
// pattern happens to contain no optional marks.
function wrapMarker() {
  return '<path d="M0 0h0" fill="none"/>';
}

function bark() {
  const color = rng('bark-color');
  const bump = rng('bark-bump');
  const draw = (isBump) => {
    const r = isBump ? bump : color;
    let out = '';
    for (let x = -8; x < size + 8; x += 9 + r() * 9) {
      const tone = isBump ? 55 + Math.floor(r() * 105) : 75 + Math.floor(r() * 130);
      const width = 1 + r() * 2.5;
      out += `<path d="M${x} -8 C ${x + 7} 55 ${x - 5} 120 ${x + 3} 264" fill="none" stroke="rgb(${tone},${tone},${tone})" stroke-opacity=".62" stroke-width="${width.toFixed(2)}"/>`;
    }
    for (let i = 0; i < 70; i++) {
      const x = r() * size;
      const y = r() * size;
      const w = 2 + r() * 6;
      const h = 4 + r() * 12;
      const tone = isBump ? 90 + Math.floor(r() * 100) : 155 + Math.floor(r() * 90);
      out += wrapPoint(x, y, (px, py) => `<rect x="${px - w / 2}" y="${py - h / 2}" width="${w}" height="${h}" rx="1" fill="rgb(${tone},${tone},${tone})" opacity=".45"/>`);
    }
    return out;
  };
  return tilePattern('bark', { background: '#f5f5f5', draw });
}

function leaf() {
  const color = rng('leaf-color');
  const bump = rng('leaf-bump');
  const draw = (isBump) => {
    const r = isBump ? bump : color;
    let out = '';
    for (let i = 0; i < 115; i++) {
      const x = r() * size;
      const y = r() * size;
      const rx = 3 + r() * 7;
      const ry = 5 + r() * 12;
      const angle = Math.floor(r() * 360);
      const tone = isBump ? 75 + Math.floor(r() * 120) : 205 + Math.floor(r() * 48);
      out += wrapPoint(x, y, (px, py) => `<ellipse cx="${px}" cy="${py}" rx="${rx}" ry="${ry}" transform="rotate(${angle} ${px} ${py})" fill="rgb(${tone},${tone},${tone})" opacity=".78"/>`);
    }
    return out;
  };
  return tilePattern('leaf', { background: '#f4f4f4', draw });
}

function rock() {
  const color = rng('rock-color');
  const bump = rng('rock-bump');
  const draw = (isBump) => {
    const r = isBump ? bump : color;
    let out = '';
    for (let i = 0; i < 460; i++) {
      const x = r() * size;
      const y = r() * size;
      const s = 0.5 + r() * 2.4;
      const tone = isBump ? 75 + Math.floor(r() * 100) : 130 + Math.floor(r() * 105);
      out += wrapPoint(x, y, (px, py) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${s.toFixed(1)}" fill="rgb(${tone},${tone},${tone})" opacity=".52"/>`);
    }
    for (let i = 0; i < 14; i++) {
      const x = r() * size;
      const y = r() * size;
      out += wrapPoint(x, y, (px, py) => `<path d="M${px} ${py}l${(r() * 18 - 9).toFixed(1)} ${(5 + r() * 16).toFixed(1)}l${(r() * 18 - 9).toFixed(1)} ${(4 + r() * 12).toFixed(1)}" fill="none" stroke="${isBump ? '#555' : '#999'}" stroke-opacity=".45" stroke-width="${(0.6 + r()).toFixed(1)}"/>`);
    }
    return out;
  };
  return tilePattern('rock', { background: '#f5f5f5', draw });
}

function cactus() {
  const color = rng('cactus-color');
  const bump = rng('cactus-bump');
  const draw = (isBump) => {
    const r = isBump ? bump : color;
    let out = '';
    for (let x = -4; x < size + 4; x += 10 + r() * 9) {
      const tone = isBump ? 70 + Math.floor(r() * 130) : 170 + Math.floor(r() * 75);
      out += `<path d="M${x} -8v272" stroke="rgb(${tone},${tone},${tone})" stroke-width="${(1 + r() * 2).toFixed(1)}" opacity=".72"/>`;
    }
    for (let i = 0; i < 75; i++) {
      const x = r() * size;
      const y = r() * size;
      const tone = isBump ? '#777' : '#d5d5d5';
      out += wrapPoint(x, y, (px, py) => `<circle cx="${px}" cy="${py}" r="${(0.7 + r() * 1.2).toFixed(1)}" fill="${tone}" opacity=".7"/>`);
    }
    return out;
  };
  return tilePattern('cactus', { background: '#f3f3f3', draw });
}

function ground() {
  const color = rng('ground-color');
  const bump = rng('ground-bump');
  const draw = (isBump) => {
    const r = isBump ? bump : color;
    let out = '';
    for (let i = 0; i < 700; i++) {
      const x = r() * size;
      const y = r() * size;
      const tone = isBump ? 70 + Math.floor(r() * 125) : 150 + Math.floor(r() * 100);
      const w = 0.7 + r() * 2.3;
      out += wrapPoint(x, y, (px, py) => `<path d="M${px} ${py + 2}l${(r() * 3 - 1.5).toFixed(1)} ${(-2 - r() * 3).toFixed(1)}" stroke="rgb(${tone},${tone},${tone})" stroke-width="${w.toFixed(1)}" opacity=".5"/>`);
    }
    return out;
  };
  return tilePattern('ground', { background: '#f7f7f7', draw });
}

function sand() {
  const color = rng('sand-color');
  const bump = rng('sand-bump');
  const draw = (isBump) => {
    const r = isBump ? bump : color;
    let out = '';
    for (let y = -8; y < size + 8; y += 9) {
      out += `<path d="M-8 ${y} C 48 ${y - 4}, 112 ${y + 5}, 264 ${y - 1}" fill="none" stroke="${isBump ? '#999' : '#d4d0c0'}" stroke-opacity=".45" stroke-width="2"/>`;
    }
    for (let i = 0; i < 1100; i++) {
      const x = r() * size;
      const y = r() * size;
      const tone = isBump ? 85 + Math.floor(r() * 105) : 160 + Math.floor(r() * 90);
      out += wrapPoint(x, y, (px, py) => `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(0.35 + r() * 1.2).toFixed(1)}" fill="rgb(${tone},${tone},${tone})" opacity=".52"/>`);
    }
    return out;
  };
  return tilePattern('sand', { background: '#f7f4ec', draw });
}

function water() {
  const color = rng('water-color');
  const bump = rng('water-bump');
  const draw = (isBump) => {
    const r = isBump ? bump : color;
    let out = '';
    for (let i = 0; i < 80; i++) {
      const x = r() * size;
      const y = r() * size;
      const tone = isBump ? 80 + Math.floor(r() * 120) : 175 + Math.floor(r() * 75);
      out += wrapPoint(x, y, (px, py) => `<path d="M${px} ${py}c12 -8 24 8 36 0s24 8 36 0" fill="none" stroke="rgb(${tone},${tone},${tone})" stroke-opacity=".55" stroke-width="${(0.8 + r() * 2).toFixed(1)}"/>`);
    }
    for (let i = 0; i < 180; i++) {
      const x = r() * size;
      const y = r() * size;
      out += wrapPoint(x, y, (px, py) => `<ellipse cx="${px}" cy="${py}" rx="${(1 + r() * 3).toFixed(1)}" ry="${(0.4 + r()).toFixed(1)}" fill="${isBump ? '#aaa' : '#fff'}" opacity=".45"/>`);
    }
    return out;
  };
  return tilePattern('water', { background: '#e8f6fa', draw });
}

const generated = { ...bark(), ...leaf(), ...rock(), ...cactus(), ...ground(), ...sand(), ...water() };
const manifest = {
  version: 1,
  format: 'svg',
  size,
  textures: {},
};

await mkdir(outputDir, { recursive: true });
for (const [key, source] of Object.entries(generated)) {
  const filename = `${key}.svg`;
  await writeFile(resolve(outputDir, filename), `${source}\n`, 'utf8');
  const [name, channel] = key.split('-');
  manifest.textures[name] ||= {};
  manifest.textures[name][channel === 'color' ? 'map' : 'bump'] = `/generated/textures/${filename}`;
}
await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`Generated ${Object.keys(generated).length} SVG textures in ${dirname(resolve(outputDir, 'manifest.json'))}`);
