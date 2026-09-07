// World streaming (docs section 3): infinite map split into CHUNK_SIZE x CHUNK_SIZE
// chunks, only chunks within RADIUS of the player are kept in memory.
// Ground = 1 merged Mesh per chunk (vertex colors by biome).
// Vegetation = global InstancedMesh pools rebuilt deterministically whenever the
// visible chunk set changes (seed + chunk key => stable placement, no popping).

import * as THREE from 'three';
import { BRIDGES, VEGETATION } from '../config.js';
import { QUALITY } from '../core/setup.js';
import { obstacles } from '../utils.js';
import { rngFromString } from './noise.js';
import { getGroundBump, getGroundTexture } from './textures.js';
import { attachWindToKit } from './wind.js';
import {
  createVegetationKit,
  PALETTES,
  PALM_FRONDS,
  placeBanana,
  placeBlossomTree,
  placeBroadleaf,
  placeBush,
  placeCactus,
  placeFloweringBush,
  placeFlowerPatch,
  placeFruitTree,
  placeGoldenTree,
  placeGrass,
  placeKapok,
  placePalm,
  placePine,
  placeRainbowTree,
  placeReed,
  placeRock,
} from './presets.js';
import {
  BIOMES,
  GEN,
  SURFACES,
  biomeGroundColor,
  findSpawn,
  getSeed,
  initProcedural,
  moistureAt,
  riverXAt,
  sampleFootprint,
  sampleGround,
} from './procedural.js';

export const CHUNK_SIZE = 16;
// P0 tessellation: desktop samples the stepped terrain at 0.66m (risers stop
// aliasing); low tier keeps 1.0m sampling (fill-rate bound). 24²×2 = 1152
// tris/chunk (+16k total on desktop, fine without extra draw calls).
export const CHUNK_SEG = QUALITY.low ? 16 : 24;
export const CHUNK_RADIUS = 2; // (2*R+1)^2 = 25 chunks ~ 80x80 units visible

const POOL = {
  // Cartoon-realistic trees cost more instances per tree now (branches reuse
  // the trunk pool, 3-puff canopies, buttress roots): size trunks/crowns for
  // ~30 tries/chunk × 25 chunks with headroom.
  trees: QUALITY.low ? 1800 : 3200,
  crowns: QUALITY.low ? 2600 : 5600, // dense: +2 satellites per tree (Phase 2)
  palms: QUALITY.low ? 3200 : 6400, // 6 low / 8 desktop fronds
  bushes: 900,
  cacti: 450,
  rocks: 1000,
  grass: QUALITY.low ? 900 : 2400, // P4 fields: 12 tris each, 1 draw call (was 600/1500)
  reed: QUALITY.low ? 0 : 900, // tall river-bank reed (1.1u) — desktop only
  leafCard: QUALITY.low ? 0 : 3000, // Phase 2 foliage cards (2 tris, alphaTest)
  fruit: QUALITY.low ? 900 : 1600, // mango/orange/apple/banana/coconut orbs
  flowerStem: QUALITY.low ? 900 : 1600,
  flowerHead: QUALITY.low ? 900 : 1600,
};

const rand = (rng, a, b) => a + rng() * (b - a);

const keyOf = (cx, cz) => `${cx},${cz}`;

