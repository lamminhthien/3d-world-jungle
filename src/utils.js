import * as THREE from 'three';
import { QUALITY } from './core/setup.js';
import { BRIDGES, RIVER_HALF } from './config.js';
import { proceduralGroundHeight, riverDist as procRiverDist, riverXAt } from './world/procedural.js';

// Shared mutable helpers to avoid circular imports.
// `dummy` is reused for all InstancedMesh transforms.
// `obstacles` is filled by the chunk manager and read by movement.
export const dummy = new THREE.Object3D();
export const obstacles = []; // { x, z, r }

export const rand = (a, b) => a + Math.random() * (b - a);

export function flatMat(color, opts = {}) {
  // Low tier (A13 Safari): Lambert + color map only. Drops bump fetches and
  // Standard's roughness/metalness/derivative math on every fragment.
  // Covers player, tents, bridges via this single helper.
  if (QUALITY.low) {
    const { bumpMap: _b, bumpScale: _s, roughness: _r, metalness: _m, ...rest } = opts;
    return new THREE.MeshLambertMaterial({ color, flatShading: true, ...rest });
  }
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.9,
    metalness: 0,
    ...opts,
  });
}

// Procedural ground: stepped terrain carved by the winding river.
// Delegates to world/procedural.js (seeded noise). Safe to call before
// initProcedural — the generator lazily boots with the default seed.
export function groundHeight(x, z) {
  return proceduralGroundHeight(x, z);
}

// Distance from (x, z) to the winding river centre line.
export function riverDist(x, z) {
  return procRiverDist(x, z);
}

// True when (x, z) is on (or right next to) a bridge deck.
export function isOnBridge(x, z) {
  // Backward-compat: old callers passed only z (straight river at x = 0).
  if (z === undefined) {
    const zz = x;
    return BRIDGES.some((bz) => Math.abs(zz - bz) < 1.6);
  }
  return BRIDGES.some((bz) => Math.abs(z - bz) < 1.6 && Math.abs(x - riverXAt(bz)) < RIVER_HALF + 2.5);
}

export function bridgeCenter(bz) {
  return { x: riverXAt(bz), z: bz };
}
