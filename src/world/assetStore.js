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
      // Normalize: Kenney centers pivots at origin; bake vertex colors if missing
      // so instanceColor tints still work (white vertex color = neutral).
      if (!geo.attributes.color) {
        const c = new Float32Array(geo.attributes.position.count * 3).fill(1);
        geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
      }
      geos.set(name, geo);
    }
  });
  return geos;
}

function mergeGeometries(geos) {
  // Merge all sub-meshes of a single GLB into one BufferGeometry for InstancedMesh
  if (geos.size === 1) return [...geos.values()][0].clone();
  const list = [...geos.values()];
  // Simple merge via BufferGeometryUtils-like manual concat (no extra dep)
  let vTotal = 0, iTotal = 0;
  for (const g of list) { vTotal += g.attributes.position.count; iTotal += (g.index ? g.index.count : 0); }
  const merged = new THREE.BufferGeometry();
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = list[0].attributes.uv ? new Float32Array(vTotal * 2) : null;
  const col = new Float32Array(vTotal * 3);
  const idx = iTotal ? new Uint32Array(iTotal) : null;
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal?.array;
    const u = g.attributes.uv?.array;
    const c = g.attributes.color?.array;
    pos.set(p, vo * 3);
    if (n) nor.set(n, vo * 3); else {
      // compute normals later if missing
    }
    if (u && uv) uv.set(u, vo * 2);
    if (c) col.set(c, vo * 3); else col.fill(1, vo * 3, (vo + g.attributes.position.count) * 3);
    if (g.index && idx) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) idx[io + i] = vo + src[i];
      io += src.length;
    }
    vo += g.attributes.position.count;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (idx) merged.setIndex(new THREE.BufferAttribute(idx, 1));
  merged.computeVertexNormals();
  return merged;
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

// Full-pipeline helper: load a GLB and return a SINGLE merged BufferGeometry
// ready for InstancedMesh (1 draw call per species). Falls back to null on error.
export async function loadMergedGeometry(url) {
  try {
    const geos = await loadGlbGeometries(url);
    return mergeGeometries(geos);
  } catch {
    return null;
  }
}

// Preload + merge in one call, returns Map<url, BufferGeometry>
export async function preloadMergedGeometries(urls = []) {
  const map = new Map();
  const results = await Promise.allSettled(urls.map(async (u) => {
    const g = await loadMergedGeometry(u);
    if (g) map.set(u, g);
    return g;
  }));
  const loaded = [...map.values()].length;
  const failed = urls.length - loaded;
  return { map, loaded, failed, results };
}
