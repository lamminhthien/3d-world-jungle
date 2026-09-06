import * as THREE from 'three';
import { SPAWN } from '../config.js';
import { flatMat, groundHeight } from '../utils.js';

// Low-poly walker with swinging limbs + ground ring marker.
// Returns { player, parts } so main.js can animate it.
export function createPlayer(scene) {
  const player = new THREE.Group();
  const parts = {};

  const skin = flatMat(0xffd8a8);
  const shirt = flatMat(0xff6b6b);
  const pants = flatMat(0x4dabf7);
  const hatM = flatMat(0xe9c46a);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.85, 7), shirt);
  body.position.y = 1.15;
  body.castShadow = true;

  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), skin);
  head.position.y = 1.95;
  head.castShadow = true;

  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.35, 8), hatM);
  hat.position.y = 2.28;
  hat.castShadow = true;

  const mkLimb = (w, h, mat, x, y) => {
    const geo = new THREE.BoxGeometry(w, h, w);
    geo.translate(0, -h / 2, 0); // pivot at the joint
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    return m;
  };

  parts.legL = mkLimb(0.2, 0.75, pants, -0.16, 0.75);
  parts.legR = mkLimb(0.2, 0.75, pants, 0.16, 0.75);
  parts.armL = mkLimb(0.16, 0.65, shirt, -0.5, 1.5);
  parts.armR = mkLimb(0.16, 0.65, shirt, 0.5, 1.5);

  player.add(body, head, hat, parts.legL, parts.legR, parts.armL, parts.armR);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  player.add(ring);

  player.position.set(SPAWN.x, groundHeight(SPAWN.x, SPAWN.z), SPAWN.z);
  scene.add(player);

  return { player, parts };
}
