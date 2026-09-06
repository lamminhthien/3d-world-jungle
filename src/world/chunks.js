// World streaming (docs section 3): infinite map split into CHUNK_SIZE x CHUNK_SIZE
// chunks, only chunks within RADIUS of the player are kept in memory.
// Ground = 1 merged Mesh per chunk (vertex colors by biome).
// Vegetation = global InstancedMesh pools rebuilt deterministically whenever the
// visible chunk set changes (seed + chunk key => stable placement, no popping).

import * as THREE from 'three';
import { BRIDGES } from '../config.js';
import { dummy, flatMat, obstacles } from '../utils.js';
import { rngFromString } from './noise.js';
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
const pick = (rng, arr) => arr[(rng() * arr.length) | 0];

const pinePalette = [0x2f9e44, 0x2b8a3e, 0x37b24d];
const blobPalette = [0x40b34f, 0x51cf66, 0x2f9e44, 0x69db7c];
const snowPinePalette = [0xdfeee8, 0xcfe3d8, 0x9fc3b4];

const keyOf = (cx, cz) => `${cx},${cz}`;

export function createWorldManager(scene, seedStr) {
  if (seedStr) initProcedural(seedStr);
  const groundMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
  });
  const groundChunks = new Map(); // key -> Mesh

  // ---- Global vegetation pools (one draw call each) ----
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.3, 1.4, 6), flatMat(0xffffff), POOL.trees);
  const pineMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(1.25, 2.6, 7), flatMat(0xffffff), POOL.crowns);
  const blobMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.25, 0), flatMat(0xffffff), POOL.crowns);
  const palmMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.4, 2.6, 4), flatMat(0xffffff), POOL.palms);
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.7, 0), flatMat(0xffffff), POOL.bushes);
  const cactusMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.4, 2.4, 7), flatMat(0xffffff), POOL.cacti);
  const rockMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), flatMat(0xffffff), POOL.rocks);
  const pools = [trunkMesh, pineMesh, blobMesh, palmMesh, bushMesh, cactusMesh, rockMesh];
  for (const m of pools) {
    m.castShadow = m.receiveShadow = true;
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

      if (biome === BIOMES.JUNGLE) {
        if (roll < 0.42 && bucket.ti < POOL.trees) {
          const s = rand(rng, 0.8, 1.5);
          trunkMesh.setColorAt(bucket.ti, new THREE.Color(0x8a5a3b).offsetHSL(0, 0, rand(rng, -0.03, 0.03)));
          dummy.position.set(x, y + 0.7 * s, z);
          dummy.rotation.set(rand(rng, -0.08, 0.08), rand(rng, 0, 6.28), rand(rng, -0.08, 0.08));
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          trunkMesh.setMatrixAt(bucket.ti++, dummy.matrix);
          obstacles.push({ x, z, r: 0.55 * s });
          const kind = rng();
          if (kind < 0.45) {
            for (let k = 0; k < 2 && bucket.pi < POOL.crowns; k++) {
              pineMesh.setColorAt(bucket.pi, new THREE.Color(pick(rng, pinePalette)));
              dummy.position.set(x, y + (1.9 + k * 1.15) * s, z);
              dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
              dummy.scale.setScalar(s * (k === 0 ? 1 : 0.68));
              dummy.updateMatrix();
              pineMesh.setMatrixAt(bucket.pi++, dummy.matrix);
            }
          } else if (kind < 0.8) {
            for (let k = 0; k < 2 && bucket.bi < POOL.crowns; k++) {
              blobMesh.setColorAt(bucket.bi, new THREE.Color(pick(rng, blobPalette)));
              dummy.position.set(x + rand(rng, -0.4, 0.4) * s, y + (2.1 + k * 0.8) * s, z + rand(rng, -0.4, 0.4) * s);
              dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
              dummy.scale.set(s * rand(rng, 0.9, 1.2), s * rand(rng, 0.8, 1), s * rand(rng, 0.9, 1.2));
              dummy.updateMatrix();
              blobMesh.setMatrixAt(bucket.bi++, dummy.matrix);
            }
          } else if (bucket.palmi + 5 < POOL.palms) {
            // palm near jungle/beach
            dummy.position.set(x, y + 1.1 * s, z);
            dummy.rotation.set(0.15, rand(rng, 0, 6.28), 0.12);
            dummy.scale.setScalar(s * 1.15);
            dummy.updateMatrix();
            trunkMesh.setMatrixAt(bucket.ti - 1, dummy.matrix);
            const topY = y + 2.2 * s;
            for (let k = 0; k < 5; k++) {
              palmMesh.setColorAt(bucket.palmi, new THREE.Color(0x37b24d).offsetHSL(0, 0, rand(rng, -0.03, 0.03)));
              const a = (k / 5) * Math.PI * 2;
              dummy.position.set(x + 0.25 + Math.cos(a) * 1.05 * s, topY + rand(rng, -0.15, 0.25), z + 0.2 + Math.sin(a) * 1.05 * s);
              dummy.rotation.set(Math.PI / 2.3, 0, -a + Math.PI / 2);
              dummy.scale.set(1, 1, 0.28);
              dummy.updateMatrix();
              palmMesh.setMatrixAt(bucket.palmi++, dummy.matrix);
            }
            if (bucket.bi < POOL.crowns) {
              blobMesh.setColorAt(bucket.bi, new THREE.Color(0x5c3d24));
              dummy.position.set(x + 0.25, topY - 0.15, z + 0.2);
              dummy.rotation.set(0, 0, 0);
              dummy.scale.setScalar(0.28 * s);
              dummy.updateMatrix();
              blobMesh.setMatrixAt(bucket.bi++, dummy.matrix);
            }
          }
        } else if (roll < 0.62 && bucket.bu < POOL.bushes) {
          bushMesh.setColorAt(bucket.bu, new THREE.Color(0x69b93e).offsetHSL(rand(rng, -0.02, 0.02), 0, rand(rng, -0.04, 0.04)));
          dummy.position.set(x, y + 0.3, z);
          dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
          dummy.scale.setScalar(rand(rng, 0.6, 1.4));
          dummy.updateMatrix();
          bushMesh.setMatrixAt(bucket.bu++, dummy.matrix);
        } else if (roll < 0.7 && bucket.ri < POOL.rocks) {
          const s = rand(rng, 0.4, 0.9);
          rockMesh.setColorAt(bucket.ri, new THREE.Color(0x9aa0a3).offsetHSL(0, -0.05, rand(rng, -0.05, 0.02)));
          dummy.position.set(x, y + s * 0.25, z);
          dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), rand(rng, 0, 3));
          dummy.scale.set(s, s * 0.7, s);
          dummy.updateMatrix();
          rockMesh.setMatrixAt(bucket.ri++, dummy.matrix);
        }
      } else if (biome === BIOMES.DESERT) {
        if (roll < 0.3 && bucket.ci < POOL.cacti) {
          const s = rand(rng, 0.7, 1.4);
          cactusMesh.setColorAt(bucket.ci, new THREE.Color(0x2f9e44).offsetHSL(rand(rng, -0.02, 0.02), 0.05, rand(rng, -0.03, 0.03)));
          dummy.position.set(x, y + 1.1 * s, z);
          dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          cactusMesh.setMatrixAt(bucket.ci++, dummy.matrix);
          obstacles.push({ x, z, r: 0.5 * s });
        } else if (roll < 0.45 && bucket.ri < POOL.rocks) {
          const s = rand(rng, 0.5, 1.1);
          rockMesh.setColorAt(bucket.ri, new THREE.Color(0xc2a06b));
          dummy.position.set(x, y + s * 0.25, z);
          dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), rand(rng, 0, 3));
          dummy.scale.set(s, s * 0.7, s);
          dummy.updateMatrix();
          rockMesh.setMatrixAt(bucket.ri++, dummy.matrix);
          if (s > 0.9) obstacles.push({ x, z, r: s * 0.8 });
        } else if (roll < 0.55 && bucket.bu < POOL.bushes) {
          bushMesh.setColorAt(bucket.bu, new THREE.Color(0xb5a642));
          dummy.position.set(x, y + 0.25, z);
          dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
          dummy.scale.setScalar(rand(rng, 0.5, 0.9));
          dummy.updateMatrix();
          bushMesh.setMatrixAt(bucket.bu++, dummy.matrix);
        }
      } else if (biome === BIOMES.MOUNTAIN || biome === BIOMES.SNOW) {
        const snowy = biome === BIOMES.SNOW;
        if (roll < 0.34 && bucket.ti < POOL.trees && bucket.pi + 2 < POOL.crowns) {
          const s = rand(rng, 0.7, 1.2);
          trunkMesh.setColorAt(bucket.ti, new THREE.Color(snowy ? 0x6b4f35 : 0x7a5233));
          dummy.position.set(x, y + 0.7 * s, z);
          dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          trunkMesh.setMatrixAt(bucket.ti++, dummy.matrix);
          obstacles.push({ x, z, r: 0.55 * s });
          for (let k = 0; k < 2 && bucket.pi < POOL.crowns; k++) {
            pineMesh.setColorAt(bucket.pi, new THREE.Color(pick(rng, snowy ? snowPinePalette : pinePalette)));
            dummy.position.set(x, y + (1.9 + k * 1.15) * s, z);
            dummy.rotation.set(0, rand(rng, 0, 6.28), 0);
            dummy.scale.setScalar(s * (k === 0 ? 1 : 0.68));
            dummy.updateMatrix();
            pineMesh.setMatrixAt(bucket.pi++, dummy.matrix);
          }
        } else if (roll < 0.6 && bucket.ri < POOL.rocks) {
          const s = rand(rng, 0.6, 1.6);
          rockMesh.setColorAt(bucket.ri, new THREE.Color(snowy ? 0xb9c2c9 : 0x7d848b));
          dummy.position.set(x, y + s * 0.25, z);
          dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), rand(rng, 0, 3));
          dummy.scale.set(s * rand(rng, 0.8, 1.3), s * rand(rng, 0.6, 1), s * rand(rng, 0.8, 1.3));
          dummy.updateMatrix();
          rockMesh.setMatrixAt(bucket.ri++, dummy.matrix);
          if (s > 0.9) obstacles.push({ x, z, r: s * 0.8 });
        }
      } else {
        // BEACH: sparse palms + shells (rocks tinted sand)
        if (roll < 0.12 && bucket.ri < POOL.rocks) {
          const s = rand(rng, 0.3, 0.6);
          rockMesh.setColorAt(bucket.ri, new THREE.Color(0xd9c9a3));
          dummy.position.set(x, y + s * 0.2, z);
          dummy.rotation.set(rand(rng, 0, 3), rand(rng, 0, 3), 0);
          dummy.scale.setScalar(s);
          dummy.updateMatrix();
          rockMesh.setMatrixAt(bucket.ri++, dummy.matrix);
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
    const want = new Set();
    for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
      for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
        want.add(keyOf(ccx + dx, ccz + dz));
      }
    }
    const wantKey = `${getSeed()}@${keyOf(ccx, ccz)}`;
    if (wantKey === visibleKey) return false;
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