export function createWorldManager(scene, seedStr) {
  if (seedStr) initProcedural(seedStr);
  // Low tier: Lambert + color map only (no bump fetch, cheaper lighting).
  const groundMat = QUALITY.low
    ? new THREE.MeshLambertMaterial({
      vertexColors: true,
      map: getGroundTexture(),
      flatShading: true,
    })
    : new THREE.MeshStandardMaterial({
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
  // Phase 5: GPU sway (desktop only, low tier no-ops inside attachWindToKit)
  attachWindToKit(kit);
  const trunkMesh = new THREE.InstancedMesh(kit.geometries.trunk, kit.materials.trunk, POOL.trees);
  const pineMesh = new THREE.InstancedMesh(kit.geometries.pine, kit.materials.pine, POOL.crowns);
  const blobMesh = new THREE.InstancedMesh(kit.geometries.blob, kit.materials.blob, POOL.crowns);
  const palmMesh = new THREE.InstancedMesh(kit.geometries.palmLeaf, kit.materials.palmLeaf, POOL.palms);
  const bushMesh = new THREE.InstancedMesh(kit.geometries.bush, kit.materials.bush, POOL.bushes);
  const cactusMesh = new THREE.InstancedMesh(kit.geometries.cactus, kit.materials.cactus, POOL.cacti);
  const rockMesh = new THREE.InstancedMesh(kit.geometries.rock, kit.materials.rock, POOL.rocks);
  const grassMesh = new THREE.InstancedMesh(kit.geometries.grass, kit.materials.grass, POOL.grass);
  const reedMesh = new THREE.InstancedMesh(kit.geometries.reed, kit.materials.reed, Math.max(1, POOL.reed));
  const leafCardMesh = new THREE.InstancedMesh(kit.geometries.leafCard, kit.materials.leafCard, Math.max(1, POOL.leafCard));
  const fruitMesh = new THREE.InstancedMesh(kit.geometries.fruit, kit.materials.fruit, POOL.fruit);
  const flowerStemMesh = new THREE.InstancedMesh(kit.geometries.flowerStem, kit.materials.flowerStem, POOL.flowerStem);
  const flowerHeadMesh = new THREE.InstancedMesh(kit.geometries.flowerHead, kit.materials.flowerHead, POOL.flowerHead);
  const meshes = { trunk: trunkMesh, pine: pineMesh, blob: blobMesh, palm: palmMesh, bush: bushMesh, cactus: cactusMesh, rock: rockMesh, grass: grassMesh, reed: reedMesh, leafCard: leafCardMesh, fruit: fruitMesh, flowerStem: flowerStemMesh, flowerHead: flowerHeadMesh };
  const pools = [trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh, cactusMesh, rockMesh, grassMesh, reedMesh, leafCardMesh, fruitMesh, flowerStemMesh, flowerHeadMesh];
  for (const m of pools) {
    // Perf: vegetation casts onto the ground but never receives — receiving
    // doubles the shadow-sampling cost on every instanced fragment, and the
    // flat-shaded look hides the difference. Low tier: no shadow maps at all,
    // so skip casting too (saves the whole depth pass over ~10k instances).
    m.castShadow = QUALITY.shadowsEnabled;
    m.receiveShadow = false;
    m.frustumCulled = false; // instances span the whole visible area
    scene.add(m);
  }
  // P0 grass: tufts are <0.5u tall — shadows add nothing even on desktop, so
  // never cast (saves depth-pass instances on both tiers).
  grassMesh.castShadow = false;
  reedMesh.castShadow = false;
  leafCardMesh.castShadow = false;
  // Petals + stems are tiny: skip them in the shadow depth pass.
  flowerStemMesh.castShadow = false;
  flowerHeadMesh.castShadow = false;

  let spawn = { x: 4.5, z: 2, y: 0 };
  let visibleKey = '';
  let bridgePts = [];
  // Time-sliced streaming: crossing a chunk border can reveal up to 5 new
  // chunks at once (a full row/column). Building them all synchronously
  // (~9k noise evals/chunk) blocks the main thread ~50-100ms => a visible
  // hitch every ~1.6s while sprinting ("choppy in some time cycle").
  // Instead queue missing chunks and build at most N per frame.
  let pendingBuild = [];
  let pendingWant = null;
  let pendingCenterKey = '';
  const MAX_CHUNK_BUILDS_PER_FRAME = 2;

  function buildOneChunk(key) {
    if (groundChunks.has(key)) return;
    const [cx, cz] = key.split(',').map(Number);
    const mesh = buildGroundChunk(cx, cz);
    scene.add(mesh);
    groundChunks.set(key, mesh);
  }

  function drainQueue(budget) {
    const n = Math.min(budget, pendingBuild.length);
    for (let i = 0; i < n; i++) buildOneChunk(pendingBuild.shift());
    if (pendingBuild.length === 0 && pendingWant) {
      rebuildVegetation(pendingWant);
      visibleKey = pendingCenterKey;
      pendingWant = null;
      pendingCenterKey = '';
    }
  }

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
    // Direct array access: getX/getZ/setY are function calls per vert (~625×
    // per chunk). Raw .array indexing cuts ~3 call overheads per vertex.
    const arr = pos.array;
    for (let i = 0; i < pos.count; i++) {
      const x = arr[i * 3];
      const z = arr[i * 3 + 2];
      // Single noise pass for height+biome (was: proceduralGroundHeight +
      // getBiome = 2x river fbm + 2x height fbm per vert).
      const s = sampleGround(x, z);
      arr[i * 3 + 1] = s.y;
      // P0 banding: altitude stripe + ragged snow edge need x/z/y (integer
      // hash, no extra noise — see procedural.js).
      const c = biomeGroundColor(s.biome, rng, undefined, x, z, s.y);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, groundMat);
    mesh.receiveShadow = true;
    return mesh;
  }

  function nearBridge(x, z) {
    // Squared distance: Math.hypot = sqrt per bridge per try (~1500 sqrts per
    // rebuild). Compare against 3.2² instead.
    for (let i = 0; i < bridgePts.length; i++) {
      const dx = x - bridgePts[i].x;
      const dz = z - bridgePts[i].z;
      if (dx * dx + dz * dz < 10.24) return true;
    }
    return false;
  }

  function collectChunk(cx, cz, bucket, spawnPt) {
    const rng = rngFromString(`${getSeed()}|veg|${cx},${cz}`);
    const TRIES = 30;
    const sx = spawnPt.x;
    const sz = spawnPt.z;
    for (let t = 0; t < TRIES; t++) {
      const x = cx * CHUNK_SIZE + rng() * CHUNK_SIZE;
      const z = cz * CHUNK_SIZE + rng() * CHUNK_SIZE;
      // Single noise pass (was: getBiome + proceduralGroundHeight = ~25 noise
      // evals per try). Also hoists spawn/bridge checks before any placement.
      const s = sampleGround(x, z);
      const biome = s.biome;
      if (biome === BIOMES.RIVER) continue;
      const sdx = x - sx;
      const sdz = z - sz;
      if (sdx * sdx + sdz * sdz < 20.25) continue; // 4.5², no sqrt
      // The village occupies a stable clearing just beyond the spawn camp.
      // Keep procedural vegetation out of it so houses, roads and fields read
      // as one settlement instead of props hidden inside the jungle.
      const vdx = x - (sx + 16);
      const vdz = z - (sz + 14);
      if (vdx * vdx + vdz * vdz < 29 * 29) continue;
      if (nearBridge(x, z)) continue;
      const y = s.y;
      const roll = rng();

      // A point can be soil while the footprint immediately around it is a
      // mountain/snow step. Reject those edge placements so a canopy/trunk
      // cannot visually grow out of a rock shelf.
      const needsSurfaceClearance = (biome === BIOMES.JUNGLE && roll < 0.58)
        || (biome === BIOMES.BEACH && roll < 0.2);
      if (needsSurfaceClearance) {
        const footprint = sampleFootprint(x, z, biome === BIOMES.JUNGLE ? 1.4 : 0.8);
        if (footprint.surfaces.has(SURFACES.ROCK) || footprint.surfaces.has(SURFACES.SNOW) || footprint.surfaces.has(SURFACES.WATER)) continue;
      }

      // All shapes come from static presets (see ./presets.js). Tree density
      // and scale are controlled centrally in config.js so the streamed world
      // and legacy/static previews can be tuned together.
      if (biome === BIOMES.JUNGLE) {
        if (roll < 0.44 * VEGETATION.treeDensity && bucket.ti + 4 <= POOL.trees) {
          const s = rand(rng, 0.8, 1.5) * VEGETATION.treeScale;
          const kind = rng();
          // Canopy tree lottery: classic pine/broadleaf + fruit, blossom,
          // kapok giants, banana clumps, coconut palms + rare rainbow/golden.
          if (kind < 0.2 && bucket.pi + 3 <= POOL.crowns) {
            placePine(meshes, bucket, obstacles, x, y, z, s, rng);
          } else if (kind < 0.36 && bucket.bi + 3 <= POOL.crowns) {
            placeBroadleaf(meshes, bucket, obstacles, x, y, z, s, rng);
          } else if (kind < 0.5 && bucket.bi + 3 <= POOL.crowns && bucket.fri + 7 <= POOL.fruit) {
            placeFruitTree(meshes, bucket, obstacles, x, y, z, s, rng);
          } else if (kind < 0.6 && bucket.bi + 3 <= POOL.crowns && bucket.fhi + 6 <= POOL.flowerHead) {
            placeBlossomTree(meshes, bucket, obstacles, x, y, z, s, rng);
          } else if (kind < 0.64 && bucket.bi + 4 <= POOL.crowns) {
            // Rare rainbow showpiece.
            placeRainbowTree(meshes, bucket, obstacles, x, y, z, rand(rng, 0.9, 1.4) * VEGETATION.treeScale, rng);
          } else if (kind < 0.69 && bucket.bi + 3 <= POOL.crowns) {
            // Rare golden accent.
            placeGoldenTree(meshes, bucket, obstacles, x, y, z, s, rng);
          } else if (kind < 0.74 && bucket.bi + 5 <= POOL.crowns) {
            placeKapok(meshes, bucket, obstacles, x, y, z, rand(rng, 1.0, 1.5) * VEGETATION.treeScale, rng);
          } else if (kind < 0.84 && bucket.palmi + PALM_FRONDS <= POOL.palms && bucket.fri + 3 <= POOL.fruit) {
            placeBanana(meshes, bucket, obstacles, x, y, z, rand(rng, 0.7, 1.2) * VEGETATION.treeScale, rng);
          } else if (bucket.palmi + PALM_FRONDS <= POOL.palms && bucket.fri + 3 <= POOL.fruit) {
            placePalm(meshes, bucket, obstacles, x, y, z, s, rng);
          }
        } else if (roll < 0.58 && bucket.bu < POOL.bushes) {
          // Every second bush blooms: vivid blossoms on the crown.
          if (rng() < 0.5 && bucket.fhi + 8 <= POOL.flowerHead) {
            placeFloweringBush(meshes, bucket, x, y, z, rand(rng, 0.5, 1.0), rng);
          } else {
            placeBush(meshes, bucket, x, y, z, rand(rng, 0.6, 1.4), rng);
          }
        } else if (roll < 0.7 && bucket.fhi + 9 <= POOL.flowerHead && bucket.fsti + 9 <= POOL.flowerStem) {
          placeFlowerPatch(meshes, bucket, x, y, z, rand(rng, 0.7, 1.2), rng);
        } else if (roll < 0.75 && bucket.ri < POOL.rocks) {
          placeRock(meshes, bucket, obstacles, x, y, z, rand(rng, 0.4, 0.9), rng);
        } else if (roll < 0.93) {
          // Meadow mask: moist lowland = denser grass (phase 4)
          const moist = moistureAt(x, z);
          const threshold = moist > 0.65 ? 0.96 : moist < 0.35 ? 0.88 : 0.93;
          if (roll >= threshold) {
            // sparse on dry ridges — skip
          } else if (rng() < 0.2 && bucket.reedi < POOL.reed && POOL.reed > 0 && s.d < 12) {
            // Tall reed near river bank (20% of jungle grass)
            placeReed(meshes, bucket, x, y, z, rand(rng, 0.6, 1.15), rng, PALETTES.grass);
          } else if (bucket.gi < POOL.grass) {
            const tint = rng() < 0.2 ? PALETTES.grassGold : PALETTES.grass;
            placeGrass(meshes, bucket, x, y, z, rand(rng, 0.5, 1.1), rng, tint);
          }
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
        // Mountain/snow terrain is the rock backdrop. Keep it dressed with
        // rocks only; trees must have a real soil surface beneath them.
        if (roll < 0.6 && bucket.ri < POOL.rocks) {
          placeRock(meshes, bucket, obstacles, x, y, z, rand(rng, 0.6, 1.6), rng,
            snowy ? 0xb9c2c9 : 0x7d848b);
        }
      } else {
        // BEACH: tropical palms, seashells (cream rocks), dune grass.
        if (roll < 0.15 * VEGETATION.treeDensity && bucket.ti + 2 <= POOL.trees && bucket.palmi + PALM_FRONDS <= POOL.palms && bucket.fri + 3 <= POOL.fruit) {
          // Beach palms: shorter, wider spread
          placePalm(meshes, bucket, obstacles, x, y, z, rand(rng, 0.65, 1.1) * VEGETATION.treeScale, rng);
        } else if (roll < 0.2 * VEGETATION.treeDensity && bucket.ti + 2 <= POOL.trees && bucket.palmi + PALM_FRONDS <= POOL.palms && bucket.fri + 3 <= POOL.fruit) {
          placeBanana(meshes, bucket, obstacles, x, y, z, rand(rng, 0.6, 0.95) * VEGETATION.treeScale, rng);
        } else if (roll < 0.28 && bucket.ri < POOL.rocks) {
          // Seashells: tiny cream-tinted rocks
          placeRock(meshes, bucket, obstacles, x, y, z, rand(rng, 0.18, 0.45), rng, 0xf5f0e8);
        } else if (roll < 0.38 && bucket.ri < POOL.rocks) {
          // Sandy rocks
          placeRock(meshes, bucket, obstacles, x, y, z, rand(rng, 0.3, 0.55), rng, 0xd9c9a3);
        } else if (roll < 0.56) {
          if (rng() < 0.25 && bucket.reedi < POOL.reed && POOL.reed > 0) {
            placeReed(meshes, bucket, x, y, z, rand(rng, 0.5, 1.1), rng, PALETTES.dryGrass);
          } else if (bucket.gi < POOL.grass) {
            // Dune grass — taller and denser
            placeGrass(meshes, bucket, x, y, z, rand(rng, 0.5, 1.0), rng, PALETTES.dryGrass);
          }
        } else if (roll < 0.62 && bucket.bu < POOL.bushes) {
          // Coastal shrubs (sometimes blooming)
          if (rng() < 0.4 && bucket.fhi + 6 <= POOL.flowerHead) {
            placeFloweringBush(meshes, bucket, x, y, z, rand(rng, 0.4, 0.7), rng);
          } else {
            placeBush(meshes, bucket, x, y, z, rand(rng, 0.4, 0.7), rng, 0x8aac5a);
          }
        } else if (roll < 0.68 && bucket.fhi + 6 <= POOL.flowerHead && bucket.fsti + 6 <= POOL.flowerStem) {
          placeFlowerPatch(meshes, bucket, x, y, z, rand(rng, 0.5, 0.9), rng);
        }
      }
    }
  }

  function rebuildVegetation(cells) {
    obstacles.length = 0;
    const bucket = { ti: 0, pi: 0, bi: 0, palmi: 0, bu: 0, ci: 0, ri: 0, gi: 0, reedi: 0, lci: 0, fri: 0, fsti: 0, fhi: 0 };
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
    grassMesh.count = bucket.gi;
    reedMesh.count = bucket.reedi;
    leafCardMesh.count = bucket.lci;
    fruitMesh.count = bucket.fri;
    flowerStemMesh.count = bucket.fsti;
    flowerHeadMesh.count = bucket.fhi;
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
    if (wantKey === visibleKey && pendingBuild.length === 0) return false;
    // If the center moved while a queue was draining, drop the stale queue
    // and recompute below (already-built chunks are kept, only the missing
    // list is refreshed). Otherwise just keep draining.
    if (pendingBuild.length > 0 && wantKey !== pendingCenterKey) {
      // Fall through to recompute want/queue.
    } else if (pendingBuild.length > 0) {
      drainQueue(MAX_CHUNK_BUILDS_PER_FRAME);
      return false;
    }
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
    // Queue missing chunks, build a couple immediately so something shows.
    pendingBuild = [];
    for (const key of want) {
      if (!groundChunks.has(key)) pendingBuild.push(key);
    }
    // Stable order => no directional pop-in bias.
    pendingBuild.sort();
    pendingWant = want;
    pendingCenterKey = wantKey;
    drainQueue(MAX_CHUNK_BUILDS_PER_FRAME);
    return true;
  }

  function flush() {
    while (pendingBuild.length > 0) drainQueue(pendingBuild.length);
  }

  function regenerate(newSeed, focusX = 0, focusZ = 0) {
    initProcedural(newSeed);
    refreshBridges();
    for (const [, mesh] of groundChunks) {
      scene.remove(mesh);
      mesh.geometry.dispose();
    }
    groundChunks.clear();
    pendingBuild = [];
    pendingWant = null;
    pendingCenterKey = '';
    visibleKey = '';
    spawn = findSpawn();
    ensureAround(focusX || spawn.x, focusZ || spawn.z);
    // Seed change is a rare UI action behind a loading-safe moment: finish
    // synchronously so collisions/vegetation match the new world instantly.
    flush();
    return { ...spawn };
  }

  refreshBridges();
  spawn = findSpawn();
  // Boot is behind the loading screen: build the full 25-chunk neighborhood
  // synchronously so the first compiled frame + attract-mode backdrop is whole.
  ensureAround(spawn.x, spawn.z);
  flush();

  return {
    update(px, pz) {
      return ensureAround(px, pz);
    },
    flush,
    refreshVegetation() {
      // The terrain chunks remain intact; only rebuild instance transforms and
      // collision obstacles using the current vegetation settings.
      if (pendingBuild.length > 0) flush();
      rebuildVegetation(new Set(groundChunks.keys()));
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
