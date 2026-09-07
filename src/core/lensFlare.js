// Screen-space lens flare — sun/moon ghosts, halo, anamorphic streaks
// Procedural ShaderPass: draws flare elements along line light -> screenCenter
// No textures needed; additive blending. Occlusion via intensity + off-screen test.
// Night: cool blue ghosts, subtle. Day/sunrise: warm + stronger streaks.

import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { QUALITY } from './setup.js';

export function createLensFlarePass() {
  const uniforms = {
    tDiffuse: { value: null },
    lightPosition: { value: new THREE.Vector2(0.5, 0.5) },
    lightColor: { value: new THREE.Color(0xfff6d8) },
    intensity: { value: 0 },
    time: { value: 0 },
    nightFactor: { value: 0 },
    enabled: { value: 1 },
  };

  const vert = `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `;

  const frag = `
    uniform sampler2D tDiffuse;
    uniform vec2 lightPosition;
    uniform vec3 lightColor;
    uniform float intensity;
    uniform float time;
    uniform float nightFactor;
    uniform float enabled;
    varying vec2 vUv;

    float circle(vec2 uv, vec2 p, float r, float feather){
      float d = length(uv - p);
      return 1.0 - smoothstep(r - feather, r + feather, d);
    }
    float ring(vec2 uv, vec2 p, float r, float w, float feather){
      float d = length(uv - p);
      return smoothstep(r - w - feather, r - w, d) * (1.0 - smoothstep(r, r + feather, d));
    }

    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      if(enabled < 0.5 || intensity < 0.02){
        gl_FragColor = base; return;
      }
      vec2 lp = lightPosition;
      float off = step(0.0, lp.x)*step(lp.x,1.0)*step(0.0, lp.y)*step(lp.y,1.0);
      float vis = off * intensity * smoothstep(-0.08, 0.12, lp.y);
      if(vis < 0.01){ gl_FragColor = base; return; }

      vec2 center = vec2(0.5, 0.5);
      // Ghosts along flare axis (light -> center). Offsets: -0.3 .. 1.1
      float ghostOffsets[7];
      ghostOffsets[0] = -0.28; ghostOffsets[1] = -0.08; ghostOffsets[2] = 0.18;
      ghostOffsets[3] = 0.38; ghostOffsets[4] = 0.62; ghostOffsets[5] = 0.85; ghostOffsets[6] = 1.08;

      vec3 ghostColors[7];
      ghostColors[0] = vec3(0.55,0.85,1.0);
      ghostColors[1] = vec3(1.0,0.82,0.45);
      ghostColors[2] = vec3(0.42,0.95,0.65);
      ghostColors[3] = vec3(1.0,0.55,0.35);
      ghostColors[4] = vec3(0.55,0.7,1.0);
      ghostColors[5] = vec3(1.0,0.92,0.65);
      ghostColors[6] = vec3(0.85,0.55,1.0);

      float ghostScales[7];
      ghostScales[0]=0.028; ghostScales[1]=0.018; ghostScales[2]=0.042;
      ghostScales[3]=0.022; ghostScales[4]=0.032; ghostScales[5]=0.016; ghostScales[6]=0.024;

      vec3 flare = vec3(0.0);

      // Main halo at light source: bright disc + soft outer glow
      float halo = circle(vUv, lp, 0.028, 0.012) * 0.95;
      float haloOuter = circle(vUv, lp, 0.065, 0.035) * 0.28;
      float haloRing = ring(vUv, lp, 0.045, 0.004, 0.006) * 0.22;
      vec3 haloCol = mix(lightColor, vec3(0.72,0.82,1.0), nightFactor*0.55);
      flare += haloCol * (halo*1.4 + haloOuter*0.9 + haloRing) * vis;

      // Ghosts
      for(int i=0;i<7;i++){
        vec2 gp = mix(lp, center, ghostOffsets[i]);
        // ghost position sways slightly with time for liveliness
        gp += vec2(sin(time*0.3 + float(i)*1.7)*0.0015, cos(time*0.25 + float(i)*0.9)*0.0012);
        float sz = ghostScales[i] * (0.9 + 0.15*sin(time*0.7 + float(i)));
        // brighter ghosts closer to center at night: cool vs warm
        vec3 gcol = ghostColors[i];
        gcol = mix(gcol, haloCol, 0.35);
        // night tints toward blue
        gcol = mix(gcol, vec3(0.62,0.72,1.0), nightFactor*0.45);
        float g = circle(vUv, gp, sz, sz*0.55);
        // anamorphic tint shift for chromatic feel
        float gR = circle(vUv, gp + vec2(0.0012, 0.0), sz, sz*0.55);
        float gB = circle(vUv, gp - vec2(0.0012, 0.0), sz, sz*0.55);
        vec3 ca = vec3(gR*1.0, g*0.95, gB*1.0);
        // distance attenuation: farther ghosts dimmer
        float distAtt = 1.0 - 0.35*abs(ghostOffsets[i]);
        flare += gcol * ca * 0.55 * distAtt * vis;
        // subtle ring for some ghosts
        if(i==2 || i==4){
          float r = ring(vUv, gp, sz*1.35, sz*0.18, sz*0.35) * 0.18 * vis;
          flare += gcol * r;
        }
      }

      // Anamorphic streaks: horizontal + slightly diagonal, intensity driven by brightness
      float streakH = 0.0;
      float dy = abs(vUv.y - lp.y);
      float dx = abs(vUv.x - lp.x);
      // horizontal streak across light
      float hWidth = 0.012 + nightFactor*0.004;
      float hLen = 0.44 * vis;
      streakH += (1.0 - smoothstep(0.0, hWidth, dy)) * (1.0 - smoothstep(0.0, hLen, dx)) * 0.22 * vis;
      // subtle second streak diagonal
      vec2 d2 = vUv - lp;
      float diag = abs(d2.y*0.6 - d2.x*0.25);
      streakH += (1.0 - smoothstep(0.0, 0.009, diag)) * (1.0 - smoothstep(0.0, 0.32, length(d2))) * 0.14 * vis * (0.7 + 0.3*sin(time*0.9));

      flare += haloCol * streakH * 1.2;

      // Lens dirt / rainbow speckles near center-light axis
      float dirt = 0.0;
      vec2 mid = mix(lp, center, 0.42);
      float dirtD = length(vUv - mid);
      dirt += exp(-dirtD*6.0) * 0.04 * sin(dirtD*34.0 - time*2.0) * vis;
      flare += vec3(0.9,0.82,0.66) * max(0.0, dirt) * 0.6;

      // Chromatic edge at screen border when looking toward light (vignette fringe)
      float vign = smoothstep(0.75, 0.32, length(vUv - vec2(0.5)));
      flare *= mix(1.0, 1.12, vign*0.35);

      // Blend additively, keep bloom-friendly (toneMapped false already in bloom)
      vec3 outCol = base.rgb + flare * (0.85 + nightFactor*0.25);

      // Very subtle lens color wash at night (moon: cool veil)
      outCol += vec3(0.12,0.16,0.28) * 0.04 * nightFactor * vis * (1.0 - length(vUv - lp));

      gl_FragColor = vec4(outCol, base.a);
    }
  `;

  const pass = new ShaderPass({ uniforms, vertexShader: vert, fragmentShader: frag });
  pass.enabled = true;
  pass.clear = false;

  function update({ lightPosition, lightColor, intensity, time, nightFactor }) {
    if (lightPosition) uniforms.lightPosition.value.copy(lightPosition);
    if (lightColor) uniforms.lightColor.value.copy(lightColor);
    uniforms.intensity.value = THREE.MathUtils.clamp(intensity ?? 0, 0, 1);
    uniforms.time.value = time ?? 0;
    uniforms.nightFactor.value = THREE.MathUtils.clamp(nightFactor ?? 0, 0, 1);
    // Low tier: reduce intensity slightly to save fill
    if (QUALITY.low) uniforms.intensity.value *= 0.7;
  }

  return { pass, uniforms, update };
}
