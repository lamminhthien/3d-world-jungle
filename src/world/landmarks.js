// Genshin-style landmarks — Statue of Seven, Waypoints, Ancient Ruins
// Placed deterministically around spawn so each seed has its own open-world POIs.
// Lightweight: few Meshes, not InstancedMesh (count < 10), with subtle glow.

import * as THREE from 'three';
import { groundHeight } from '../utils.js';
import { sampleGround, BIOMES, GEN } from './procedural.js';

/* --------- Geometries --------- */
function makeStatue() {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0x8f9bb3, flatShading: true });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x7de8ff, transparent: true, opacity: 0.9 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 0.6, 8), stone);
  base.position.y = 0.3; g.add(base);
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.9, 8), stone);
  pillar.position.y = 1.55; g.add(pillar);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 0), stone);
  head.position.y = 2.85; g.add(head);
  const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.42), stone);
  wingL.position.set(-0.38, 2.6, -0.12); wingL.rotation.z = 0.35; g.add(wingL);
  const wingR = wingL.clone(); wingR.position.x = 0.38; wingR.rotation.z = -0.35; g.add(wingR);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), glowMat);
  orb.position.y = 2.05; g.add(orb);
  const light = new THREE.PointLight(0x7de8ff, 0.9, 8, 2);
  light.position.y = 2.05; g.add(light);
  const halo = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.9, 16), new THREE.MeshBasicMaterial({ color: 0x7de8ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide }));
  halo.rotation.x = -Math.PI/2; halo.position.y = 0.06; g.add(halo);
  g.userData = { orb, light, halo, baseY: 2.05 };
  return g;
}

function makeWaypoint() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x4a6fa5 });
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0x4af2ff, transparent: true, opacity: 0.95 });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 1.1, 7), mat);
  pillar.position.y = 0.55; g.add(pillar);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), crystalMat);
  crystal.position.y = 1.45; g.add(crystal);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.52, 12), new THREE.MeshBasicMaterial({ color: 0x4af2ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.08; g.add(ring);
  const light = new THREE.PointLight(0x4af2ff, 0.7, 6, 2); light.position.y = 1.45; g.add(light);
  g.userData = { crystal, light, ring };
  return g;
}

function makeRuinArch() {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0x9a8c7a, flatShading: true });
  const colA = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.6, 0.45), stone);
  colA.position.set(-0.85, 0.8, 0); g.add(colA);
  const colB = colA.clone(); colB.position.x = 0.85; g.add(colB);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.35, 0.55), stone);
  lintel.position.y = 1.75; g.add(lintel);
  const rubble1 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42,0), stone);
  rubble1.position.set(-1.3, 0.22, 0.4); rubble1.scale.set(1.2,0.7,1); g.add(rubble1);
  const rubble2 = rubble1.clone(); rubble2.position.set(1.1, 0.18, -0.35); rubble2.scale.set(0.9,0.6,1.1); g.add(rubble2);
  return g;
}

export function createLandmarks(scene, spawn) {
  const group = new THREE.Group();
  group.name = 'landmarks';
  scene.add(group);
  const items = []; // {mesh, x,z, y, kind, spin}
  let currentSpawn = spawn;

  function clear() {
    for (const it of items) group.remove(it.mesh);
    items.length = 0;
  }

  function place(kind, x, z, y) {
    let mesh;
    if (kind === 'statue') mesh = makeStatue();
    else if (kind === 'waypoint') mesh = makeWaypoint();
    else mesh = makeRuinArch();
    mesh.position.set(x, y, z);
    group.add(mesh);
    items.push({ mesh, x, z, y, kind });
  }

  function populate(seedSpawn) {
    clear();
    currentSpawn = seedSpawn;
    // Deterministic pseudo from spawn + kind
    const hash = (s) => {
      let h = 2166136261; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619);} return (h>>>0)/4294967296;
    };
    // 1 Statue of Seven at nearest mountain peak near spawn (Genshin high vista)
    let bestPeak = null, bestY=-Infinity;
    for(let dx=-12; dx<=12; dx+=3){
      for(let dz=-12; dz<=12; dz+=3){
        const x=currentSpawn.x+dx, z=currentSpawn.z+dz;
        const s=sampleGround(x,z);
        if(s.biome===BIOMES.MOUNTAIN || s.biome===BIOMES.SNOW){
          if(s.y>bestY){ bestY=s.y; bestPeak={x,z,y:s.y}; }
        }
      }
    }
    if(bestPeak) place('statue', bestPeak.x, bestPeak.z, bestPeak.y);
    else place('statue', currentSpawn.x+8, currentSpawn.z-10, groundHeight(currentSpawn.x+8, currentSpawn.z-10));

    // 4 Waypoints in cardinal directions (teleport pillars)
    const dirs=[[14,0],[-14,2],[0,16],[0,-16]];
    for(const [dx,dz] of dirs){
      const x=currentSpawn.x+dx, z=currentSpawn.z+dz;
      const y=groundHeight(x,z);
      place('waypoint', x, z, y);
    }
    // 3 Ruins — scattered, one near desert/mountain edge
    const ruinSpots=[[9,-9],[ -10,10],[12,12]];
    for(const [dx,dz] of ruinSpots){
      const x=currentSpawn.x+dx, z=currentSpawn.z+dz;
      const y=groundHeight(x,z);
      // snap to rock/mountain if possible for ancient feel
      place('ruin', x, z, y);
    }
  }

  populate(spawn);

  return {
    regenerate(nextSpawn){ populate(nextSpawn); },
    getItems: () => items.map(i => ({ kind:i.kind, x:i.x, z:i.z, y:i.y })),
    // gentle crystal spin + light pulse
    update(dt, playerPos){
      const t=performance.now()*0.001;
      for(const it of items){
        if(it.kind==='waypoint' || it.kind==='statue'){
          const c=it.mesh.userData.crystal || it.mesh.userData.orb;
          if(c){ c.rotation.y+=dt*0.9; c.position.y=(c.parent.userData.baseY||1.45)+Math.sin(t*1.2)*0.06; }
          const l=it.mesh.userData.light; if(l) l.intensity=0.7+Math.sin(t*2+it.x)*0.18;
        }
      }
    },
    dispose(){ clear(); scene.remove(group); }
  };
}
