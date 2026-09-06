import * as THREE from 'three';
import { BRIDGES } from '../config.js';
import { QUALITY } from '../core/setup.js';
import { flatMat } from '../utils.js';
import { riverXAt } from './procedural.js';
import { getBarkBump, getBarkTexture } from './textures.js';

// Shared geometries: was `new BoxGeometry` per plank (~21 per bridge),
// wasting GPU memory and setup time. One instance each, reused by all bridges.
//
// P0 tessellation (docs/tessellation-improvement-plan.md): planks get a
// mid-span sag (2 depth segs, center row −0.03, ends +0.01) so the deck
// catches a highlight instead of reading as one flat bar. Rails/posts stay
// boxes on low tier; desktop gets 6-sided log cylinders (~+0.5k tris total).
function createPlankGeometry() {
  const geo = new THREE.BoxGeometry(0.9, 0.12, 1.1, 1, 1, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i);
    pos.setY(i, pos.getY(i) + (Math.abs(z) < 0.2 ? -0.03 : 0.01));
  }
  geo.computeVertexNormals();
  return geo;
}

function createRailGeometry() {
  if (QUALITY.low) return new THREE.BoxGeometry(9, 0.12, 0.12);
  const geo = new THREE.CylinderGeometry(0.09, 0.09, 9, 6);
  geo.rotateZ(Math.PI / 2); // span along X like the old box rail
  return geo;
}

function createPostGeometry() {
  if (QUALITY.low) return new THREE.BoxGeometry(0.14, 0.8, 0.14);
  return new THREE.CylinderGeometry(0.08, 0.1, 0.8, 6);
}

const GEO = {
  plank: createPlankGeometry(),
  rail: createRailGeometry(),
  post: createPostGeometry(),
};

// Deterministic 0..1 hash per plank — stable across seed regenerates, no
// Math.random (bridge layout must match the river path every rebuild).
function hashPlank(i, bz) {
  const s = Math.sin(i * 12.9898 + bz * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// Wooden plank bridges spanning the winding river. Each bridge is centred on
// the river path riverXAt(bz) so the deck always crosses the water, even after
// a seed change. Re-call createBridges() after regenerate() to re-seat them.
export function createBridges(scene) {
  const woodMaps = QUALITY.low
    ? { map: getBarkTexture() }
    : { map: getBarkTexture(), bumpMap: getBarkBump(), bumpScale: 0.04 };
  const plankMat = flatMat(0xa5713f, woodMaps);
  const railMat = flatMat(0x7a4f27, woodMaps);
  const groups = [];

  for (const bz of BRIDGES) {
    const g = new THREE.Group();
    const cx = riverXAt(bz);
    for (let i = 0; i < 9; i++) {
      const p = new THREE.Mesh(GEO.plank, plankMat);
      // P0 character: per-plank yaw/gap/height jitter (±0.02 rad, ±0.03u) so
      // the deck reads as laid boards, not one extruded bar. Gameplay height
      // (isOnBridge) stays flat — visual only.
      const h1 = hashPlank(i, bz);
      const h2 = hashPlank(i + 37, bz);
      const h3 = hashPlank(i + 91, bz);
      p.position.set(-4 + i, 0.45 + (h3 - 0.5) * 0.02, (h2 - 0.5) * 0.06);
      p.rotation.y = (h1 - 0.5) * 0.04;
      p.castShadow = QUALITY.shadowsEnabled;
      p.receiveShadow = QUALITY.shadowsEnabled;
      g.add(p);
    }
    for (const s of [-0.8, 0.8]) {
      const rail = new THREE.Mesh(GEO.rail, railMat);
      rail.position.set(0, 1.15, s);
      rail.castShadow = QUALITY.shadowsEnabled;
      g.add(rail);
      for (let i = -4; i <= 4; i += 2) {
        const post = new THREE.Mesh(GEO.post, railMat);
        post.position.set(i, 0.8, s);
        post.castShadow = QUALITY.shadowsEnabled;
        g.add(post);
      }
    }
    g.position.set(cx, 0, bz);
    scene.add(g);
    groups.push(g);
  }

  return groups;
}

// Remove previously created bridge groups (used when the seed changes).
export function removeBridges(scene, groups) {
  for (const g of groups) scene.remove(g);
}
