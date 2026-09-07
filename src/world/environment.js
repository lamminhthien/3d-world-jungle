// Dynamic day-night cycle + weather system (docs/weather-day-night-cycles.md).
//
// - Time: timeOfDay 0..24, 1 full day = dayLengthSec (default 600s).
// - Sun orbit: theta = ((t - 6) / 12) * PI  => 6h horizon, 12h zenith,
//   18h horizon, 0h nadir. Moon uses theta + PI on the same orbit.
// - Lighting / sky / fog colors are keyframed stops lerped with THREE.Color.lerp.
// - Weather: random state machine (clear / overcast / rain / fog) with smooth blend.
// - VFX: gradient skydome shader, stars, sun/moon billboards, rain particles.
// - Audio: tiny procedural WebAudio ambience (wind / rain / birds / crickets).
import * as THREE from 'three';
import { QUALITY } from '../core/setup.js';
import { getGraphics } from '../core/graphics.js';
import { createCozyMusic, MUSIC_TRACKS as COZY_TRACKS } from '../audio/cozy.js';
import { createSampledMusic, SAMPLED_TRACKS } from '../audio/sampledMusic.js';
import { windState, updateWind } from './wind.js';

// Prefer sampled jungle soundtrack if files present, else fall back to generative cozy
const MUSIC_TRACKS = SAMPLED_TRACKS.length ? SAMPLED_TRACKS : COZY_TRACKS;

export const WEATHERS = ['clear', 'partlyCloudy', 'overcast', 'mist', 'drizzle', 'rain', 'storm', 'fog'];
const WEATHER_LABEL = { clear: 'Clear', partlyCloudy: 'Partly Cloudy', overcast: 'Overcast', mist: 'Misty', drizzle: 'Drizzle', rain: 'Rain', storm: 'Storm', fog: 'Fog' };
const WEATHER_ICON = { clear: '☀️', partlyCloudy: '⛅', overcast: '☁️', mist: '🌫️', drizzle: '🌦️', rain: '🌧️', storm: '⛈️', fog: '🌁' };

