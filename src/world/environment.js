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

export const WEATHERS = ['clear', 'overcast', 'rain', 'fog'];
const WEATHER_LABEL = { clear: 'Nắng đẹp', overcast: 'Âm u', rain: 'Mưa', fog: 'Sương mù' };
const WEATHER_ICON = { clear: '☀️', overcast: '☁️', rain: '🌧️', fog: '🌫️' };

// ---- Day keyframes (lerped) ----
// t: hour, sun: color/intensity (day star), sky top/bottom, fog, exposure, stars
const STOPS = [
  { t: 0,  sun: 0x8fb4ff, sunInt: 0.0,  hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
  { t: 4.5, sun: 0x8fb4ff, sunInt: 0.0, hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
  { t: 5.5, sun: 0xff9a5c, sunInt: 0.35, hemiInt: 0.4, ambInt: 0.14, top: 0x4a6fa5, bot: 0xffb37a, fog: 0xd9a06f, exp: 0.9, stars: 0.25 },
  { t: 7,  sun: 0xffd9a8, sunInt: 1.1,  hemiInt: 0.6,  ambInt: 0.18, top: 0x3d9be9, bot: 0xcfeef7, fog: 0xb8ddef, exp: 1.0,  stars: 0.0 },
  { t: 9,  sun: 0xfff3e0, sunInt: 1.9,  hemiInt: 0.95, ambInt: 0.25, top: 0x2f9de4, bot: 0xbfe9f5, fog: 0xa8dcf0, exp: 1.1,  stars: 0.0 },
  { t: 15.5, sun: 0xfff3e0, sunInt: 1.9, hemiInt: 0.95, ambInt: 0.25, top: 0x2f9de4, bot: 0xbfe9f5, fog: 0xa8dcf0, exp: 1.1, stars: 0.0 },
  { t: 17, sun: 0xffb37a, sunInt: 1.2,  hemiInt: 0.6,  ambInt: 0.18, top: 0x3a7bd5, bot: 0xffc98a, fog: 0xd9ac7f, exp: 1.0,  stars: 0.0 },
  { t: 18.5, sun: 0xff6b6b, sunInt: 0.4, hemiInt: 0.36, ambInt: 0.12,  top: 0x2b3a67, bot: 0xff8e63, fog: 0x8a6a72, exp: 0.9, stars: 0.2 },
  { t: 19.5, sun: 0x8fb4ff, sunInt: 0.0, hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
  { t: 24, sun: 0x8fb4ff, sunInt: 0.0,   hemiInt: 0.38, ambInt: 0.22, top: 0x0a1428, bot: 0x1b3350, fog: 0x16283a, exp: 0.9, stars: 1.0 },
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

function mixWx(prev, next, blend) {
  const A = WX[prev];
  const B = WX[next];
  const o = {};
  for (const k of ['sun', 'hemi', 'fogNear', 'fogFar', 'cloud', 'rain', 'wet']) o[k] = THREE.MathUtils.lerp(A[k], B[k], blend);
  o.fogTint = new THREE.Color(A.fogTint).lerp(_ca.set(B.fogTint), blend);
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
  let windGain, rainGain, master;
  let chirpTimer = 0;
  let crackleTimer = 0;
  let enabled = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return false; }
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // Looped noise buffer shared by wind + rain.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const mkLoop = (freq, q, gain0) => {
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = gain0;
      src.connect(f).connect(g).connect(master);
      src.start();
      return g;
    };
    windGain = mkLoop(400, 0.6, 0.03);
    rainGain = mkLoop(4000, 0.4, 0.0);
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
    o.connect(g).connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  // dt-driven critter scheduler: birds by day, crickets by night,
  // campfire crackle when the player camps nearby.
  function update(dt, { isNight, rain, fire = 0 }) {
    if (!ctx || !enabled) return;
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
    toggle() {
      enabled = !enabled;
      if (enabled) enabled = ensure();
      if (master) master.gain.value = enabled ? 0.5 : 0.0;
      return enabled;
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
  const skyUniforms = {
    topColor: { value: new THREE.Color(0x2f9de4) },
    bottomColor: { value: new THREE.Color(0xbfe9f5) },
    sunDir: { value: new THREE.Vector3(0, 1, 0) },
    sunColor: { value: new THREE.Color(0xfff3e0) },
    sunGlow: { value: 0.6 },
  };
  const skydome = new THREE.Mesh(
    new THREE.SphereGeometry(160, 24, 16),
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
    new THREE.SphereGeometry(4, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false, transparent: true, opacity: 0.95 }),
  );
  const moonMesh = new THREE.Mesh(
    new THREE.SphereGeometry(2.8, 16, 16),
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
  // Second directional light on the mirrored orbit, with soft shadows so trees
  // / player cast faint moon-shadows. A pale halo billboard fakes god-ray glow
  // through the low-poly canopy (cheap moon-shaft feel + FogExp2-like depth).
  const moonLight = new THREE.DirectionalLight(0xa1c4fd, 0);
  moonLight.castShadow = true;
  moonLight.shadow.mapSize.set(1024, 1024);
  moonLight.shadow.camera.left = -30;
  moonLight.shadow.camera.right = 30;
  moonLight.shadow.camera.top = 30;
  moonLight.shadow.camera.bottom = -30;
  moonLight.shadow.camera.far = 120;
  moonLight.shadow.bias = -0.0006;
  scene.add(moonLight); scene.add(moonLight.target);

  // ---- Rain particles (box around focus, wraps) ----
  // Giảm mật độ + size để không mù mịt che màn hình iso.
  const RAIN_N = 700;
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
      document.getElementById('hud')?.appendChild(root);
    }
    root.innerHTML = `
      <span id="env-time">☀️ 10:00</span>
      <span id="env-wx">☀️ Nắng đẹp</span>
      <div class="env-btns">
        <button id="env-pause" title="Tạm dừng / tiếp tục thời gian">⏸</button>
        <button id="env-skip" title="Nhảy tới sáng / tối">⏭</button>
        <button id="env-wxbtn" title="Đổi thời tiết">🌧️</button>
        <button id="env-mute" title="Âm thanh môi trường">🔇</button>
      </div>`;
    timeEl = root.querySelector('#env-time');
    wxEl = root.querySelector('#env-wx');
    const pauseBtn = root.querySelector('#env-pause');
    const skipBtn = root.querySelector('#env-skip');
    const wxBtn = root.querySelector('#env-wxbtn');
    const muteBtn = root.querySelector('#env-mute');
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
    // First click anywhere unlocks audio if the user enabled it — nothing to do
    // until toggle; AudioContext is created lazily inside toggle().
  }
  buildHud();

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
  let hudAcc = 1;

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
      const wx = mixWx(state.prevWeather, state.weather, state.blend);
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
      // Giảm lerp về fogTint để không bị wash-out trắng xóa cả màn hình.
      _cb.copy(sample.fog).lerp(wx.fogTint, state.weather === 'clear' ? 0 : 0.22);
      if (scene.fog) {
        scene.fog.color.copy(_cb);
        scene.fog.near = state.fogNear * wx.fogNear;
        scene.fog.far = state.fogFar * wx.fogFar * nightFogMul;
        // Guard: far luôn phải > near + margin, nếu không sẽ whiteout.
        if (scene.fog.far < scene.fog.near + 30) scene.fog.far = scene.fog.near + 30;
      }
      if (scene.background?.isColor) scene.background.copy(_cb);
      skyUniforms.topColor.value.copy(sample.top).lerp(_ca.set(wx.fogTint), state.weather === 'clear' ? 0 : 0.25);
      skyUniforms.bottomColor.value.copy(sample.bot).lerp(_ca.set(wx.fogTint), state.weather === 'clear' ? 0 : 0.25);
      skyUniforms.sunDir.value.copy(isDay ? sunDir : moonDir);
      skyUniforms.sunColor.value.copy(isDay ? sample.sunColor : new THREE.Color(0xdce8ff));
      skyUniforms.sunGlow.value = isDay ? 0.6 * wx.sun + 0.15 : 0.25;
      skydome.position.copy(focusV);
      stars.position.copy(focusV);
      starMat.opacity = sample.stars * (1 - wx.rain * 0.9) * (state.weather === 'fog' ? 0.15 : 1);

      sunMesh.position.set(focusV.x + sunDir.x * 130, sunDir.y * 130, focusV.z + sunDir.z * 130);
      sunMesh.visible = sunDir.y > -0.08;
      sunMesh.material.opacity = THREE.MathUtils.clamp(sunDir.y * 4 + 0.4, 0, 0.95);
      moonMesh.position.set(focusV.x + moonDir.x * 130, moonDir.y * 130, focusV.z + moonDir.z * 130);
      moonMesh.visible = moonDir.y > -0.05;
      // Overcast / rain veils the moon; drifting clouds cross it for an
      // occluded-moon illusion (doc section 3: trăng mờ ảo).
      const veil = (1 - wx.rain * 0.7) * (state.weather === 'overcast' ? 0.55 : 1) * (state.weather === 'fog' ? 0.3 : 1);
      moonMesh.material.opacity = THREE.MathUtils.clamp(moonDir.y * 4 + 0.3, 0, 0.9) * veil;
      moonHalo.position.copy(moonMesh.position);
      moonHalo.visible = moonMesh.visible;
      moonHalo.material.opacity = nightF * 0.16 * veil;

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

      // --- wet look on water ---
      if (waterMat && waterBase) {
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
