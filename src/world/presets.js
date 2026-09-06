// Static reusable vegetation presets + textured materials.
// ---------------------------------------------------------
// Before: tree/rock shapes were hard-coded inside chunks.js (and a dead
// trees.js). To add a new look you had to edit the generator.
// After: every look lives here as a STATIC PRESET object. The chunk
// generator, the legacy trees.js scatter, or a single preview Group all
// call the same place*() helpers, so looks stay consistent.
//
// Presets are data (id, kind, palette, scale range, collision) +
// small placer functions. Textures come from ./textures.js (procedural
// canvas, no image assets) and multiply with instanceColor tints.

import * as THREE from 'three';
import { dummy } from '../utils.js';
import { getBarkTexture, getCactusTexture, getLeafTexture, getRockTexture } from './textures.js';

// ---- Palettes (kept identical to the old inline values) ----
export const PALETTES = {
  pine: [0x2f9e44, 0x2b8a3e, 0x37b24d],
  snowPine: [0xdfeee8, 0xcfe3d8, 0x9fc3b4],
  broadleaf: [0x40b34f, 0x51cf66, 0x2f9e44, 0x69db7c],
  palmLeaf: 0x37b24d,
  bush: 0x69b93e,
  dryBush: 0xb5a642,
  trunk: 0x8a5a3b,
  coconut: 0x5c3d24,
  cactus: 0x2f9e44,
};

// ---- Static preset catalog: pick by id for hand placement / UI ----
export const VEGETATION_PRESETS = [
  { id: 'pine-tall',     kind: 'pine',      sMin: 0.8, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle', 'mountain'] },
  { id: 'pine-snow',     kind: 'pineSnow',  sMin: 0.7, sMax: 1.2,  collisionR: 0.55, biomes: ['snow', 'mountain'] },
  { id: 'broadleaf',     kind: 'broadleaf', sMin: 0.8, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle'] },
  { id: 'palm',          kind: 'palm',      sMin: 0.8, sMax: 1.5,  collisionR: 0.55, biomes: ['jungle', 'beach'] },
  { id: 'bush',          kind: 'bush',      sMin: 0.6, sMax: 1.4,  collisionR: 0,    biomes: ['jungle'] },
  { id: 'dry-bush',      kind: 'dryBush',   sMin: 0.5, sMax: 0.9,  collisionR: 0,    biomes: ['desert'] },
  { id: 'cactus',        kind: 'cactus',    sMin: 0.7, sMax: 1.4,  collisionR: 0.5,  biomes: ['desert'] },
  { id: 'rock',          kind: 'rock',      sMin: 0.4, sMax: 1.6,  collisionR: 0.8,  biomes: ['jungle', 'desert', 'mountain', 'snow'] },
];

export const presetById = (id) => VEGETATION_PRESETS.find((p) => p.id === id);

// ---- Textured materials (one per pool, shared by all instances) ----
function texturedMat(color, map, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color, map, flatShading: true, roughness: 0.95, metalness: 0, ...extra,
  });
}

export function createVegetationKit() {
  const geometries = {
    trunk: new THREE.CylinderGeometry(0.18, 0.3, 1.4, 6),
    pine: new THREE.ConeGeometry(1.25, 2.6, 7),
    blob: new THREE.IcosahedronGeometry(1.25, 0),
    palmLeaf: new THREE.ConeGeometry(0.4, 2.6, 4),
    bush: new THREE.IcosahedronGeometry(0.7, 0),
    cactus: new THREE.CylinderGeometry(0.32, 0.4, 2.4, 7),
    rock: new THREE.DodecahedronGeometry(1, 0),
  };
  const materials = {
    trunk: texturedMat(0xffffff, getBarkTexture()),
    pine: texturedMat(0xffffff, getLeafTexture()),
    blob: texturedMat(0xffffff, getLeafTexture()),
    palmLeaf: texturedMat(0xffffff, getLeafTexture(), { side: THREE.DoubleSide }),
    bush: texturedMat(0xffffff, getLeafTexture()),
    cactus: texturedMat(0xffffff, getCactusTexture()),
    rock: texturedMat(0xffffff, getRockTexture(), { roughness: 1 }),
  };
  return { geometries, materials };
}

// ---- Small helpers (rng-injected so chunk gen stays deterministic) ----
const rand = (rng, a, b) => a + rng() * (b - a);
const pick = (rng, arr) => arr[(rng() * arr.length) | 0];
const _col = new THREE.Color(); // shared scratch; setColorAt copies values

