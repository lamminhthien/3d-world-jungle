import * as THREE from 'three';
import { WORLD } from '../config.js';
import { groundHeight, rand } from '../utils.js';
import { getGroundBump, getGroundTexture } from './textures.js';

// Low-poly grass ground with sandy river banks and vertex colors.
export function createGround(scene) {
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, WORLD.groundSegments, WORLD.groundSegments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = [];
  const cGrass = new THREE.Color(0x7aa856);
  const cGrass2 = new THREE.Color(0x5f8a44);
  const cSand = new THREE.Color(0xd9c27a);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    let y = groundHeight(x, z);
    // Low-poly ripple outside the river.
    if (Math.abs(x) > 6.2) {
      y += (Math.sin(x * 1.3) + Math.cos(z * 1.1)) * 0.06 + rand(-0.06, 0.06);
    }
    pos.setY(i, y);
    const ax = Math.abs(x);
    const c = ax < 4.6 ? cSand.clone() : cGrass.clone().lerp(cGrass2, Math.random() * 0.7);
    c.offsetHSL(0, 0, rand(-0.02, 0.02));
    colors.push(c.r, c.g, c.b);
  }

  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // Legacy single-plane ground spans the whole WORLD.size, so it needs a
  // denser repeat than the chunked ground (which tiles per 16-unit chunk).
  const detailMap = getGroundTexture().clone();
  detailMap.repeat.set(48, 48);
  detailMap.needsUpdate = true;
  const detailBump = getGroundBump().clone();
  detailBump.repeat.set(48, 48);
  detailBump.needsUpdate = true;
  const ground = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: detailMap,
      bumpMap: detailBump,
      bumpScale: 0.06,
      flatShading: true,
      roughness: 1,
    }),
  );
  ground.receiveShadow = true;
  scene.add(ground);
  return ground;
}
