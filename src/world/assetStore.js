// glTF hero mesh cache — Phase 1/2 of docs/realism-upgrade-plan.md §1.3 / §2.3
// Lazily fetches glb files from public/generated/models/, extracts BufferGeometry
// and feeds InstancedMesh pools. Falls back to procedural geometry on failure
// (never breaks seed worlds offline).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const cache = new Map(); // url -> { geometries: Map{name, BufferGeometry}, materials: ... }
let dracoLoader = null;
let gltfLoader = null;

function getLoader() {
  if (gltfLoader) return gltfLoader;
  gltfLoader = new GLTFLoader();
  // Draco optional: only if decoder is present. Hero glbs are small (<2k tris)
  // so we ship uncompressed by default; draco is a progressive enhancement.
  if (typeof document !== 'undefined') {
    try {
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`);
      gltfLoader.setDRACOLoader(dracoLoader);
    } catch { /* draco unavailable — ok */ }
  }
  return gltfLoader;
}

function extractGeometries(gltf) {
  const geos = new Map();
  gltf.scene.traverse((o) => {
    if (o.isMesh && o.geometry) {
      const name = o.name || `mesh_${geos.size}`;
      // Clone so instancing doesn't mutate the cached source
      const geo = o.geometry.clone();
      geos.set(name, geo);
    }
  });
  return geos;
}

/**
 * Load a glb once and cache its geometries.
 * @param {string} url  e.g. `${BASE_URL}generated/models/broadleaf-cluster.glb`
 * @returns {Promise<Map<string, THREE.BufferGeometry>>}
 */
export async function loadGlbGeometries(url) {
  if (cache.has(url)) return cache.get(url).geometries;
  const loader = getLoader();
  try {
    const gltf = await loader.loadAsync(url);
    const geos = extractGeometries(gltf);
    cache.set(url, { gltf, geometries: geos });
    return geos;
  } catch (err) {
    console.warn(`[assetStore] glb load failed for ${url} — falling back to procedural geometry.`, err?.message || err);
    throw err;
  }
}

export function hasCached(url) { return cache.has(url); }

export function getCachedGeometries(url) {
  return cache.get(url)?.geometries || null;
}

export function clearAssetStore() {
  for (const { gltf, geometries } of cache.values()) {
    for (const geo of geometries.values()) geo.dispose?.();
    // gltf scene disposal is handled by caller if needed
  }
  cache.clear();
}

// Preload a set of hero models (lazy, Promise.allSettled so offline never blocks).
export async function preloadModels(urls = []) {
  const results = await Promise.allSettled(urls.map((u) => loadGlbGeometries(u)));
  const loaded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  return { loaded, failed };
}