function setTrunk(meshes, bucket, obstacles, x, y, z, s, rng, tint = PALETTES.trunk) {
  meshes.trunk.setColorAt(bucket.ti, _col.set(tint).offsetHSL(0, 0, rand(rng, -0.03, 0.03)));
  dummy.position.set(x, y, z);
  dummy.rotation.set(rand(rng, -0.08, 0.08), rand(rng, 0, 6.28), rand(rng, -0.08, 0.08));
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  meshes.trunk.setMatrixAt(bucket.ti++, dummy.matrix);
  obstacles.push({ x, z, r: 0.55 * s });
  return bucket.ti - 1; // trunk instance index (palms overwrite it taller)
}

// ---- Placers: one per preset kind. All reuse trunk/crown pools. ----
export function placePine(meshes, bucket, obstacles, x, y, z, s, rng, palette = PALETTES.pine) {
  const ti = setTrunk(meshes, bucket, obstacles, x, y + 0.7 * s, z, s, rng);
  for (let k = 0; k < 2; k++) {
    meshes.pine.setColorAt(bucket.pi, _col.set(pick(rng, palette)));
    dummy.position.set(x, y + (1.9 + k * 1.15) * s, z);
    dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
    dummy.scale.setScalar(s * (k === 0 ? 1 : 0.68));
    dummy.updateMatrix();
    meshes.pine.setMatrixAt(bucket.pi++, dummy.matrix);
  }
  return ti;
}

export function placeBroadleaf(meshes, bucket, obstacles, x, y, z, s, rng) {
  setTrunk(meshes, bucket, obstacles, x, y + 0.7 * s, z, s, rng);
  for (let k = 0; k < 2; k++) {
    meshes.blob.setColorAt(bucket.bi, _col.set(pick(rng, PALETTES.broadleaf)));
    dummy.position.set(x + rand(rng, -0.4, 0.4) * s, y + (2.1 + k * 0.8) * s, z + rand(rng, -0.4, 0.4) * s);
    dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
    dummy.scale.set(s * rand(rng, 0.9, 1.2), s * rand(rng, 0.8, 1), s * rand(rng, 0.9, 1.2));
    dummy.updateMatrix();
    meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
  }
}

export function placePalm(meshes, bucket, obstacles, x, y, z, s, rng) {
  const ti = setTrunk(meshes, bucket, obstacles, x, y + 0.7 * s, z, s, rng);
  // taller, slightly tilted trunk for palms (overwrites previous matrix)
  dummy.position.set(x, y + 1.1 * s, z);
  dummy.rotation.set(0.15, rand(rng, 0, 6.28), 0.12);
  dummy.scale.setScalar(s * 1.15);
  dummy.updateMatrix();
  meshes.trunk.setMatrixAt(ti, dummy.matrix);
  const topY = y + 2.2 * s;
  const topX = x + 0.25;
  const topZ = z + 0.2;
  for (let k = 0; k < 5; k++) {
    meshes.palm.setColorAt(bucket.palmi, _col.set(PALETTES.palmLeaf).offsetHSL(0, 0, rand(rng, -0.03, 0.03)));
    const a = (k / 5) * Math.PI * 2;
    dummy.position.set(topX + Math.cos(a) * 1.05 * s, topY + rand(rng, -0.15, 0.25), topZ + Math.sin(a) * 1.05 * s);
    dummy.rotation.set(Math.PI / 2.3, 0, -a + Math.PI / 2);
    dummy.scale.set(1, 1, 0.28);
    dummy.updateMatrix();
    meshes.palm.setMatrixAt(bucket.palmi++, dummy.matrix);
  }
  // coconut cluster
  meshes.blob.setColorAt(bucket.bi, _col.set(PALETTES.coconut));
  dummy.position.set(topX, topY - 0.15, topZ);
  dummy.rotation.set(0, 0, 0);
  dummy.scale.setScalar(0.28 * s);
  dummy.updateMatrix();
  meshes.blob.setMatrixAt(bucket.bi++, dummy.matrix);
}

export function placeBush(meshes, bucket, x, y, z, s, rng, tint = PALETTES.bush) {
  meshes.bush.setColorAt(bucket.bu, _col.set(tint).offsetHSL(rand(rng, -0.02, 0.02), 0, rand(rng, -0.04, 0.04)));
  dummy.position.set(x, y + 0.3, z);
  dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
  dummy.scale.setScalar(s);
  dummy.updateMatrix();
  meshes.bush.setMatrixAt(bucket.bu++, dummy.matrix);
}

