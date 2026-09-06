// Night fireflies (docs/enhance_for_night_screen.md section 1).
// - THREE.Points + custom shader: soft glowing dots with per-point flicker.
// - Only visible at night (timeOfDay 19:00–05:00, smooth fade on the edges).
// - Follows the player: respawns inside a ~40u box around the focus, biased
//   toward river banks / jungle floor. Sine-wave drift => free hovering.
// - Ortho-camera safe: fixed pixel point size (no perspective attenuation).
import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';
import { groundHeight, riverDist } from '../utils.js';
import { riverXAt } from './procedural.js';

// Low tier halves the swarm (CPU sine sim + additive overdraw both cost).
const COUNT = QUALITY.low ? 70 : 140;
const RANGE = 22; // respawn box half-size around the player
const DESPAWN = 28;

function nightFactor(timeOfDay) {
  // 1 at deep night, 0 in daylight, smooth ~1h ramps at dusk/dawn.
  // Night window per doc: 19:00 -> 05:00.
  const t = ((timeOfDay % 24) + 24) % 24;
  if (t >= 19.5 || t < 4.5) return 1;
  if (t >= 18.5 && t < 19.5) return (t - 18.5) / 1.0;
  if (t >= 4.5 && t < 5.5) return 1 - (t - 4.5) / 1.0;
  return 0;
}

export function createFireflies(scene) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(COUNT * 3);
  const phase = new Float32Array(COUNT);
  const speed = new Float32Array(COUNT);
  const pscale = new Float32Array(COUNT);

  // Per-point wander state (CPU).
  const bx = new Float32Array(COUNT);
  const by = new Float32Array(COUNT);
  const bz = new Float32Array(COUNT);
  const amp = new Float32Array(COUNT);
  const seed2 = new Float32Array(COUNT);

  function place(i, fx, fz, first = false) {
    let x; let z;
    // Half the swarm hugs the river banks (near water + bushes), the rest
    // scatters freely around the player.
    if (Math.random() < 0.5) {
      const rz = fz + (Math.random() - 0.5) * RANGE * 2;
      const side = Math.random() < 0.5 ? -1 : 1;
      x = riverXAt(rz) + side * (4 + Math.random() * 7);
      z = rz;
    } else {
      x = fx + (Math.random() - 0.5) * RANGE * 2;
      z = fz + (Math.random() - 0.5) * RANGE * 2;
    }
    // Keep out of the water channel itself.
    if (riverDist(x, z) < 3.4) x += 4;
    bx[i] = x;
    bz[i] = z;
    by[i] = groundHeight(x, z) + 0.6 + Math.random() * 1.4;
    amp[i] = 0.5 + Math.random() * 1.0;
    seed2[i] = Math.random() * Math.PI * 2;
    if (first) {
      pos[i * 3] = x; pos[i * 3 + 1] = by[i]; pos[i * 3 + 2] = z;
    }
  }

  for (let i = 0; i < COUNT; i++) {
    place(i, 0, 0, true);
    phase[i] = Math.random() * Math.PI * 2;
    speed[i] = 1.2 + Math.random() * 2.2; // flicker speed
    pscale[i] = 5 + Math.random() * 7; // px size
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
  geo.setAttribute('aScale', new THREE.BufferAttribute(pscale, 1));

  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0 },
    uPixelRatio: { value: Math.min(devicePixelRatio || 1, 2) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aScale;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vTwinkle;
      void main() {
        // Per-point glow pulse: sin flicker, mostly-bright duty cycle.
        vTwinkle = 0.45 + 0.55 * (0.5 + 0.5 * sin(uTime * aSpeed + aPhase));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aScale * uPixelRatio;
      }`,
    fragmentShader: `
      uniform float uOpacity;
      varying float vTwinkle;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        if (d > 0.5) discard;
        // Soft round sprite: hot core -> warm halo.
        float core = smoothstep(0.5, 0.05, d);
        vec3 col = mix(vec3(0.55, 1.0, 0.35), vec3(1.0, 0.95, 0.45), core);
        float a = core * vTwinkle * uOpacity;
        gl_FragColor = vec4(col * a, a);
      }`,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  scene.add(points);

  let visible = false;

  return {
    points,
    nightFactor,
    get visible() { return visible; },
    update(dt, elapsed, focus, timeOfDay) {
      const f = nightFactor(timeOfDay);
      uniforms.uTime.value = elapsed;
      // Fade the whole swarm; hide entirely by day (skip draw cost).
      uniforms.uOpacity.value += (f - uniforms.uOpacity.value) * Math.min(1, dt * 2);
      visible = uniforms.uOpacity.value > 0.02;
      points.visible = visible;
      if (!visible) return;

      const fx = focus ? focus.x : 0;
      const fz = focus ? focus.z : 0;
      const p = geo.attributes.position.array;
      // Budget recycles: place() runs river + ground noise; after a fast
      // move/teleport dozens could recycle in one frame => hitch. Spread it.
      let recycled = 0;
      for (let i = 0; i < COUNT; i++) {
        // Recycle strays back around the player.
        const dx = bx[i] - fx;
        const dz = bz[i] - fz;
        if (dx * dx + dz * dz > DESPAWN * DESPAWN && recycled < 4) { place(i, fx, fz); recycled++; }
        // Free wandering: layered sine drift (doc: sine wave hovering).
        const t = elapsed;
        const a = amp[i];
        p[i * 3] = bx[i] + Math.sin(t * 0.5 + seed2[i]) * a + Math.sin(t * 1.1 + seed2[i] * 2.0) * 0.25;
        p[i * 3 + 1] = by[i] + Math.sin(t * 0.8 + seed2[i] * 1.7) * 0.45;
        p[i * 3 + 2] = bz[i] + Math.cos(t * 0.42 + seed2[i]) * a + Math.cos(t * 0.9 + seed2[i]) * 0.25;
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() {
      scene.remove(points);
      geo.dispose();
      mat.dispose();
    },
  };
}
