// World streaming (docs section 3): infinite map split into CHUNK_SIZE x CHUNK_SIZE
// chunks, only chunks within RADIUS of the player are kept in memory.
// Ground = 1 merged Mesh per chunk (vertex colors by biome).
// Vegetation = global InstancedMesh pools rebuilt deterministically whenever the
// visible chunk set changes (seed + chunk key => stable placement, no popping).

import * as THREE from 'three';
import { BRIDGES } from '../config.js';
import { obstacles } from '../utils.js';
import { rngFromString } from './noise.js';
import { getGroundBump, getGroundTexture } from './textures.js';
import {
  createVegetationKit,
  PALETTES,
  placeBroadleaf,
  placeBush,
  placeCactus,
  placePalm,
  placePine,
  placeRock,
} from './presets.js';
import {
  BIOMES,
  GEN,
  biomeGroundColor,
  findSpawn,
  getBiome,
  getSeed,
  initProcedural,
  proceduralGroundHeight,
  riverXAt,
} from './procedural.js';

export const CHUNK_SIZE = 16;
export const CHUNK_SEG = 16;
export const CHUNK_RADIUS = 2; // (2*R+1)^2 = 25 chunks ~ 80x80 units visible

const POOL = {
  trees: 800,
  crowns: 1600, // pine cones + round canopies + coconut blobs share nothing; split below
  palms: 4000,
  bushes: 900,
  cacti: 450,
  rocks: 1000,
};

const rand = (rng, a, b) => a + rng() * (b - a);

const keyOf = (cx, cz) => `${cx},${cz}`;

