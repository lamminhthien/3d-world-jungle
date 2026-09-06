import * as THREE from 'three';
import { CLOUD_COUNT } from '../config.js';
import { rand } from '../utils.js';

// Low-poly drifting clouds, pushed to the edges so they never cover the player.
export function createClouds(scene) {
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    flatShading: true,
    roughness: 1,
    transparent: true,
    opacity: 0.92,
  });
  const clouds = [];

  for (let i = 0; i < CLOUD_COUNT; i++) {
    const g = new THREE.Group();
    const n = 3 + ((Math.random() * 3) | 0);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.8, 1.4), 0), cloudMat);
      m.position.set(k * rand(1.0, 1.5), rand(-0.3, 0.3), rand(-0.6, 0.6));
      m.scale.y = 0.6;
      g.add(m);
    }
    const ang = rand(0, Math.PI * 2);
    const rad = rand(30, 44);
    g.position.set(Math.cos(ang) * rad, rand(24, 30), Math.sin(ang) * rad);
    g.userData.speed = rand(0.2, 0.6);
    scene.add(g);
    clouds.push(g);
  }

  function update(dt) {
    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 48) c.position.x = -48;
    }
  }

  return { clouds, update };
}
