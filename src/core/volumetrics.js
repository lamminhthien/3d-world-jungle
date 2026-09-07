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

    // hash for subtle shimmer
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }

    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if(intensity < 0.01){
        gl_FragColor = base;
        return;
      }
      vec2 toLight = lightPosition - vUv;
      float dist = length(toLight);
      // Screen fade: light off-screen => no rays. Also fade when very close to center to avoid hot spot
      float offScreen = step(0.0, lightPosition.x) * step(lightPosition.x, 1.0) * step(0.0, lightPosition.y) * step(lightPosition.y, 1.0);
      // Also fade when light below horizon (lightPosition.y < ~0.08) — shafts should be horizon-hugging
      float vis = offScreen * smoothstep(0.02, 0.14, lightPosition.y) * intensity;
      if(vis < 0.01){ gl_FragColor = base; return; }

      // Direction + angle for shaft pattern
      vec2 dir = toLight / max(dist, 1e-4);
      float angle = atan(dir.y, dir.x);

      // Multi-frequency radial streak pattern
      float shafts = 0.0;
      shafts += 0.55 * pow(max(0.0, sin(angle * 7.0 + 1.1 + time*0.12)), 24.0);
      shafts += 0.35 * pow(max(0.0, sin(angle * 13.0 - 0.6 - time*0.07)), 32.0);
      shafts += 0.22 * pow(max(0.0, sin(angle * 19.0 + 0.9)), 20.0);
      // Moon/night has softer, broader shafts
      shafts = mix(shafts, shafts*0.6 + 0.22, nightFactor);
      shafts = clamp(shafts, 0.0, 1.0);

      // Radial falloff: strong near light, soft far
      float radial = exp(-dist * (1.6 + nightFactor*0.6)) * smoothstep(1.35, 0.0, dist);
      // Density modulates how tight the falloff is
      radial = pow(radial, 0.9 + density*0.18);

      // Volumetric fog contribution: more scattering low on screen (horizon)
      float heightFog = smoothstep(0.55, 0.05, vUv.y) * 0.35 * (0.6 + nightFactor*0.6);
      // Light is low => shafts more visible through haze
      float lowLightBoost = smoothstep(0.35, 0.0, lightPosition.y) * 0.9 + 1.0;
      float shimmer = 0.92 + 0.08 * sin(time*1.7 + dist*18.0 + hash(vUv*9.0)*6.2831);

      float rayMask = shafts * radial * shimmer * lowLightBoost;
      // Add height fog scattering to the mask so shafts feel volumetric
      rayMask += heightFog * radial * 0.45 * vis;

      // Color: warm sun vs cool moon, lerp by nightFactor
      vec3 sunCol = lightColor;
      vec3 moonCol = vec3(0.62, 0.72, 1.0);
      vec3 rayColor = mix(sunCol, moonCol, nightFactor * 0.95);
      // Night moon shafts are bluer and slightly desaturated
      rayColor *= 1.0 + nightFactor*0.15;

      float decayAtten = pow(decay, dist*28.0);
      vec3 add = rayColor * rayMask * weight * 3.2 * exposure * decayAtten * vis;

      // Subtle warm/cool tint on base for GI-like bounce near shafts
      vec3 bleed = rayColor * 0.06 * radial * vis * (0.7 + nightFactor*0.3);
      vec3 outCol = base.rgb + add + bleed * base.rgb;

      // Slight vignette to keep shafts cinematic, not washing out whole screen
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

  // Expose intensity knob for quality tier
  uniforms.weight.value = QUALITY.low ? 0.22 : 0.32;
  uniforms.exposure.value = QUALITY.low ? 0.45 : 0.55;

  return { pass, uniforms, update, dispose };
}