export function createWorldManager(scene, seedStr) {
  if (seedStr) initProcedural(seedStr);
  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    // Micro grain tiled per chunk (near-white => multiplies biome colors).
    map: getGroundTexture(),
    bumpMap: getGroundBump(),
    bumpScale: 0.06,
    flatShading: true,
    roughness: 1,
  });
  const groundChunks = new Map(); // key -> Mesh

  // ---- Global vegetation pools (one draw call each, textured via presets) ----
  const kit = createVegetationKit();
  const trunkMesh = new THREE.InstancedMesh(kit.geometries.trunk, kit.materials.trunk, POOL.trees);
  const pineMesh = new THREE.InstancedMesh(kit.geometries.pine, kit.materials.pine, POOL.crowns);
  const blobMesh = new THREE.InstancedMesh(kit.geometries.blob, kit.materials.blob, POOL.crowns);
  const palmMesh = new THREE.InstancedMesh(kit.geometries.palmLeaf, kit.materials.palmLeaf, POOL.palms);
  const bushMesh = new THREE.InstancedMesh(kit.geometries.bush, kit.materials.bush, POOL.bushes);
  const cactusMesh = new THREE.InstancedMesh(kit.geometries.cactus, kit.materials.cactus, POOL.cacti);
  const rockMesh = new THREE.InstancedMesh(kit.geometries.rock, kit.materials.rock, POOL.rocks);
  const meshes = { trunk: trunkMesh, pine: pineMesh, blob: blobMesh, palm: palmMesh, bush: bushMesh, cactus: cactusMesh, rock: rockMesh };
  const pools = [trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh, cactusMesh, rockMesh];
  for (const m of pools) {
    // Perf: vegetation casts onto the ground but never receives — receiving
    // doubles the shadow-sampling cost on every instanced fragment, and the
    // flat-shaded look hides the difference.
    m.castShadow = true;
    m.receiveShadow = false;
    m.frustumCulled = false; // instances span the whole visible area
    scene.add(m);
  }

  let spawn = { x: 4.5, z: 2, y: 0 };
  let visibleKey = '';
  let bridgePts = [];

  function refreshBridges() {
    bridgePts = BRIDGES.map((bz) => ({ x: riverXAt(bz), z: bz }));
  }

  function buildGroundChunk(cx, cz) {
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_SEG, CHUNK_SEG);
    geo.rotateX(-Math.PI / 2);
    const centerX = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
    const centerZ = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
    geo.translate(centerX, 0, centerZ);
    const pos = geo.attributes.position;
    const rng = rngFromString(`${getSeed()}|color|${cx},${cz}`);
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, proceduralGroundHeight(x, z));
      const c = biomeGroundColor(getBiome(x, z), rng);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = true;
    return mesh;
  }

  function nearBridge(x, z) {
    return bridgePts.some((b) => Math.hypot(x - b.x, z - b.z) < 3.2);
  }

  function collectChunk(cx, cz, bucket, spawnPt) {
    const rng = rngFromString(`${getSeed()}|veg|${cx},${cz}`);
    const TRIES = 30;
    for (let t = 0; t < TRIES; t++) {
      const x = cx * CHUNK_SIZE + rng() * CHUNK_SIZE;
      const z = cz * CHUNK_SIZE + rng() * CHUNK_SIZE;
      const biome = getBiome(x, z);
      if (biome === BIOMES.RIVER) continue;
      if (Math.hypot(x - spawnPt.x, z - spawnPt.z) < 4.5) continue;
      if (nearBridge(x, z)) continue;
      const y = proceduralGroundHeight(x, z);
      const roll = rng();

      // All shapes come from static presets (see ./presets.js) — same
      // densities as before, now with textured materials.
      if (biome === BIOMES.JUNGLE) {
        if (roll < 0.42 && bucket.ti < POOL.trees) {
          const s = rand(rng, 0.8, 1.5);
          const kind = rng();
          if (kind < 0.45 && bucket.pi + 2 <= POOL.crowns) {
            placePine(meshes, bucket, obstacles, x, y, z, s, rng);
          } else if (kind < 0.8 && bucket.bi + 2 <= POOL.crowns) {
            placeBroadleaf(meshes, bucket, obstacles, x, y, z, s, rng);
          } else if (bucket.palmi + 5 < POOL.palms && bucket.bi + 1 <= POOL.crowns) {
            placePalm(meshes, bucket, obstacles, x, y, z, s, rng);
          }
        } else if (roll < 0.62 && bucket.bu < POOL.bushes) {
          placeBush(meshes, bucket, x, y, z, rand(rng, 0.6, 1.4), rng);
        } else if (roll < 0.7 && bucket.ri < POOL.rocks) {
          placeRock(meshes, bucket, obstacles, x, y, z, rand(rng, 0.4, 0.9), rng);
        }
      } else if (biome === BIOMES.DESERT) {
        if (roll < 0.3 && bucket.ci < POOL.cacti) {
          placeCactus(meshes, bucket, obstacles, x, y, z, rand(rng, 0.7, 1.4), rng);
        } else if (roll < 0.45 && bucket.ri < POOL.rocks) {
          placeRock(meshes, bucket, obstacles, x, y, z, rand(rng, 0.5, 1.1), rng, 0xc2a06b);
        } else if (roll < 0.55 && bucket.bu < POOL.bushes) {
          placeBush(meshes, bucket, x, y, z, rand(rng, 0.5, 0.9), rng, PALETTES.dryBush);
        }
      } else if (biome === BIOMES.MOUNTAIN || biome === BIOMES.SNOW) {
        const snowy = biome === BIOMES.SNOW;
        if (roll < 0.34 && bucket.ti < POOL.trees && bucket.pi + 2 < POOL.crowns) {
          placePine(meshes, bucket, obstacles, x, y, z, rand(rng, 0.7, 1.2), rng,
            snowy ? PALETTES.snowPine : PALETTES.pine);
        } else if (roll < 0.6 && bucket.ri < POOL.rocks) {
          placeRock(meshes, bucket, obstacles, x, y, z, rand(rng, 0.6, 1.6), rng,
            snowy ? 0xb9c2c9 : 0x7d848b);
        }
      } else {
        // BEACH: sparse palms + shells (rocks tinted sand)
        if (roll < 0.12 && bucket.ri < POOL.rocks) {
          placeRock(meshes, bucket, obstacles, x, y, z, rand(rng, 0.3, 0.6), rng, 0xd9c9a3);
        }
      }
    }
  }

  function rebuildVegetation(cells) {
    obstacles.length = 0;
    const bucket = { ti: 0, pi: 0, bi: 0, palmi: 0, bu: 0, ci: 0, ri: 0 };
    // Stable order => stable world for the same seed.
    const sorted = [...cells].sort();
    for (const key of sorted) {
      const [cx, cz] = key.split(',').map(Number);
      collectChunk(cx, cz, bucket, spawn);
    }
    trunkMesh.count = bucket.ti;
    pineMesh.count = bucket.pi;
    blobMesh.count = bucket.bi;
    palmMesh.count = bucket.palmi;
    bushMesh.count = bucket.bu;
    cactusMesh.count = bucket.ci;
    rockMesh.count = bucket.ri;
    for (const m of pools) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  function ensureAround(px, pz) {
    const ccx = Math.floor(px / CHUNK_SIZE);
    const ccz = Math.floor(pz / CHUNK_SIZE);
    // Perf: cheap string check first — avoids allocating a 25-entry Set plus
    // key strings on every frame when the player hasn't crossed a chunk.
    const wantKey = `${getSeed()}@${ccx},${ccz}`;
    if (wantKey === visibleKey) return false;
    const want = new Set();
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
        want.add(keyOf(ccx + dx, ccz + dz));
      }
    }
    // Remove far chunks (dispose GPU geometry).
    for (const [key, mesh] of groundChunks) {
      if (!want.has(key)) {
        scene.remove(mesh);
        mesh.geometry.dispose();
        groundChunks.delete(key);
      }
    }
    for (const key of want) {
      if (!groundChunks.has(key)) {
        const [cx, cz] = key.split(',').map(Number);
        const mesh = buildGroundChunk(cx, cz);
        scene.add(mesh);
        groundChunks.set(key, mesh);
      }
    }
    rebuildVegetation(want);
    visibleKey = wantKey;
    return true;
  }

  function regenerate(newSeed, focusX = 0, focusZ = 0) {
    initProcedural(newSeed);
    refreshBridges();
    for (const [, mesh] of groundChunks) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    groundChunks.clear();
    visibleKey = '';
    spawn = findSpawn();
    ensureAround(focusX || spawn.x, focusZ || spawn.z);
    return { ...spawn };
  }

  refreshBridges();
  spawn = findSpawn();

  return {
    update(px, pz) {
      return ensureAround(px, pz);
    },
    regenerate,
    getSpawn: () => ({ ...spawn }),
    getBridgePoints: () => bridgePts.map((b) => ({ ...b })),
    stats: () => ({ chunks: groundChunks.size, seed: getSeed() }),
    dispose() {
      for (const [, mesh] of groundChunks) {
        scene.remove(mesh);
        mesh.geometry.dispose();
      }
      groundChunks.clear();
      for (const m of pools) scene.remove(m);
    },
  };
}

export { GEN as ChunkGen };
