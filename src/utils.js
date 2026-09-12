import * as THREE from 'three';
import { QUALITY } from './core/setup.js';
import { BRIDGES, RIVER_HALF } from './config.js';
import { proceduralGroundHeight, riverDist as procRiverDist, riverXAt } from './world/procedural.js';

// Shared mutable helpers to avoid circular imports.
// `dummy` is reused for all InstancedMesh transforms.
// `obstacles` is filled by the chunk manager and read by movement.
export const dummy = new THREE.Object3D();
export const obstacles = []; // { x, z, r }

// Perf: spatial hash over obstacles so per-frame collision is O(nearby)
// instead of O(all). Cell size 4u — typical obstacle radius <1.2u, player
// radius 0.45u, so a 3x3 cell query covers all possible contacts.
// Rebuilt incrementally via markObstaclesDirty() after chunk rebuilds.
const _grid = new Map(); // int key -> obstacle[]
const _GRID_CELL = 4;
let _gridDirty = true;
function _gridKey(cx, cz) { return cx * 4096 + cz; }
function _cellOf(x) { return Math.floor(x / _GRID_CELL); }

function _rebuildGrid() {
  _grid.clear();
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const k = _gridKey(_cellOf(o.x), _cellOf(o.z));
    let cell = _grid.get(k);
    if (!cell) { cell = []; _grid.set(k, cell); }
    cell.push(o);
  }
  _gridDirty = false;
}

/** Call after mutating `obstacles` in bulk (chunk rebuild). Cheap flag. */
export function markObstaclesDirty() { _gridDirty = true; }

/**
 * Resolve circle collision at (nx,nz) against nearby obstacles only.
 * Mutates nothing; returns {x, z} via out param to avoid allocs.
 * Player radius defaults to 0.45 (matches main.js / autoPlay).
 */
export function resolveObstacleCollision(nx, nz, playerR = 0.45, out = null) {
  if (_gridDirty) _rebuildGrid();
  const ccx = _cellOf(nx);
  const ccz = _cellOf(nz);
  for (let gx = ccx - 1; gx <= ccx + 1; gx++) {
    for (let gz = ccz - 1; gz <= ccz + 1; gz++) {
      const cell = _grid.get(_gridKey(gx, gz));
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        const dx = nx - o.x;
        const dz = nz - o.z;
        const min = o.r + playerR;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = o.x + (dx / d) * min;
          nz = o.z + (dz / d) * min;
        }
      }
    }
  }
  if (out) { out.x = nx; out.z = nz; return out; }
  return { x: nx, z: nz };
}

/** True if any obstacle (inflated by clearance) is near (px,pz). */
export function isObstacleNear(px, pz, clearance = 1.5) {
  if (_gridDirty) _rebuildGrid();
  const ccx = _cellOf(px);
  const ccz = _cellOf(pz);
  for (let gx = ccx - 1; gx <= ccx + 1; gx++) {
    for (let gz = ccz - 1; gz <= ccz + 1; gz++) {
      const cell = _grid.get(_gridKey(gx, gz));
      if (!cell) continue;
      for (let i = 0; i < cell.length; i++) {
        const o = cell[i];
        const odx = px - o.x;
        const odz = pz - o.z;
        const c = o.r + clearance;
        if (odx * odx + odz * odz < c * c) return o;
      }
    }
  }
  return null;
}

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