export function placeCactus(meshes, bucket, obstacles, x, y, z, s, rng) {
  meshes.cactus.setColorAt(bucket.ci, _col.set(PALETTES.cactus).offsetHSL(rand(rng, -0.02, 0.02), 0.05, rand(rng, -0.03, 0.03)));
  dummy.position.set(x, y + 1.1 * s, z);
  dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  meshes.cactus.setMatrixAt(bucket.ci++, dummy.matrix);
  obstacles.push({ x, z, r: 0.5 * s });
}

export function placeRock(meshes, bucket, obstacles, x, y, z, s, rng, tint = 0x9aa0a3, collide = false) {
  meshes.rock.setColorAt(bucket.ri, _col.set(tint).offsetHSL(0, -0.05, rand(rng, -0.05, 0.02)));
  dummy.position.set(x, y + s * 0.25, z);
  dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), rand(rng, 0, 3));
  dummy.scale.set(s * rand(rng, 0.8, 1.3), s * rand(rng, 0.6, 1), s * rand(rng, 0.8, 1.3));
  dummy.updateMatrix();
  meshes.rock.setMatrixAt(bucket.ri++, dummy.matrix);
  if (collide || s > 0.9) obstacles.push({ x, z, r: s * 0.8 });
}

// ---- Non-instanced single tree (hero trees, previews, tests) ----
// Returns a THREE.Group using the same shapes/palette as the instanced pools.
export function buildPresetGroup(presetId, { materials } = {}) {
  const preset = presetById(presetId) ?? presetById('broadleaf');
  const kit = createVegetationKit();
  const mats = materials ?? kit.materials;
  const geos = kit.geometries;
  const g = new THREE.Group();
  const add = (geo, mat, color, pos, rot, scale) => {
    const m = new THREE.Mesh(geo, mat.clone());
    m.material.color.set(color);
    m.position.set(...pos);
    m.rotation.set(...rot);
    m.scale.set(...scale);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const s = 1;
  if (preset.kind === 'pine' || preset.kind === 'pineSnow') {
    const pal = preset.kind === 'pineSnow' ? PALETTES.snowPine : PALETTES.pine;
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 0.7, 0], [0, 0, 0], [s, s, s]);
    add(geos.pine, mats.pine, pal[0], [0, 1.9, 0], [0, 0, 0], [s, s, s]);
    add(geos.pine, mats.pine, pal[1], [0, 3.05, 0], [0, 1, 0], [0.68, 0.68, 0.68]);
  } else if (preset.kind === 'palm') {
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 1.1, 0], [0.15, 0, 0.12], [1.15, 1.15, 1.15]);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      add(geos.palmLeaf, mats.palmLeaf, PALETTES.palmLeaf,
        [0.25 + Math.cos(a) * 1.05, 2.2, 0.2 + Math.sin(a) * 1.05],
        [Math.PI / 2.3, 0, -a + Math.PI / 2], [1, 1, 0.28]);
    }
    add(geos.blob, mats.blob, PALETTES.coconut, [0.25, 2.05, 0.2], [0, 0, 0], [0.28, 0.28, 0.28]);
  } else if (preset.kind === 'cactus') {
    add(geos.cactus, mats.cactus, PALETTES.cactus, [0, 1.1, 0], [0, 0, 0], [s, s, s]);
  } else if (preset.kind === 'rock' || preset.kind === 'bush' || preset.kind === 'dryBush') {
    const geo = preset.kind === 'rock' ? geos.rock : geos.bush;
    const mat = preset.kind === 'rock' ? mats.rock : mats.bush;
    const col = preset.kind === 'rock' ? 0x9aa0a3 : preset.kind === 'dryBush' ? PALETTES.dryBush : PALETTES.bush;
    add(geo, mat, col, [0, 0.3, 0], [0, 0, 0], [s, s * 0.8, s]);
  } else {
    add(geos.trunk, mats.trunk, PALETTES.trunk, [0, 0.7, 0], [0, 0, 0], [s, s, s]);
    add(geos.blob, mats.blob, PALETTES.broadleaf[0], [0, 2.1, 0], [0, 0, 0], [s, s, s]);
    add(geos.blob, mats.blob, PALETTES.broadleaf[1], [0.3, 2.9, 0.2], [1, 1, 0], [s, s * 0.9, s]);
  }
  g.userData.presetId = preset.id;
  return g;
}
