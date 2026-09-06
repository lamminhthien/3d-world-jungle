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
import { createCozyMusic } from '../audio/cozy.js';

export const WEATHERS = ['clear', 'overcast', 'rain', 'fog'];
const WEATHER_LABEL = { clear: 'Clear', overcast: 'Overcast', rain: 'Rain', fog: 'Fog' };
const WEATHER_ICON = { clear: '☀️', overcast: '☁️', rain: '🌧️', fog: '🌫️' };

// ---- Day keyframes (lerped) ----
// t: hour, sun: color/intensity (day star), sky top/bottom, fog, exposure, stars
const STOPS = [
  { t: 0,    sun: 0x8fb4ff, sunInt: 0.0,  hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
  { t: 4.5,  sun: 0x8fb4ff, sunInt: 0.0,  hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
  // SUNRISE — vivid orange/amber glow
  { t: 5.5,  sun: 0xff6600, sunInt: 0.55, hemiInt: 0.42, ambInt: 0.16, top: 0x3d2a6e, bot: 0xff7730, fog: 0xff8850, exp: 0.88, stars: 0.2 },
  { t: 6.5,  sun: 0xffb060, sunInt: 0.9,  hemiInt: 0.55, ambInt: 0.18, top: 0x4a6fa5, bot: 0xffa060, fog: 0xe8905a, exp: 0.95, stars: 0.0 },
  { t: 7,    sun: 0xffd9a8, sunInt: 1.1,  hemiInt: 0.6,  ambInt: 0.18, top: 0x3d9be9, bot: 0xcfeef7, fog: 0xb8ddef, exp: 1.0,  stars: 0.0 },
  { t: 9,    sun: 0xfff3e0, sunInt: 1.9,  hemiInt: 0.95, ambInt: 0.25, top: 0x2f9de4, bot: 0xbfe9f5, fog: 0xa8dcf0, exp: 1.1,  stars: 0.0 },
  { t: 15.5, sun: 0xfff3e0, sunInt: 1.9,  hemiInt: 0.95, ambInt: 0.25, top: 0x2f9de4, bot: 0xbfe9f5, fog: 0xa8dcf0, exp: 1.1,  stars: 0.0 },
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
const WX = {
  clear:    { sun: 1.0,  hemi: 1.0,  fogNear: 1.0,  fogFar: 1.0,  fogTint: 0xffffff, cloud: 0.75, rain: 0, fogMul: 1.0, wet: 0 },
  overcast: { sun: 0.55, hemi: 0.8,  fogNear: 0.85, fogFar: 0.85, fogTint: 0xc9d2d6, cloud: 0.85, rain: 0, fogMul: 1.0, wet: 0.15 },
  rain:     { sun: 0.32, hemi: 0.6,  fogNear: 0.75, fogFar: 0.7,  fogTint: 0x8fa3ad, cloud: 0.85, rain: 1, fogMul: 1.0, wet: 1 },
  fog:      { sun: 0.7,  hemi: 0.85, fogNear: 0.6,  fogFar: 0.55, fogTint: 0xdde7ea, cloud: 0.4,  rain: 0, fogMul: 1.0, wet: 0.3 },
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
  const A = WX[prev];
  const B = WX[next];
  const o = out || {};
  for (const k of ['sun', 'hemi', 'fogNear', 'fogFar', 'cloud', 'rain', 'wet']) o[k] = THREE.MathUtils.lerp(A[k], B[k], blend);
  (o.fogTint || (o.fogTint = new THREE.Color())).set(A.fogTint).lerp(_ca.set(B.fogTint), blend);
  return o;
}

function rollNextWeather(rng = Math.random) {
  const r = rng();
  if (r < 0.45) return 'clear';
  if (r < 0.7) return 'overcast';
  if (r < 0.85) return 'rain';
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
    // Cozy generative music box (Stardew-like) on its own sub-bus so the
    // melody sits under wind/rain/critters instead of fighting them.
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.7;
    musicBus.connect(master);
    cozy = createCozyMusic(ctx, musicBus);
    cozy.setMuted(!musicOn);
    cozy.onTrackChange(() => syncMusicBtn());
    syncMusicBtn();
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
    if (b) {
      b.textContent = '🎵';
      b.classList.toggle('off', !musicOn);
      const track = cozy?.getCurrentTrack ? cozy.getCurrentTrack() : null;
      const trackInfo = track ? ` [${track.name}]` : '';
      b.title = musicOn
        ? `Music: On${trackInfo} (Click: mute, Shift-click: next track)`
        : 'Music: Off (Click to unmute)';
    }
  }

  // dt-driven critter scheduler: birds by day, crickets by night,
  // campfire crackle when the player camps nearby.
  function update(dt, { isNight, rain, fire = 0 }) {
    if (!ctx || !enabled) return;
    // Generative cozy music sits alongside the wind/rain/critters.
    if (cozy) cozy.update(dt, { isNight, rain });
    windGain.gain.value += ((rain > 0.5 ? 0.05 : 0.03) - windGain.gain.value) * Math.min(1, dt * 2);
    rainGain.gain.value += (rain * 0.14 - rainGain.gain.value) * Math.min(1, dt * 2);
    chirpTimer -= dt;
    if (chirpTimer <= 0) {
      const t0 = ctx.currentTime + 0.05;
      if (isNight) {
        for (let k = 0; k < 3; k++) blip(4200, t0 + k * 0.09, 0.05, 0.03);
        chirpTimer = 1.5 + Math.random() * 3;
      } else if (rain < 0.5) {
        const f = 2200 + Math.random() * 1200;
        blip(f, t0, 0.12, 0.05, f * 1.4);
        blip(f * 1.1, t0 + 0.16, 0.1, 0.04, f * 0.9);
        chirpTimer = 2 + Math.random() * 5;
      } else {
        chirpTimer = 2;
      }
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
      if (ensure() && master) master.gain.value = 0.8;
      else enabled = false;
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
      if (cozy) cozy.setMuted(!musicOn);
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
          col += sunColor * (pow(s, 350.0) * 1.2 + pow(s, 12.0) * 0.22 * sunGlow);
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
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false, transparent: true, opacity: 0.95 }),
  );
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 12, 12),
    new THREE.MeshBasicMaterial({ color: 0xdce8ff, fog: false, transparent: true, opacity: 0.9 }),
  );
  sunMesh.frustumCulled = moonMesh.frustumCulled = false;
  scene.add(sunMesh); scene.add(moonMesh);
  // Moon halo: additive glow shell for a misty moon-shaft look at night.
  const moonHalo = new THREE.Mesh(
    new THREE.SphereGeometry(4.6, 16, 16),
    new THREE.MeshBasicMaterial({
      color: 0xa1c4fd, fog: false, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  moonHalo.frustumCulled = false;
  scene.add(moonHalo);

  // ---- Moonlight (doc section 2: icy-blue #a1c4fd, 180° opposite the sun) ----
  // Second directional light on the mirrored orbit so trees / player cast faint
  // moon-shadows. NOTE (perf): castShadow stays OFF — a second shadow map would
  // double the geometry pass every frame; the sun map already gives depth.
  // A pale halo billboard fakes god-ray glow through the low-poly canopy.
  const moonLight = new THREE.DirectionalLight(0xa1c4fd, 0);
  moonLight.castShadow = false;
  scene.add(moonLight); scene.add(moonLight.target);

  // ---- Rain particles (box around focus, wraps) ----
  // Lower density + size so the iso view never whites out.
  // Low tier halves the count (CPU sim + point overdraw both cost).
  const RAIN_N = QUALITY.low ? 200 : 450;
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
    muteBtn.onclick = () => {
      const on = ambience.toggle();
      muteBtn.textContent = on ? '🔊' : '🔇';
    };
    if (musicBtn) {
      musicBtn.onclick = (e) => {
        // Lazily unlock audio on first click (autoplay policy)
        if (!ambience.enabled) ambience.enable();
        if (e && e.shiftKey && ambience.musicOn) {
          ambience.nextMusicTrack();
          return;
        }
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
          // One shader recompile per dawn/dusk; saves the whole shadow depth
          // pass for the entire night in exchange.
          if (QUALITY.low) sun.castShadow = false;
          else sun.castShadow = isDay;
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
      moonLight.intensity = nightF * 1.15 * (0.55 + 0.45 * wx.sun);
      moonLight.position.set(focusV.x + moonDir.x * ORBIT_R, Math.max(6, moonDir.y * ORBIT_R), focusV.z + moonDir.z * ORBIT_R);
      moonLight.target.position.copy(focusV);
      moonLight.target.updateMatrixWorld();

      if (hemi) {
        hemi.intensity = Math.max(sample.hemiInt * wx.hemi, 0.3);
        // Cool moonlit tint at night, neutral daylight by day.
        hemi.color.setHex(0xcdeffd).lerp(_ca.setHex(0x8fb4ff), nightF * 0.7);
      }
      if (ambient) ambient.intensity = Math.max(sample.ambInt, 0.15);
      if (renderer) renderer.toneMappingExposure = sample.exp;

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
      moonMesh.material.opacity = THREE.MathUtils.clamp(moonDir.y * 4 + 0.3, 0, 0.9) * veil;
      moonHalo.position.copy(moonMesh.position);
      moonHalo.visible = moonMesh.visible;
      moonHalo.material.opacity = nightF * 0.16 * veil;

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
      const targetRain = wx.rain;
      rainMat.opacity += ((targetRain * 0.55) - rainMat.opacity) * Math.min(1, dt * 2);
      rain.visible = rainMat.opacity > 0.02;
      if (rain.visible) {
        const p = rainGeo.attributes.position.array;
        const slant = -1.2 * targetRain;
        const half = RAIN_BOX / 2;
        for (let i = 0; i < RAIN_N; i++) {
          p[i * 3 + 1] -= rainVel[i] * dt;
          p[i * 3] += slant * dt;
          if (p[i * 3 + 1] < 0) {
            p[i * 3 + 1] = RAIN_H + Math.random() * 2;
            p[i * 3] = (Math.random() - 0.5) * RAIN_BOX;
            p[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX;
          }
          if (p[i * 3] < -half) p[i * 3] += RAIN_BOX;
        }
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

      // --- ambience (birds/crickets + rain + campfire crackle) ---
      ambience.update(dt, { isNight: !isDay, rain: targetRain, fire: extra.fire || 0 });

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