// ---- Day keyframes (lerped) ----
// t: hour, sun: color/intensity (day star), sky top/bottom, fog, exposure, stars
const STOPS = [
  { t: 0,    sun: 0x8fb4ff, sunInt: 0.0,  hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
  { t: 4.5,  sun: 0x8fb4ff, sunInt: 0.0,  hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
  // SUNRISE — vivid orange/amber glow
  { t: 5.5,  sun: 0xff6600, sunInt: 0.55, hemiInt: 0.42, ambInt: 0.16, top: 0x3d2a6e, bot: 0xff7730, fog: 0xff8850, exp: 0.88, stars: 0.2 },
  { t: 6.5,  sun: 0xffb060, sunInt: 0.9,  hemiInt: 0.55, ambInt: 0.18, top: 0x4a6fa5, bot: 0xffa060, fog: 0xe8905a, exp: 0.95, stars: 0.0 },
  { t: 7,    sun: 0xffd9a8, sunInt: 1.1,  hemiInt: 0.6,  ambInt: 0.18, top: 0x3d9be9, bot: 0xcfeef7, fog: 0xb8ddef, exp: 1.0,  stars: 0.0 },
  { t: 9,    sun: 0xfff3e0, sunInt: 2.0,  hemiInt: 1.0,  ambInt: 0.25, top: 0x1f8fe8, bot: 0xa8ecff, fog: 0x9adcff, exp: 1.15, stars: 0.0 },
  { t: 15.5, sun: 0xfff3e0, sunInt: 2.0,  hemiInt: 1.0,  ambInt: 0.25, top: 0x1f8fe8, bot: 0xa8ecff, fog: 0x9adcff, exp: 1.15, stars: 0.0 },
  // GOLDEN HOUR
  { t: 16.5, sun: 0xffaa44, sunInt: 1.5,  hemiInt: 0.75, ambInt: 0.2,  top: 0x3a7bd5, bot: 0xffcc88, fog: 0xf0a866, exp: 1.05, stars: 0.0 },
  // SUNSET — deep amber top, vivid coral/orange bottom
  { t: 17.5, sun: 0xff5500, sunInt: 1.1,  hemiInt: 0.5,  ambInt: 0.16, top: 0x1e2d6e, bot: 0xff6a00, fog: 0xff7733, exp: 0.95, stars: 0.0 },
  { t: 18.2, sun: 0xff3355, sunInt: 0.5,  hemiInt: 0.38, ambInt: 0.13, top: 0x160d38, bot: 0xcc3322, fog: 0x7a3040, exp: 0.88, stars: 0.25 },
  { t: 19.0, sun: 0x8fb4ff, sunInt: 0.0,  hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
  { t: 24,   sun: 0x8fb4ff, sunInt: 0.0,  hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
];

// Weather modifiers applied on top of the time-of-day sample.
// fogNear/fogFar multipliers are tuned for the isometric ortho camera
// (camera sits ~60 units from the focus): even the densest 'fog' weather
// keeps the focus at ~30% fog, never full whiteout.
// Expanded to 8 weathers for a more vibrant lifecycle.
const WX = {
  clear:        { sun: 1.0,  hemi: 1.02, fogNear: 1.0,  fogFar: 1.0,  fogTint: 0xffffff, cloud: 0.55, rain: 0,    fogMul: 1.0, wet: 0,    windBoost: 0 },
  partlyCloudy: { sun: 0.88, hemi: 0.95, fogNear: 0.92, fogFar: 0.92, fogTint: 0xe8eef2, cloud: 0.9,  rain: 0,    fogMul: 1.0, wet: 0.05, windBoost: 0.1 },
  overcast:     { sun: 0.55, hemi: 0.8,  fogNear: 0.85, fogFar: 0.85, fogTint: 0xc9d2d6, cloud: 0.85, rain: 0,    fogMul: 1.0, wet: 0.15, windBoost: 0.15 },
  mist:         { sun: 0.68, hemi: 0.85, fogNear: 0.55, fogFar: 0.6,  fogTint: 0xdde7ea, cloud: 0.5,  rain: 0,    fogMul: 1.0, wet: 0.25, windBoost: 0 },
  drizzle:      { sun: 0.5,  hemi: 0.7,  fogNear: 0.8,  fogFar: 0.78, fogTint: 0xb8cbd6, cloud: 0.85, rain: 0.35, fogMul: 1.0, wet: 0.5,  windBoost: 0.1 },
  rain:         { sun: 0.32, hemi: 0.6,  fogNear: 0.75, fogFar: 0.7,  fogTint: 0x8fa3ad, cloud: 0.85, rain: 1,    fogMul: 1.0, wet: 1,    windBoost: 0.25 },
  storm:        { sun: 0.18, hemi: 0.45, fogNear: 0.65, fogFar: 0.62, fogTint: 0x6e8290, cloud: 0.95, rain: 1.2,  fogMul: 1.0, wet: 1,    windBoost: 0.55 },
  fog:          { sun: 0.7,  hemi: 0.85, fogNear: 0.6,  fogFar: 0.55, fogTint: 0xdde7ea, cloud: 0.4,  rain: 0,    fogMul: 1.0, wet: 0.3,  windBoost: -0.1 },
};

const _ca = new THREE.Color();
const _cb = new THREE.Color();

function sampleStops(t, out) {
  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i].t && t <= STOPS[i + 1].t) { a = STOPS[i]; b = STOPS[i + 1]; break; }
  }
  const span = Math.max(1e-4, b.t - a.t);
  const f = THREE.MathUtils.clamp((t - a.t) / span, 0, 1);
  out.sunColor.set(a.sun).lerp(_ca.set(b.sun), f);
  out.sunInt = THREE.MathUtils.lerp(a.sunInt, b.sunInt, f);
  out.hemiInt = THREE.MathUtils.lerp(a.hemiInt, b.hemiInt, f);
  out.ambInt = THREE.MathUtils.lerp(a.ambInt, b.ambInt, f);
  out.top.set(a.top).lerp(_ca.set(b.top), f);
  out.bot.set(a.bot).lerp(_ca.set(b.bot), f);
  out.fog.set(a.fog).lerp(_ca.set(b.fog), f);
  out.exp = THREE.MathUtils.lerp(a.exp, b.exp, f);
  out.stars = THREE.MathUtils.lerp(a.stars, b.stars, f);
  return out;
}

function mixWx(prev, next, blend, out) {
  const A = WX[prev] || WX.clear;
  const B = WX[next] || WX.clear;
  const o = out || {};
  for (const k of ['sun', 'hemi', 'fogNear', 'fogFar', 'cloud', 'rain', 'wet', 'windBoost']) o[k] = THREE.MathUtils.lerp(A[k], B[k], blend);
  (o.fogTint || (o.fogTint = new THREE.Color())).set(A.fogTint).lerp(_ca.set(B.fogTint), blend);
  return o;
}

function rollNextWeather(rng = Math.random) {
  const r = rng();
  // More vibrant distribution: 8 weathers with distinct odds
  if (r < 0.28) return 'clear';
  if (r < 0.42) return 'partlyCloudy';
  if (r < 0.56) return 'overcast';
  if (r < 0.66) return 'mist';
  if (r < 0.76) return 'drizzle';
  if (r < 0.86) return 'rain';
  if (r < 0.92) return 'storm';
  return 'fog';
}

// ---- Minimal procedural ambience (no assets, starts on user gesture) ----
function createAmbience() {
  let ctx = null;
  let windGain, rainGain, master, musicBus, sfxBus;
  let cozy = null;
  let chirpTimer = 0;
  let crackleTimer = 0;
  let enabled = false;
  let musicOn = true;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return false; }
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    // Looped noise buffer shared by wind + rain.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.7;
    sfxBus.connect(master);

    const mkLoop = (freq, q, gain0) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain0;
      src.connect(f).connect(g).connect(sfxBus);
      src.start();
      return g;
    };
    windGain = mkLoop(400, 0.6, 0.03);
    rainGain = mkLoop(4000, 0.4, 0.0);
    // Jungle soundtrack: sampled mp3/ogg if available, else generative cozy fallback.
    // Both sit on their own sub-bus so melody stays under wind/rain/critters.
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.7;
    musicBus.connect(master);
    if (SAMPLED_TRACKS.length) {
      try {
        cozy = createSampledMusic(ctx, musicBus);
        cozy.setMuted(!musicOn);
        cozy.onTrackChange(() => syncMusicBtn());
        syncMusicBtn();
        // Auto-play after gesture — sampled needs explicit play
        if (musicOn) cozy.tryPlay?.();
      } catch (e) {
        console.warn('[ambience] sampled music failed, falling back to cozy', e);
        cozy = createCozyMusic(ctx, musicBus);
        cozy.setMuted(!musicOn);
        cozy.onTrackChange(() => syncMusicBtn());
        syncMusicBtn();
      }
    } else {
      cozy = createCozyMusic(ctx, musicBus);
      cozy.setMuted(!musicOn);
      cozy.onTrackChange(() => syncMusicBtn());
      syncMusicBtn();
    }
    return true;
  }

  function blip(freq, t0, dur, vol, slideTo) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(1e-4, t0 + dur);
    o.connect(g).connect(sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // HUD button labels live in buildHud's closure; these sync helpers update
  // them if the buttons exist yet (safe to call before the HUD is built).
  function syncMuteBtn() {
    const b = document.getElementById('env-mute');
    if (b) b.textContent = enabled ? '🔊' : '🔇';
  }
  function syncMusicBtn() {
    const b = document.getElementById('env-music');
    const trackSelect = document.getElementById('env-music-track');
    const track = cozy?.getCurrentTrack ? cozy.getCurrentTrack() : null;
    if (trackSelect && track) trackSelect.value = track.id;
    if (b) {
      b.textContent = '🎵';
      b.classList.toggle('off', !musicOn);
      const trackInfo = track ? ` [${track.name}]` : '';
      const artistInfo = track?.artist ? ` — ${track.artist}` : '';
      b.title = musicOn
        ? `Music: On${trackInfo}${artistInfo} (Click to mute)`
        : 'Music: Off (Click to unmute)';
    }
  }

  let thunderTimer = 5 + Math.random() * 8;
  let frogTimer = 3 + Math.random() * 4;
  // dt-driven critter scheduler: birds by day, crickets by night,
  // campfire crackle when the player camps nearby + frogs after rain + thunder.
  function update(dt, { isNight, rain, fire = 0, weather = 'clear', timeOfDay = 12 }) {
    if (!ctx || !enabled) return;
    // Generative cozy music sits alongside the wind/rain/critters.
    if (cozy) cozy.update(dt, { isNight, rain });
    // Wind audio now follows visual windStrength + rain gust
    const windBase = windState.strength * 0.07;
    windGain.gain.value += ((rain > 0.5 ? 0.05 + windBase : 0.02 + windBase) - windGain.gain.value) * Math.min(1, dt * 2);
    rainGain.gain.value += (rain * 0.14 - rainGain.gain.value) * Math.min(1, dt * 2);
    chirpTimer -= dt;
    if (chirpTimer <= 0) {
      const t0 = ctx.currentTime + 0.05;
      const isDawn = timeOfDay >= 5 && timeOfDay < 7;
      const isDusk = timeOfDay >= 18 && timeOfDay < 20;
      if (isNight) {
        // Night: crickets + soft owl hoot occasionally
        if (Math.random() < 0.12) {
          blip(320, t0, 0.5, 0.045, 280);
          blip(380, t0 + 0.3, 0.45, 0.04, 340);
          chirpTimer = 4 + Math.random() * 5;
        } else {
          for (let k = 0; k < 3; k++) blip(4200, t0 + k * 0.09, 0.05, 0.03);
          chirpTimer = 1.5 + Math.random() * 3;
        }
      } else if (isDawn) {
        // Dawn chorus: rich multi-bird warble
        const f = 1800 + Math.random() * 1400;
        blip(f, t0, 0.15, 0.055, f * 1.3);
        blip(f * 1.25, t0 + 0.12, 0.12, 0.045, f * 1.1);
        blip(f * 0.8, t0 + 0.26, 0.1, 0.035);
        chirpTimer = 0.9 + Math.random() * 1.8;
      } else if (isDusk) {
        // Dusk: crickets starting + evening birds
        blip(2600, t0, 0.1, 0.035, 2100);
        chirpTimer = 1.2 + Math.random() * 2.5;
      } else if (rain < 0.5) {
        const f = 2200 + Math.random() * 1200;
        blip(f, t0, 0.12, 0.05, f * 1.4);
        blip(f * 1.1, t0 + 0.16, 0.1, 0.04, f * 0.9);
        chirpTimer = 2 + Math.random() * 5;
      } else {
        chirpTimer = 2;
      }
    }
    // Frogs after rain / mist near river (especially dawn/dusk)
    frogTimer -= dt;
    if ((weather === 'rain' || weather === 'drizzle' || weather === 'mist') && frogTimer <= 0) {
      const t0 = ctx.currentTime + 0.05;
      const base = 180 + Math.random() * 80;
      blip(base, t0, 0.25, 0.05, base * 0.85);
      blip(base * 1.15, t0 + 0.32, 0.22, 0.04, base * 1.0);
      frogTimer = 2.5 + Math.random() * 4;
    } else if (frogTimer <= -10) frogTimer = 3;
    // Thunder rumble during storm
    thunderTimer -= dt;
    if (weather === 'storm' && thunderTimer <= 0) {
      const t0 = ctx.currentTime + 0.05;
      // Low rumble: stacked sine blips at 60-120Hz
      for (let k = 0; k < 3; k++) blip(65 + k * 22, t0 + k * 0.15, 0.9, 0.07, 45);
      blip(140, t0 + 0.6, 0.4, 0.03, 90);
      thunderTimer = 6 + Math.random() * 10;
    }
    // Fire crackle: short sharp pops, rate + volume scale with proximity.
    crackleTimer -= dt;
    if (fire > 0.02 && crackleTimer <= 0) {
      const t0 = ctx.currentTime + 0.02;
      const pops = 1 + ((Math.random() * 3) | 0);
      for (let k = 0; k < pops; k++) {
        const f = 700 + Math.random() * 2600;
        blip(f, t0 + k * (0.02 + Math.random() * 0.04), 0.03 + Math.random() * 0.03, (0.015 + Math.random() * 0.04) * fire, f * 0.6);
      }
      crackleTimer = 0.08 + Math.random() * 0.5 * (1.2 - fire);
    }
  }

  return {
    get enabled() { return enabled; },
    get musicOn() { return musicOn; },
    enable() {
      enabled = true;
      if (ensure() && master) {
        master.gain.value = 0.8;
        if (musicOn) cozy?.tryPlay?.();
      } else enabled = false;
      syncMuteBtn();
      return enabled;
    },
    toggle() {
      enabled = !enabled;
      if (enabled) enabled = ensure();
      if (master) master.gain.value = enabled ? 0.8 : 0.0;
      syncMuteBtn();
      return enabled;
    },
    toggleMusic() {
      musicOn = !musicOn;
      if (cozy) {
        cozy.setMuted(!musicOn);
        if (musicOn) cozy.tryPlay?.();
      }
      syncMusicBtn();
      return musicOn;
    },
    nextMusicTrack() {
      if (cozy) {
        const next = cozy.nextTrack();
        syncMusicBtn();
        return next;
      }
      return null;
    },
    setMusicTrack(id) {
      if (cozy) {
        const track = cozy.setTrack(id);
        syncMusicBtn();
        return track;
      }
      return null;
    },
    getMusicTracks() {
      return cozy?.getTracks ? cozy.getTracks() : MUSIC_TRACKS.map((track) => ({ ...track }));
    },
    setMusicVolume(v) {
      if (musicBus) musicBus.gain.value = v;
    },
    setSfxVolume(v) {
      if (sfxBus) sfxBus.gain.value = v;
    },
    getCurrentTrack() {
      return cozy?.getCurrentTrack ? cozy.getCurrentTrack() : null;
    },
    update,
  };
}

