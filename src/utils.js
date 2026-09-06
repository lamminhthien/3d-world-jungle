import * as THREE from 'three';
import { BRIDGES, RIVER_HALF } from './config.js';

// Shared mutable helpers to avoid circular imports.
// `dummy` is reused for all InstancedMesh transforms.
// `obstacles` is filled by rocks/trees and read by movement.
export const dummy = new THREE.Object3D();
export const obstacles = []; // { x, z, r }

export const rand = (a, b) => a + Math.random() * (b - a);

export function flatMat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    flatShading: true,
    roughness: 0.9,
    metalness: 0,
    ...opts,
  });
}

// River banks step down toward the water, creating natural stone tiers.
export function groundHeight(x, z) {
  const ax = Math.abs(x);
  if (ax < RIVER_HALF) return -0.55;
  if (ax < 4.6) return -0.25;
  if (ax < 6.2) return 0.05;
  return 0;
}

export function isOnBridge(z) {
  return BRIDGES.some((bz) => Math.abs(z - bz) < 1.6);
}
