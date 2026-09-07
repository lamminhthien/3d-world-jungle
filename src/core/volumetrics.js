// Volumetric god rays / light shafts / moon shafts
// Fake but punchy: screen-space radial shafts from sun/moon position.
// Desktop 60 samples, mobile/low 32. No extra RTT — procedural overlay additively composited.

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { QUALITY } from './setup.js';

const NUM_SAMPLES = QUALITY.low ? 24 : 48;

export function createVolumetricPass() {
  if (QUALITY.low) {
    // Low tier keeps a cheaper shaft set but still visible at night/sunrise
  }

  const uniforms = {
    tDiffuse: { value: null },
    lightPosition: { value: new THREE.Vector2(0.5, 0.6) },
    lightColor: { value: new THREE.Color(0xfff3e0) },
    intensity: { value: 0 },
    density: { value: 0.92 },
    weight: { value: 0.32 },
    decay: { value: 0.985 },
    exposure: { value: 0.55 },
    time: { value: 0 },
    nightFactor: { value: 0 },
    resolution: { value: new THREE.Vector2(innerWidth, innerHeight) },
  };

  const vert = `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `;

  // Procedural shaft overlay: radial streaks + falloff, blended additively.
  // Cheap (~NUM_SAMPLES loop only samples procedural math, not textures).
  const frag = `
    uniform sampler2D tDiffuse;
    uniform vec2 lightPosition;
    uniform vec3 lightColor;
    uniform float intensity;
    uniform float density;
    uniform float weight;
    uniform float decay;
    uniform float exposure;
    uniform float time;
    uniform float nightFactor;
    varying vec2 vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }

    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if(intensity < 0.008){
        gl_FragColor = base;
        return;
      }
      vec2 toLight = lightPosition - vUv;
      float dist = length(toLight);
      float offScreen = step(0.0, lightPosition.x) * step(lightPosition.x, 1.0) * step(0.0, lightPosition.y) * step(lightPosition.y, 1.0);
      // Soften: shafts only when light well inside sky, not scraping horizon
      float vis = offScreen * smoothstep(0.04, 0.22, lightPosition.y) * intensity;
      // Strong ground fade: rays belong in sky / haze, not as hard ground stripes
      float groundFade = smoothstep(0.02, 0.42, vUv.y);
      vis *= mix(0.35, 1.0, groundFade);
      if(vis < 0.008){ gl_FragColor = base; return; }

      vec2 dir = toLight / max(dist, 1e-4);
      float angle = atan(dir.y, dir.x);

      // Softer, broader shafts (lower pow => no hard streaks)
      float shafts = 0.0;
      shafts += 0.42 * pow(max(0.0, sin(angle * 6.0 + 1.0 + time*0.08)), 6.0);
      shafts += 0.28 * pow(max(0.0, sin(angle * 11.0 - 0.4 - time*0.05)), 8.0);
      shafts += 0.16 * pow(max(0.0, sin(angle * 16.0 + 0.6)), 7.0);
      // Expand shafts so they are diffuse, not razor lines
      shafts = pow(shafts, 0.85);
      shafts = mix(shafts, shafts*0.55 + 0.12, nightFactor);
      shafts = clamp(shafts, 0.0, 0.95);

      // Softer radial — gentle bloom around light, quick falloff after ~60% screen
      float radial = exp(-dist * (2.2 + nightFactor*0.5)) * smoothstep(0.95, 0.15, dist);
      radial = pow(radial, 0.85);

      // Only very subtle low-horizon haze, not full heightFog band
      float heightFog = smoothstep(0.38, 0.14, vUv.y) * 0.08 * (0.4 + nightFactor*0.4);
      float shimmer = 0.96 + 0.04 * sin(time*0.9 + dist*9.0 + hash(vUv*7.0)*6.2831);

      float rayMask = shafts * radial * shimmer;
      rayMask += heightFog * radial * 0.18 * vis;
      // Ground suppression for rayMask itself
      rayMask *= groundFade * 0.92 + 0.08;

      vec3 sunCol = lightColor;
      vec3 moonCol = vec3(0.68, 0.76, 1.0);
      vec3 rayColor = mix(sunCol, moonCol, nightFactor * 0.88);
      rayColor *= 1.0 + nightFactor*0.08;

      float decayAtten = pow(decay, dist*18.0);
      // Much lower multiplier: before 3.2*exposure, now ~1.1*exposure for subtlety
      vec3 add = rayColor * rayMask * weight * 1.15 * exposure * decayAtten * vis;

      vec3 bleed = rayColor * 0.02 * radial * vis * (0.5 + nightFactor*0.25);
      vec3 outCol = base.rgb + add + bleed * base.rgb;

      gl_FragColor = vec4(outCol, base.a);
    }
  `;

  const pass = new ShaderPass({
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
  });
  // ShaderPass needs to replace tDiffuse correctly — keep enabled
  pass.enabled = true;
  pass.clear = false;

  // Resize hook
  const onResize = () => uniforms.resolution.value.set(innerWidth, innerHeight);
  addEventListener('resize', onResize);
  if (typeof visualViewport !== 'undefined' && visualViewport) visualViewport.addEventListener('resize', onResize);

  function update({ lightPosition, lightColor, intensity, time, nightFactor }) {
    if (lightPosition) uniforms.lightPosition.value.copy(lightPosition);
    if (lightColor) uniforms.lightColor.value.copy(lightColor);
    uniforms.intensity.value = THREE.MathUtils.clamp(intensity ?? 0, 0, 1);
    uniforms.time.value = time ?? 0;
    uniforms.nightFactor.value = THREE.MathUtils.clamp(nightFactor ?? 0, 0, 1);
  }

  function dispose() {
    removeEventListener('resize', onResize);
  }

  // Subtle by default — user can push with rays toggle; low tier even softer
  uniforms.weight.value = QUALITY.low ? 0.09 : 0.13;
  uniforms.exposure.value = QUALITY.low ? 0.28 : 0.34;
  uniforms.density.value = 0.78;

  return { pass, uniforms, update, dispose };
}