export function createEnvironment(scene, opts = {}) {
  const {
    sun = null, hemi = null, ambient = null, renderer = null,
    clouds = null, river = null,
    dayLengthSec = 600, startTime = 10.0, weatherIntervalSec = 75,
    fogNear = 80, fogFar = 160,
  } = opts;

  const state = {
    timeOfDay: startTime, paused: false, speed: 1,
    weather: 'clear', prevWeather: 'clear', blend: 1,
    weatherTimer: weatherIntervalSec, wetness: 0,
    nightFactor: 0, isNight: false,
    dayLengthSec, weatherIntervalSec, fogNear, fogFar,
  };

  const sample = {
    sunColor: new THREE.Color(), sunInt: 1, hemiInt: 1, ambInt: 0.2,
    top: new THREE.Color(), bot: new THREE.Color(), fog: new THREE.Color(),
    exp: 1, stars: 0,
  };

  // ---- Skydome (gradient shader, follows the camera focus) ----
  // Low tier: fewer segments (160-radius sphere is mostly off-screen anyway).
  const skySeg = QUALITY.low ? [12, 8] : [24, 16];  const skyUniforms = {
    topColor: { value: new THREE.Color(0x2f9de4) },
    bottomColor: { value: new THREE.Color(0xbfe9f5) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff3e0) },
    sunGlow: { value: 0.6 },
  };
  const skydome = new THREE.Mesh(
    new THREE.SphereGeometry(160, skySeg[0], skySeg[1]),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 bottomColor;
        uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -1.0, 1.0);
          vec3 col = mix(bottomColor, topColor, pow(max(h, 0.0), 0.55));
          col = mix(col, bottomColor * 0.92, smoothstep(0.0, -0.4, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 350.0) * 1.4 + pow(s, 12.0) * 0.35 * sunGlow);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  skydome.frustumCulled = false;
  skydome.renderOrder = -10;
  scene.add(skydome);

  // ---- Stars (fade in at night) ----
  const STAR_N = 500;
  const starPos = new Float32Array(STAR_N * 3);
  for (let i = 0; i < STAR_N; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = Math.random() * Math.PI * 0.48 + 0.03;
    const r = 145;
    starPos[i * 3] = Math.cos(a) * Math.cos(e) * r;
    starPos[i * 3 + 1] = Math.sin(e) * r;
    starPos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xcfe0ff, size: 0.9, sizeAttenuation: false,
    transparent: true, opacity: 0, depthWrite: false, fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -9;
  scene.add(stars);

  // ---- Sun + moon billboards ----
  const sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(4, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false, transparent: true, opacity: 0.95, toneMapped: false }),
  );
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xdce8ff, fog: false, transparent: true, opacity: 0.9, toneMapped: false }),
  );
  sunMesh.frustumCulled = moonMesh.frustumCulled = false;
  scene.add(sunMesh); scene.add(moonMesh);
  // Moon halo: additive glow shell for a misty moon-shaft look at night.
  const moonHalo = new THREE.Mesh(
    new THREE.SphereGeometry(5.4, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xa1c4fd, fog: false, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    }),
  );
  moonHalo.frustumCulled = false;
  scene.add(moonHalo);

  // ---- Moonlight (doc section 2: icy-blue #a1c4fd, 180° opposite the sun) ----
  // The moon owns the shadow pass at night. It is mutually exclusive with the
  // sun shadow pass, so desktop keeps real moon shadows without paying for two
  // shadow maps in the same frame. Low-tier devices retain the cheaper glow
  // fallback because a second shadow pass is too expensive there.
  const moonLight = new THREE.DirectionalLight(0xa1c4fd, 0);
  moonLight.castShadow = false;
  moonLight.shadow.mapSize.set(QUALITY.shadowSize, QUALITY.shadowSize);
  moonLight.shadow.camera.left = -30;
  moonLight.shadow.camera.right = 30;
  moonLight.shadow.camera.top = 30;
  moonLight.shadow.camera.bottom = -30;
  moonLight.shadow.camera.near = 1;
  moonLight.shadow.camera.far = 130;
  moonLight.shadow.bias = -0.0008;
  moonLight.shadow.normalBias = 0.015;
  scene.add(moonLight); scene.add(moonLight.target);

  // ---- Rain particles (box around focus, wraps) ----
  // Lower density + size so the iso view never whites out.
  // Low tier halves the count (CPU sim + point overdraw both cost).
  // Graphics particles scales count; Apple Silicon can handle full 450.
  const RAIN_N_BASE = QUALITY.low ? 200 : 450;
  const RAIN_N = (() => {
    try { const g = getGraphics(); if (g?.rain === false) return 0; return Math.max(0, Math.round(RAIN_N_BASE * (g?.particles ?? 1))); } catch { return RAIN_N_BASE; }
  })();
  const RAIN_BOX = 36;
  const RAIN_H = 18;
  const rainPos = new Float32Array(RAIN_N * 3);
  const rainVel = new Float32Array(RAIN_N);
  for (let i = 0; i < RAIN_N; i++) {
    rainPos[i * 3] = (Math.random() - 0.5) * RAIN_BOX;
    rainPos[i * 3 + 1] = Math.random() * RAIN_H;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX;
    rainVel[i] = 14 + Math.random() * 8;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainMat = new THREE.PointsMaterial({
    color: 0xaec6d8, size: 0.12, transparent: true, opacity: 0,
    depthWrite: false,
  });
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.frustumCulled = false;
  rain.visible = false;
  scene.add(rain);

  // ---- Vibrant time-specific beauties ----
  // Rainbow: curved tube that appears after rain when sun is opposite rain direction. Cheap tube with 7 colors.
  let rainbow = null;
  let rainbowMat = null;
  try {
    const arcPts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const ang = Math.PI * t; // semicircle
      const r = 32;
      arcPts.push(new THREE.Vector3(Math.cos(ang) * r * 0.55, Math.sin(ang) * 14 + 6, -18 - t * 4));
    }
    const curve = new THREE.CatmullRomCurve3(arcPts);
    const rainbowGeo = new THREE.TubeGeometry(curve, 24, 0.9, 6, false);
    const rainbowColors = [];
    const c = new THREE.Color();
    const palette = [0xff0000, 0xff7f00, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0x8b00ff];
    const posAttr = rainbowGeo.attributes.position;
    const count = posAttr.count;
    const radialSeg = 6;
    for (let i = 0; i < count; i++) {
      const tubeIdx = i % (radialSeg + 1);
      const t = tubeIdx / radialSeg;
      const idx = Math.min(palette.length - 1, Math.floor(t * palette.length));
      c.setHex(palette[idx]);
      rainbowColors.push(c.r, c.g, c.b);
    }
    rainbowGeo.setAttribute('color', new THREE.Float32BufferAttribute(rainbowColors, 3));
    rainbowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, side: THREE.DoubleSide, fog: false, depthWrite: false });
    rainbow = new THREE.Mesh(rainbowGeo, rainbowMat);
    rainbow.frustumCulled = false;
    rainbow.visible = false;
    rainbow.renderOrder = -5;
    scene.add(rainbow);
  } catch { /* rainbow fallback: skip */ }

  // Aurora borealis: shimmering plane at northern sky, visible on clear nights 22-03
  let aurora = null;
  let auroraMat = null;
  try {
    const auroraGeo = new THREE.PlaneGeometry(120, 28, 24, 6);
    auroraMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; vec3 p=position; p.y += sin(uv.x*6.0)*1.2; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
      fragmentShader: `
        uniform float uTime; uniform float uOpacity; varying vec2 vUv;
        void main(){
          float wave = sin(vUv.x*8.0 + uTime*0.6)*0.5 + sin(vUv.x*3.0 - uTime*0.3)*0.3;
          float band = smoothstep(0.35, 0.55, vUv.y + wave*0.12) * smoothstep(1.0, 0.65, vUv.y + wave*0.12);
          vec3 c1 = vec3(0.1, 0.9, 0.55); vec3 c2 = vec3(0.2, 0.45, 1.0); vec3 c3 = vec3(0.9, 0.3, 0.9);
          float t = fract(vUv.x*0.7 + uTime*0.05);
          vec3 col = mix(mix(c1,c2, smoothstep(0.0,0.5,t)), c3, smoothstep(0.5,1.0,t));
          float a = band * 0.55 * uOpacity * (0.7 + 0.3*sin(uTime*1.2 + vUv.x*10.0));
          gl_FragColor = vec4(col, a);
        }`,
    });
    aurora = new THREE.Mesh(auroraGeo, auroraMat);
    aurora.position.set(0, 42, -55);
    aurora.rotation.x = 0.18;
    aurora.frustumCulled = false;
    aurora.visible = true;
    aurora.renderOrder = -6;
    scene.add(aurora);
  } catch { /* aurora skip on low */ }

  // Pollen / dust motes: floating golden specks visible in sunbeams (10-17, clear/partlyCloudy)
  const POLLEN_N = QUALITY.low ? 0 : 120;
  const pollenPos = POLLEN_N ? new Float32Array(POLLEN_N * 3) : null;
  const pollenPhase = POLLEN_N ? new Float32Array(POLLEN_N) : null;
  let pollen = null; let pollenMat = null; let pollenGeo = null;
  if (POLLEN_N && pollenPos) {
    for (let i = 0; i < POLLEN_N; i++) {
      pollenPos[i * 3] = (Math.random() - 0.5) * 44;
      pollenPos[i * 3 + 1] = 1 + Math.random() * 7;
      pollenPos[i * 3 + 2] = (Math.random() - 0.5) * 44;
      pollenPhase[i] = Math.random() * Math.PI * 2;
    }
    pollenGeo = new THREE.BufferGeometry();
    pollenGeo.setAttribute('position', new THREE.BufferAttribute(pollenPos, 3));
    pollenMat = new THREE.PointsMaterial({ color: 0xffe9a8, size: 0.18, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    pollen = new THREE.Points(pollenGeo, pollenMat);
    pollen.frustumCulled = false;
    pollen.visible = true;
    scene.add(pollen);
  }

  // Shooting stars: occasional streaks at night (clear). Reuses a single Points with trail.
  const SHOOT_N = QUALITY.low ? 0 : 1;
  let shootingStar = null; let shootingMat = null; let shootTimer = 8 + Math.random() * 10; let shootActive = 0; let shootDir = new THREE.Vector3();
  if (SHOOT_N) {
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(12 * 3); // 12 points trail
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    shootingMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.9, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    shootingStar = new THREE.Points(sg, shootingMat);
    shootingStar.frustumCulled = false;
    shootingStar.visible = false;
    scene.add(shootingStar);
    shootDir.set(-0.8, -0.35, 0.15).normalize();
  }

  // Lightning flash: full-screen white overlay + sun intensity spike for storm
  let lightningOverlay = document.getElementById('lightning-overlay');
  if (!lightningOverlay) {
    lightningOverlay = document.createElement('div');
    lightningOverlay.id = 'lightning-overlay';
    lightningOverlay.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:5;transition:opacity 0.08s;';
    document.body.appendChild(lightningOverlay);
  }
  let lightningTimer = 3 + Math.random() * 5;
  let lightningFlash = 0;

  // Dew / mist particles at dawn (5-7, mist/fog): ground-hugging sparkles
  const DEW_N = QUALITY.low ? 0 : 80;
  const dewPos = DEW_N ? new Float32Array(DEW_N * 3) : null;
  let dew = null; let dewMat = null; let dewGeo = null;
  if (DEW_N && dewPos) {
    for (let i = 0; i < DEW_N; i++) {
      dewPos[i * 3] = (Math.random() - 0.5) * 40;
      dewPos[i * 3 + 1] = 0.08 + Math.random() * 0.35;
      dewPos[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }
    dewGeo = new THREE.BufferGeometry();
    dewGeo.setAttribute('position', new THREE.BufferAttribute(dewPos, 3));
    dewMat = new THREE.PointsMaterial({ color: 0xcff0ff, size: 0.22, transparent: true, opacity: 0, depthWrite: false });
    dew = new THREE.Points(dewGeo, dewMat);
    dew.frustumCulled = false;
    dew.visible = true;
    scene.add(dew);
  }

  // Cloud material (shared across puffs) for overcast tinting.
  let cloudMat = null;
  if (clouds?.clouds?.length) {
    clouds.clouds[0].traverse?.((o) => { if (!cloudMat && o.isMesh) cloudMat = o.material; });
  }
  const cloudBaseColor = cloudMat ? cloudMat.color.clone() : new THREE.Color(0xffffff);
  const waterMat = river?.water?.material || null;
  const waterBase = waterMat ? { color: waterMat.color.clone(), rough: waterMat.roughness, metal: waterMat.metalness } : null;

  const ambience = createAmbience();

  // ---- HUD ----
  let barEl, timeEl, wxEl;
  function buildHud() {
    let root = document.getElementById('envbar');
    if (!root) {
      root = document.createElement('div');
      root.id = 'envbar';
      // Dock into the ☰ dropdown menu (fallback: legacy #hud position).
      document.getElementById('menuEnvSlot')?.appendChild(root)
        ?? document.getElementById('hud')?.appendChild(root);
    }
    root.innerHTML = `
      <span id="env-time">☀️ 10:00</span>
      <span id="env-wx">☀️ Clear</span>
      <div class="env-btns">
        <input type="time" id="env-time-input" style="border: 1px solid #c8e6c9; border-radius: 8px; padding: 2px 4px; font-size: 12px; font-weight: 600; color: #33691e; background: #fff; outline: none; cursor: pointer;">
        <button id="env-pause" title="Pause / resume time">⏸</button>
        <button id="env-skip" title="Jump to morning / night">⏭</button>
        <button id="env-wxbtn" title="Change weather">🌧️</button>
        <select id="env-music-track" title="Choose music track" aria-label="Choose music track">
          ${MUSIC_TRACKS.map((track) => `<option value="${track.id}">${track.name}</option>`).join('')}
        </select>
        <button id="env-next-music" title="Change music">⏭️</button>
        <button id="env-music" title="Mute music">🎵</button>
        <button id="env-mute" title="Ambient sound">🔇</button>
        <div class="env-vol-ctrl" style="display: inline-flex; align-items: center; gap: 4px; margin-left: 8px; font-size: 11px; color: #33691e; font-weight: 600;">
          <span>🎵</span><input type="range" id="env-vol-music" min="0" max="1" step="0.05" value="0.7" style="width: 50px; cursor: pointer;">
          <span>🔊</span><input type="range" id="env-vol-sfx" min="0" max="1" step="0.05" value="0.7" style="width: 50px; cursor: pointer;">
        </div>
      </div>`;
    timeEl = root.querySelector('#env-time');
    wxEl = root.querySelector('#env-wx');
    const timeInput = root.querySelector('#env-time-input');
    const pauseBtn = root.querySelector('#env-pause');
    const skipBtn = root.querySelector('#env-skip');
    const wxBtn = root.querySelector('#env-wxbtn');
    const trackSelect = root.querySelector('#env-music-track');
    const nextMusicBtn = root.querySelector('#env-next-music');
    const muteBtn = root.querySelector('#env-mute');
    const musicBtn = root.querySelector('#env-music');
    const volMusic = root.querySelector('#env-vol-music');
    const volSfx = root.querySelector('#env-vol-sfx');

    timeInput.onchange = (e) => {
      const [h, m] = e.target.value.split(':').map(Number);
      api.setTime(h + m / 60);
    };
    timeInput.value = fmtTime(state.timeOfDay);

    pauseBtn.onclick = () => {
      state.paused = !state.paused;
      pauseBtn.textContent = state.paused ? '▶️' : '⏸';
    };
    skipBtn.onclick = () => {
      // Jump to next 6h mark (morning <-> evening) for a quick demo.
      state.timeOfDay = state.timeOfDay < 12 ? 18.2 : 7.5;
    };
    wxBtn.onclick = () => {
      const i = WEATHERS.indexOf(state.weather);
      api.setWeather(WEATHERS[(i + 1) % WEATHERS.length]);
    };
    if (trackSelect) {
      trackSelect.onchange = (e) => {
        if (!ambience.enabled) ambience.enable();
        ambience.setMusicTrack(e.target.value);
      };
    }
    if (nextMusicBtn) {
      nextMusicBtn.onclick = () => {
        if (!ambience.enabled) ambience.enable();
        ambience.nextMusicTrack();
      };
    }
    muteBtn.onclick = () => {
      const on = ambience.toggle();
      muteBtn.textContent = on ? '🔊' : '🔇';
    };
    if (musicBtn) {
      musicBtn.onclick = () => {
        // Lazily unlock audio on first click (autoplay policy)
        if (!ambience.enabled) ambience.enable();
        ambience.toggleMusic();
      };
    }
    if (volMusic) volMusic.oninput = (e) => ambience.setMusicVolume(parseFloat(e.target.value));
    if (volSfx) volSfx.oninput = (e) => ambience.setSfxVolume(parseFloat(e.target.value));
    // First click anywhere unlocks audio if the user enabled it — nothing to do
    // until toggle; AudioContext is created lazily inside toggle().
  }
  buildHud();

  // ---- Sunset / sunrise CSS overlay (zero GPU cost, pure CSS) ----
  // A radial gradient div that fades in when sun is near the horizon,
  // giving a warm orange god-ray bleed over the screen.
  let sunsetOverlay = document.getElementById('sunset-overlay');
  if (!sunsetOverlay) {
    sunsetOverlay = document.createElement('div');
    sunsetOverlay.id = 'sunset-overlay';
    document.body.appendChild(sunsetOverlay);
  }

  function fmtTime(t) {
    const h = Math.floor(t) % 24;
    const m = Math.floor((t - Math.floor(t)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  function phaseIcon(t) {
    if (t >= 5 && t < 8) return '🌅';
    if (t >= 8 && t < 16) return '☀️';
    if (t >= 16 && t < 19) return '🌇';
    return '🌙';
  }

  const ORBIT_R = 60;
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const focusV = new THREE.Vector3();
  const wxMix = {};
  const moonTint = new THREE.Color(0xdce8ff);
  let hudAcc = 1;
  // Shadow depth pass over ~10k instanced veg costs every frame. At night the
  // sun intensity is 0 so its shadows are invisible — park the shadow map too,
  // but ONLY on day/night flips: toggling castShadow rebuilds all lit shader
  // programs, so per-frame toggling would itself hitch every frame.
  let lastIsDay = true;

  const api = {
    state,
    ambience,
    // Exposed for volumetric / lens flare screen projection
    get sunMesh() { return sunMesh; },
    get moonMesh() { return moonMesh; },
    get sunDirVec() { return sunDir.clone(); },
    get moonDirVec() { return moonDir.clone(); },
    get sunColorVec() { return sample.sunColor.clone(); },
    get timeOfDay() { return state.timeOfDay; },
    get weather() { return state.weather; },
    get nightFactor() { return state.nightFactor || 0; },
    get isNight() { return !!state.isNight; },
    setTime(h) { state.timeOfDay = ((h % 24) + 24) % 24; },
    setWeather(w) {
      if (!WEATHERS.includes(w) || w === state.weather) return;
      state.prevWeather = state.blend < 1 ? state.prevWeather : state.weather;
      // If mid-transition, keep blending from current mix: restart blend.
      state.weather = w;
      state.blend = 0;
      state.weatherTimer = state.weatherIntervalSec;
    },
    cycleWeather() {
      const i = WEATHERS.indexOf(state.weather);
      api.setWeather(WEATHERS[(i + 1) % WEATHERS.length]);
    },

    update(dt, focus, extra = {}) {
      // Phase 5: global wind (affects foliage sway, water, clouds, audio)
      updateWind(dt, state.weather);
      // Debug / tuning handle (e.g. `__env.setTime(0)` in the console).      // --- advance clock + weather machine ---
      if (!state.paused) state.timeOfDay = (state.timeOfDay + (dt * state.speed * 24) / state.dayLengthSec) % 24;
      state.blend = Math.min(1, state.blend + dt / 6); // ~6s crossfade
      if (!state.paused) {
        state.weatherTimer -= dt;
        if (state.weatherTimer <= 0) {
          api.setWeather(rollNextWeather());
        }
      }
      const wx = mixWx(state.prevWeather, state.weather, state.blend, wxMix);
      state.wetness += (wx.wet - state.wetness) * Math.min(1, dt * (wx.wet > state.wetness ? 0.5 : 0.08));

      if (focus) focusV.set(focus.x, 0, focus.z);
      else focusV.set(0, 0, 0);

      // --- sun / moon orbit ---
      const theta = ((state.timeOfDay - 6) / 12) * Math.PI;
      sunDir.set(Math.cos(theta), Math.sin(theta), 0.35).normalize();
      moonDir.copy(sunDir).multiplyScalar(-1);
      const isDay = sunDir.y > -0.06;

      sampleStops(state.timeOfDay, sample);

      // Night dimming of fog distance + weather multiplier.
      const nightFogMul = THREE.MathUtils.lerp(0.9, 1.0, THREE.MathUtils.clamp(sunDir.y * 3 + 0.5, 0, 1));

      // --- lights ---
      if (sun) {
        if (isDay !== lastIsDay) {
          lastIsDay = isDay;
          // Transfer the single shadow pass between the sun and moon. This
          // keeps the scene lit/shadowed in both halves of the day cycle.
          if (QUALITY.low) sun.castShadow = false;
          else sun.castShadow = isDay;
          moonLight.castShadow = !isDay && QUALITY.shadowsEnabled;
        }
        if (isDay) {
          sun.color.copy(sample.sunColor).lerp(_ca.set(wx.fogTint), 1 - wx.sun * 0.5 - 0.25);
          sun.intensity = sample.sunInt * wx.sun;
          sun.position.set(focusV.x + sunDir.x * ORBIT_R, Math.max(4, focusV.y + sunDir.y * ORBIT_R), focusV.z + sunDir.z * ORBIT_R);
        } else {
          // Park the sun below the horizon so shadows don't flip weirdly;
          // the moon light takes over.
          sun.intensity = 0;
          sun.position.set(focusV.x, 2, focusV.z);
        }
        sun.target.position.copy(focusV);
        sun.target.updateMatrixWorld();
      }
      // Moonlight: the main night source — kept bright enough to play by.
      // Icy pale-blue per doc (#a1c4fd), mirrored 180° from the sun.
      const nightF = THREE.MathUtils.clamp(-sunDir.y * 2.2, 0, 1);
      state.nightFactor = nightF;
      state.isNight = !isDay;
      moonLight.color.setHex(0xa1c4fd);
      moonLight.intensity = nightF * 1.55 * (0.55 + 0.45 * wx.sun);
      moonLight.position.set(focusV.x + moonDir.x * ORBIT_R, Math.max(6, moonDir.y * ORBIT_R), focusV.z + moonDir.z * ORBIT_R);
      moonLight.target.position.copy(focusV);
      moonLight.target.updateMatrixWorld();

      if (hemi) {
        hemi.intensity = Math.max(sample.hemiInt * wx.hemi, 0.3);
        // Cool moonlit tint at night, neutral daylight by day.
        hemi.color.setHex(0xcdeffd).lerp(_ca.setHex(0x8fb4ff), nightF * 0.7);
      }
      if (ambient) ambient.intensity = Math.max(sample.ambInt, 0.15);
      if (renderer) {
        // High/ultra caps exposure 15% lower — matches the lower bloom threshold fix for M4 XDR.
        const t = QUALITY.tier;
        const expMul = t === 'high' || t === 'ultra' ? 0.85 : t === 'medium' ? 0.92 : 1.0;
        renderer.toneMappingExposure = sample.exp * expMul;
      }

      // --- sky / fog / background ---
      // Ease off the fogTint lerp to avoid washing out the whole screen.
      _cb.copy(sample.fog).lerp(wx.fogTint, state.weather === 'clear' ? 0 : 0.22);
      if (scene.fog) {
        scene.fog.color.copy(_cb);
        scene.fog.near = state.fogNear * wx.fogNear;
        scene.fog.far = state.fogFar * wx.fogFar * nightFogMul;
        // Guard: far must stay > near + margin, otherwise whiteout.
        if (scene.fog.far < scene.fog.near + 30) scene.fog.far = scene.fog.near + 30;
      }
      if (scene.background?.isColor) scene.background.copy(_cb);
      skyUniforms.topColor.value.copy(sample.top).lerp(_ca.set(wx.fogTint), state.weather === 'clear' ? 0 : 0.25);
      skyUniforms.bottomColor.value.copy(sample.bot).lerp(_ca.set(wx.fogTint), state.weather === 'clear' ? 0 : 0.25);
      skyUniforms.sunDir.value.copy(isDay ? sunDir : moonDir);
      skyUniforms.sunColor.value.copy(isDay ? sample.sunColor : moonTint);
      skyUniforms.sunGlow.value = isDay ? 0.6 * wx.sun + 0.15 : 0.25;
      skydome.position.copy(focusV);
      stars.position.copy(focusV);
      starMat.opacity = sample.stars * (1 - wx.rain * 0.9) * (state.weather === 'fog' ? 0.15 : 1);

      sunMesh.position.set(focusV.x + sunDir.x * 130, sunDir.y * 130, focusV.z + sunDir.z * 130);
      sunMesh.visible = sunDir.y > -0.08;
      sunMesh.material.opacity = THREE.MathUtils.clamp(sunDir.y * 4 + 0.4, 0, 0.95);
      // Horizon glow: sun grows dramatically near sunrise/sunset
      const horizonProx = THREE.MathUtils.clamp(1 - Math.abs(sunDir.y) * 6, 0, 1);
      const sunScale = 1 + horizonProx * 2.5;
      sunMesh.scale.setScalar(sunScale);
      sunMesh.material.color.setHex(horizonProx > 0.3 ? 0xff6600 : 0xfff6d8);

      moonMesh.position.set(focusV.x + moonDir.x * 130, moonDir.y * 130, focusV.z + moonDir.z * 130);
      moonMesh.visible = moonDir.y > -0.05;
      // Overcast / rain veils the moon; drifting clouds cross it for an
      // occluded-moon illusion (doc section 3: hazy veiled moon).
      const veil = (1 - wx.rain * 0.7) * (state.weather === 'overcast' ? 0.55 : 1) * (state.weather === 'fog' ? 0.3 : 1);
      // A restrained pulse keeps the moon from reading as a flat billboard,
      // while the actual directional light remains stable enough for shadows.
      const moonPulse = 0.94 + 0.06 * Math.sin(performance.now() * 0.0014);
      moonMesh.material.opacity = THREE.MathUtils.clamp(moonDir.y * 4 + 0.3, 0, 0.9) * veil * moonPulse;
      moonHalo.position.copy(moonMesh.position);
      moonHalo.visible = moonMesh.visible;
      moonHalo.material.opacity = nightF * (0.18 + moonPulse * 0.04) * veil;
      moonHalo.scale.setScalar(1 + (1 - moonPulse) * 0.3);

      // --- Sunset CSS overlay: warm orange radial glow near horizon ---
      if (sunsetOverlay) {
        // Intensity: max when sun is at horizon ±15° (|sunDir.y| < 0.26)
        const isSunset = state.timeOfDay > 14 && state.timeOfDay < 21;
        const isSunrise = state.timeOfDay > 4 && state.timeOfDay < 9;
        const overlayIntensity = (isSunset || isSunrise)
          ? THREE.MathUtils.clamp(1 - Math.abs(sunDir.y) * 4.5, 0, 1) * 0.55 * wx.sun
          : 0;
        sunsetOverlay.style.opacity = overlayIntensity.toFixed(3);
      }

      // --- clouds: thicker + grayer when overcast/rain, dark blue-grey at night ---
      if (cloudMat) {
        cloudMat.color.copy(cloudBaseColor).lerp(_ca.set(wx.fogTint), state.weather === 'clear' ? 0 : 0.35);
        // Night tint (doc section 3): white/pink day -> somber blue-grey night.
        cloudMat.color.lerp(_ca.setHex(0x2e3a55), nightF * 0.78);
        cloudMat.opacity = wx.cloud;
        cloudMat.transparent = true;
      }

      // --- rain ---
      let targetRain = wx.rain;
      try { if (getGraphics()?.rain === false) targetRain = 0; } catch {}
      // Disable rain when graphics says off (saves CPU + overdraw on low/iPad).
      if (RAIN_N === 0) targetRain = 0;
      rainMat.opacity += ((targetRain * 0.55) - rainMat.opacity) * Math.min(1, dt * 2);
      rain.visible = rainMat.opacity > 0.02 && RAIN_N > 0;
      if (rain.visible) {
        const p = rainGeo.attributes.position.array;
        const slant = -1.2 * targetRain;
        const half = RAIN_BOX / 2;
        // On low particles, step rain every other particle to halve CPU.
        const gMul = (() => { try { return getGraphics()?.particles ?? 1; } catch { return 1; }})();
        const rainStep = gMul < 0.5 ? 2 : 1;
        for (let i = 0; i < RAIN_N; i += rainStep) {
          p[i * 3 + 1] -= rainVel[i] * dt;
          p[i * 3] += slant * dt;
          if (p[i * 3 + 1] < 0) {
            p[i * 3 + 1] = RAIN_H + Math.random() * 2;
            p[i * 3] = (Math.random() - 0.5) * RAIN_BOX;
            p[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX;
          }
          if (p[i * 3] < -half) p[i * 3] += RAIN_BOX;
        }
        // Keep untouched particles frozen (step 2) — still valid.
        rainGeo.attributes.position.needsUpdate = true;
        rain.position.set(focusV.x, 0, focusV.z);
      }

      // --- wet look on water (Standard only; low tier water is Lambert) ---
      if (waterMat && waterBase && waterMat.roughness !== undefined) {
        const w = state.wetness;
        waterMat.roughness = THREE.MathUtils.lerp(waterBase.rough, 0.05, w);
        waterMat.metalness = THREE.MathUtils.lerp(waterBase.metal, 0.4, w);
        waterMat.color.copy(waterBase.color).multiplyScalar(1 - w * 0.25);
      }

      // --- ambience (birds/crickets + rain + campfire crackle + thunder/frogs) ---
      ambience.update(dt, { isNight: !isDay, rain: targetRain, fire: extra.fire || 0, weather: state.weather, timeOfDay: state.timeOfDay });

      // --- Vibrant beauties: rainbow, aurora, pollen, shooting stars, lightning, dew ---
      const t = state.timeOfDay;
      const isDawn = t >= 4.8 && t < 7.2;
      const isMorning = t >= 7 && t < 11;
      const isMidday = t >= 11 && t < 14.5;
      const isGolden = t >= 15.5 && t < 18.6;
      const isDusk = t >= 18.6 && t < 20.2;
      const isNightDeep = t >= 21 || t < 4.5;
      const isAfterRain = state.prevWeather === 'rain' || state.prevWeather === 'storm';

      // Rainbow: shows for ~30s after rain stops, when sun is out and not foggy
      if (rainbow && rainbowMat) {
        const wantRainbow = isAfterRain && state.blend > 0.85 && (state.weather === 'clear' || state.weather === 'partlyCloudy' || state.weather === 'mist') && isDay && isMorning && wx.sun > 0.6;
        // Also allow drizzle -> clear within golden hour for dramatic sunset rainbow
        const sunny = state.weather === 'clear' || state.weather === 'partlyCloudy';
        const rainbowChance = (isAfterRain && sunny && wx.sun > 0.5 && state.blend > 0.7) ? 1 : (wantRainbow ? 1 : 0);
        const rainbowTarget = rainbowChance ? 0.92 : 0;
        rainbowMat.opacity += (rainbowTarget - rainbowMat.opacity) * Math.min(1, dt * 0.35);
        rainbow.visible = rainbowMat.opacity > 0.02;
        if (rainbow.visible) {
          rainbow.position.set(focusV.x, 0, focusV.z);
          // Face sun direction so arc is opposite sun
          const ang = Math.atan2(sunDir.z, sunDir.x);
          rainbow.rotation.y = -ang;
        }
      }

      // Aurora: clear night 22-03, fades in slow
      if (aurora && auroraMat) {
        const wantAurora = isNightDeep && (state.weather === 'clear' || state.weather === 'partlyCloudy') && nightF > 0.75;
        const targetA = wantAurora ? 0.9 : 0;
        auroraMat.uniforms.uOpacity.value += (targetA - auroraMat.uniforms.uOpacity.value) * Math.min(1, dt * 0.25);
        auroraMat.uniforms.uTime.value += dt;
        aurora.visible = auroraMat.uniforms.uOpacity.value > 0.02;
        if (aurora.visible) {
          aurora.position.set(focusV.x, 42, focusV.z - 55);
        }
      }

      // Pollen / dust motes: golden hour + midday sunbeams, clear/partlyCloudy
      if (pollen && pollenMat && pollenGeo) {
        const wantPollen = (isGolden || isMidday) && (state.weather === 'clear' || state.weather === 'partlyCloudy') && isDay && wx.sun > 0.6;
        const targetP = wantPollen ? (isGolden ? 0.85 : 0.5) : 0;
        pollenMat.opacity += (targetP - pollenMat.opacity) * Math.min(1, dt * 0.7);
        pollen.visible = pollenMat.opacity > 0.02;
        if (pollen.visible) {
          const arr = pollenGeo.attributes.position.array;
          for (let i = 0; i < POLLEN_N; i++) {
            arr[i * 3 + 1] += Math.sin(performance.now() * 0.0005 + pollenPhase[i]) * dt * 0.12;
            arr[i * 3] += Math.sin(performance.now() * 0.0003 + pollenPhase[i] * 1.3) * dt * 0.15;
            // wrap around focus
            if (arr[i * 3 + 1] > 8) arr[i * 3 + 1] = 1;
            if (arr[i * 3 + 1] < 0.5) arr[i * 3 + 1] = 7;
            if (Math.abs(arr[i * 3] - focusV.x) > 24) arr[i * 3] = focusV.x + (Math.random() - 0.5) * 44;
            if (Math.abs(arr[i * 3 + 2] - focusV.z) > 24) arr[i * 3 + 2] = focusV.z + (Math.random() - 0.5) * 44;
          }
          pollenGeo.attributes.position.needsUpdate = true;
          pollen.position.set(0, 0, 0);
        }
      }

      // Dew sparkle at dawn in mist/fog, low ground
      if (dew && dewMat && dewGeo) {
        const wantDew = isDawn && (state.weather === 'mist' || state.weather === 'fog' || state.weather === 'drizzle');
        const targetD = wantDew ? 0.75 : 0;
        dewMat.opacity += (targetD - dewMat.opacity) * Math.min(1, dt * 0.5);
        dew.visible = dewMat.opacity > 0.02;
        if (dew.visible) {
          dewMat.color.setHSL(0.55 + Math.sin(performance.now() * 0.001) * 0.03, 0.6, 0.85);
          const arr = dewGeo.attributes.position.array;
          // subtle twinkle via size pulse (opacity modulation per point is via global opacity)
          dewGeo.attributes.position.needsUpdate = false;
          dew.position.set(focusV.x, 0, focusV.z);
        }
      }

      // Shooting stars: rare streaks at night clear
      if (shootingStar && shootingMat) {
        shootTimer -= dt;
        if (shootActive > 0) {
          shootActive -= dt;
          const prog = 1 - shootActive / 0.9;
          const arr = shootingStar.geometry.attributes.position.array;
          const headX = focusV.x + 30 - prog * 70;
          const headY = 48 - prog * 24;
          const headZ = focusV.z + (Math.random() - 0.5) * 10;
          for (let i = 0; i < 12; i++) {
            const k = i / 11;
            arr[i * 3] = headX + k * 6 * shootDir.x;
            arr[i * 3 + 1] = headY + k * 6 * shootDir.y;
            arr[i * 3 + 2] = headZ + k * 6 * shootDir.z;
          }
          shootingStar.geometry.attributes.position.needsUpdate = true;
          shootingMat.opacity = Math.max(0, (1 - Math.abs(prog - 0.5) * 1.8) * 0.9);
          shootingStar.visible = true;
          shootingStar.position.set(0, 0, 0);
          if (shootActive <= 0) { shootingMat.opacity = 0; shootingStar.visible = false; }
        } else {
          shootingStar.visible = false;
          shootingMat.opacity = 0;
          if (shootTimer <= 0 && isNightDeep && (state.weather === 'clear' || state.weather === 'partlyCloudy') && Math.random() < 0.6) {
            shootActive = 0.9;
            shootTimer = 12 + Math.random() * 18;
            // randomize direction slightly
            shootDir.set(-0.8 - Math.random() * 0.2, -0.3 - Math.random() * 0.2, (Math.random() - 0.5) * 0.3).normalize();
          } else if (shootTimer <= 0) {
            shootTimer = 6 + Math.random() * 10;
          }
        }
      }

      // Lightning flash for storm
      if (state.weather === 'storm') {
        lightningTimer -= dt;
        if (lightningTimer <= 0) {
          lightningFlash = 0.18 + Math.random() * 0.18;
          lightningTimer = 2.5 + Math.random() * 5.5;
          // also spike directional light for one frame
          if (sun) sun.intensity += 3.5;
          if (moonLight) moonLight.intensity += 2.0;
        }
      } else {
        lightningTimer = 3 + Math.random() * 5;
      }
      if (lightningFlash > 0) {
        lightningFlash -= dt * 2.5;
        const lv = Math.max(0, lightningFlash);
        if (lightningOverlay) lightningOverlay.style.opacity = (lv * 0.85).toFixed(3);
        if (lv <= 0 && lightningOverlay) lightningOverlay.style.opacity = '0';
      }

      // --- HUD text (throttled) ---
      hudAcc += dt;
      if (hudAcc > 0.25) {
        hudAcc = 0;
        if (timeEl) timeEl.textContent = `${phaseIcon(state.timeOfDay)} ${fmtTime(state.timeOfDay)}`;
        if (wxEl) wxEl.textContent = `${WEATHER_ICON[state.weather]} ${WEATHER_LABEL[state.weather]}`;
      }
    },
  };
  if (typeof window !== 'undefined') window.__env = api;
  return api;
}
