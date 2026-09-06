// Seeded PRNG + deterministic value-noise (Perlin/Simplex-like) for procedural worlds.
// Zero-dependency: same seed string => same world on every machine.

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// RNG scoped to a string (e.g. seed + chunk key) for deterministic placement.
export function rngFromString(str) {
  const seedFn = xmur3(str);
  return mulberry32(seedFn());
}

function makePermutation(random) {
  const p = new Uint8Array(512);
  const base = [...Array(256).keys()];
  for (let i = base.length - 1; i > 0; i--) {
    const j = (random() * (i + 1)) | 0;
    [base[i], base[j]] = [base[j], base[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  return p;
}

const fade = (t) => t * t * (3 - 2 * t);
function grad2(hash, x, y) {
  // 8 gradient directions.
  switch (hash & 7) {
    case 0: return x + y;
    case 1: return x - y;
    case 2: return -x + y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
}

// Returns a 2D gradient noise function in roughly [-1, 1].
export function makeNoise2D(seedStr) {
  const random = rngFromString(`noise:${seedStr}`);
  const perm = makePermutation(random);
  return (x, y) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X + 1] + Y];
    const bb = perm[perm[X + 1] + Y + 1];
    const x1 = grad2(aa, xf, yf) + (grad2(ba, xf - 1, yf) - grad2(aa, xf, yf)) * u;
    const x2 = grad2(ab, xf, yf - 1) + (grad2(bb, xf - 1, yf - 1) - grad2(ab, xf, yf - 1)) * u;
    return (x1 + (x2 - x1) * v) * 0.7071; // ~[-1, 1]
  };
}

// Fractal Brownian motion helper.
export function fbmFactory(noise2D, octaves = 4, lacunarity = 2, gain = 0.5) {
  return (x, y) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2D(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm; // ~[-1, 1]
  };
}

export function randomSeedString(prefix = 'FOREST') {
  return `${prefix}_${Math.floor(Math.random() * 9000 + 1000)}`;
}
