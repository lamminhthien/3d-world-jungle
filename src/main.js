import * as THREE from 'three';
import { DEFAULT_SEED, DEFAULT_MAX_FPS, ENV, RIVER_HALF, SPEED, VEGETATION, WORLD } from './config.js';
import { groundHeight, isOnBridge, obstacles, riverDist } from './utils.js';
import { QUALITY, setupCore } from './core/setup.js';
import { runPreGameCache } from './core/bootCache.js';
import { createWorldManager } from './world/chunks.js';
import { updateProceduralGen } from './world/procedural.js';
import { createRiver } from './world/river.js';
import { createBridges, removeBridges } from './world/bridge.js';
import { createClouds } from './world/clouds.js';
import { createEnvironment } from './world/environment.js';
import { createFireflies } from './world/fireflies.js';
import { createCampsites } from './world/campfire.js';
import { createPlayer } from './entities/player.js';
import { createAnimals } from './entities/animals.js';
import { setupControls } from './input/controls.js';
import { setupPwaUi } from './core/pwa.js';
import { randomSeedString, rngFromString } from './world/noise.js';
import { windState } from './world/wind.js';
import { createComposer, updateBloomForEnvironment, updateAdvancedEffects, disposeComposer, setBloomEnabled, isBloomEnabled, isRaysEnabled, isFlareEnabled, isGIEnabled, setRaysEnabled, setFlareEnabled, setGIEnabled } from './core/postprocessing.js';
import { createBounceLight, createDynamicLightRig, updateBounceLight } from './core/globalIllumination.js';
import { AutoPlayAgent } from './core/autoPlay.js';
import { createAdventure } from './gameplay/adventure.js';
import { createVillage } from './gameplay/village.js';
import { createLandmarks } from './world/landmarks.js';

// ============ Loop State ============
let targetFps = DEFAULT_MAX_FPS;
let lastFrameTime = 0;

// ============ Seed (docs section 4.1): ?seed= in URL, else default ============
const params = new URLSearchParams(location.search);
const initialSeed = params.get('seed') || DEFAULT_SEED;

// ============ Loading progress UI ============
const loadingEl = document.getElementById('loading');
const loadMsg = document.getElementById('loadmsg');
const loadFill = document.getElementById('loadfill');
function setProgress(frac, msg) {
  const f = Math.min(1, Math.max(0, frac));
  if (loadFill) loadFill.style.width = `${Math.round(f * 100)}%`;
  if (msg && loadMsg) loadMsg.textContent = msg;
}
// Yield 1 frame so the loading bar can paint before the next heavy step.
const tick = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// ============ Boot (async so the cache pipeline runs before playing) ============
async function boot() {
  // Fullscreen / PWA install buttons must work even while the game loads.
  setupPwaUi();
  setProgress(0.01, '🌱 Booting up…');
  await tick();

  // ---- Stage 1: renderer first so the pipeline cache can use the GPU ----
  const canvas = document.getElementById('scene');
  const core = setupCore(canvas);
  const { renderer, scene, camera, camTarget, sun, hemi, ambient, state, updateCameraPos } = core;

  // ---- Stage 2: bundle/GPU cache (SW + storage + texture) — 0 → 0.85 ----
  await runPreGameCache({ renderer, onProgress: setProgress });

  // ---- Stage 3: build the world ----
  // Infinite chunked world (docs section 3): ground + biome vegetation stream
  // around the player; section 4.5 spawns at (0, ymax, 0).
  const world = createWorldManager(scene, initialSeed);
  let spawn = world.getSpawn();
  setProgress(0.88, '🌉 Building the river bridge…');
  await tick();

  const river = createRiver(scene);
  let bridgeGroups = createBridges(scene);
  const sky = createClouds(scene);

  // Day-night cycle + dynamic weather (docs/weather-day-night-cycles.md).
  const env = createEnvironment(scene, {
    sun,
    hemi,
    ambient,
    renderer,
    clouds: sky,
    river,
    dayLengthSec: ENV.dayLengthSec,
    startTime: ENV.startTime,
    weatherIntervalSec: ENV.weatherIntervalSec,
    fogNear: WORLD.fogNear,
    fogFar: WORLD.fogFar,
  });

  const fireflies = createFireflies(scene);
  const camps = createCampsites(scene, initialSeed);
  const animals = createAnimals(scene);

  // Phase 6: Bloom composer (desktop only, tier-gated). Falls back to direct render on low tier.
  let composer = createComposer(renderer, scene, camera);
  // Expose for debugging / toggle
  if (typeof window !== 'undefined') window.__composer = composer;

  // Phase 7: Dynamic GI lights — always active (cheap) even without composer
  const bounceLight = createBounceLight(scene);
  const dynamicRig = createDynamicLightRig(scene);
  if (typeof window !== 'undefined') {
    window.__bounceLight = bounceLight;
    window.__dynamicRig = dynamicRig;
  }

  const { player, parts } = createPlayer(scene);
  player.position.set(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z);
  const adventure = createAdventure(scene, spawn);
  const village = createVillage(scene, spawn);
  const landmarks = createLandmarks(scene, spawn);
  if (typeof window !== 'undefined') window.__landmarks = landmarks;
  camTarget.set(spawn.x, 0.5, spawn.z);
  const { keys, joy, touch } = setupControls(canvas, core);

  // ============ World type presets — Genshin open-world nations ============
  // Each nation is just GEN + VEGETATION params, still seeded infinite.
  // Icon/hue matches the nation so the grid reads like Teyvat.
  const WORLD_CONFIGS = {
    JUNGLE_PRIME: { gen: {}, veg: {}, timeOverride: null, label: 'Jungle' },
    DESERT_WINDS: { gen: { desertTemp: 0.3, desertMoist: 0.6, riverAmp: 5, riverFreq: 0.02 }, veg: { grassDensity: 0.6, flowerDensity: 0.5 }, timeOverride: null },
    MOUNTAIN_PEAKS: { gen: { maxHeight: 8, levels: 8, rockLine: 1.0, snowLine: 3.0 }, veg: {}, timeOverride: null },
    BEACH_COVE: { gen: { bankOuter: 12, riverHalf: 4, riverAmp: 6 }, veg: { grassDensity: 1.1, willowDensity: 0.7 }, timeOverride: null },
    NIGHT_FOREST: { gen: {}, timeOverride: 0.5, label: 'Night' },
    VILLAGE_HUB: { gen: {}, veg: {}, timeOverride: null, focusVillage: true, label: 'Village' },
    // --- Genshin nations ---
    MONDSTADT_ANEMO: { // Mondstadt — windy meadow, dandelion flower fields (Monstadt)
      gen: { maxHeight: 4.5, levels: 5, rockLine: 1.8, snowLine: 3.2, desertTemp: 0.75, desertMoist: 0.35 },
      veg: { treeDensity: 0.55, treeScale: 0.95, grassDensity: 1.7, flowerDensity: 1.45, bambooDensity: 0.2, willowDensity: 0.5 },
      timeOverride: null, fog: { near: 85, far: 165 },
    },
    LIYUE_GEO: { // Liyue — terraced geo cliffs + bamboo
      gen: { maxHeight: 9, levels: 9, rockLine: 0.9, snowLine: 3.6, riverAmp: 7, riverFreq: 0.03 },
      veg: { treeDensity: 0.72, bambooDensity: 0.95, grassDensity: 0.9, flowerDensity: 0.8 },
      timeOverride: null, fog: { near: 75, far: 155 },
    },
    INAZUMA_ELECTRO: { // Inazuma — sakura isles, beach + lightning night vibe
      gen: { bankOuter: 9, riverHalf: 3.5, riverAmp: 8, riverFreq: 0.05, desertMoist: 0.5, snowLine: 2.8 },
      veg: { treeDensity: 0.68, grassDensity: 1.0, flowerDensity: 1.25, bambooDensity: 0.6 },
      timeOverride: null, fog: { near: 70, far: 140 }, // misty isles
    },
    SUMERU_DENDRO: { // Sumeru rainforest — dense jungle
      gen: { maxHeight: 5.5, levels: 7, rockLine: 1.6, snowLine: 3.0, moistureFreq: 0.038, desertTemp: 0.7 },
      veg: { treeDensity: 1.05, treeScale: 1.05, grassDensity: 1.3, flowerDensity: 1.1, bambooDensity: 0.85, willowDensity: 0.6 },
      timeOverride: null,
    },
    FONTAINE_HYDRO: { // Fontaine — lakes, willows, reeds
      gen: { bankOuter: 14, riverHalf: 5, riverAmp: 6, riverFreq: 0.035, maxHeight: 4.2 },
      veg: { treeDensity: 0.62, willowDensity: 1.15, grassDensity: 1.55, flowerDensity: 1.0, bambooDensity: 0.4 },
      timeOverride: null, fog: { near: 78, far: 150 },
    },
    NATLAN_PYRO: { // Natlan — volcanic ember fields, autumn maples
      gen: { maxHeight: 7, levels: 7, rockLine: 1.1, snowLine: 3.4, desertTemp: 0.5, desertMoist: 0.5, heightFreq: 0.04 },
      veg: { treeDensity: 0.6, grassDensity: 0.8, flowerDensity: 0.7 },
      timeOverride: null, fog: { near: 60, far: 130 }, // hazy volcano
    },
    __random__: { gen: {}, veg: {}, timeOverride: null, label: 'Random' },
  };

  const DEFAULT_VEG = { ...VEGETATION };

  // ============ Seed UI ============
  const seedInput = document.getElementById('seed');
  const seedBtn = document.getElementById('newWorld');
  const chunkEl = document.getElementById('chunks');
  if (seedInput) seedInput.value = initialSeed;

  function setAllWorldBtnActive(seed) {
    // Sync active state on both the title and menu grids.
    document.querySelectorAll('.world-type-btn, .menu-world-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.seed === seed);
    });
  }

  function applySeed(newSeed, timeOverride = null) {
    const requested = newSeed;
    let config = WORLD_CONFIGS[requested] || { gen: {}, veg: {}, timeOverride: null };
    let effectiveSeed = requested;
    // For "Random" — make every roll a truly new nation: random GEN + veg so no two random worlds look alike
    if (requested === '__random__') {
      const tmpSeed = randomSeedString();
      const _rng = rngFromString(tmpSeed);
      const _rand = (a,b)=> a+ _rng()*(b-a);
      const _randInt = (a,b)=> ( _rand(a,b) )|0;
      config = {
        gen: {
          maxHeight: _rand(4, 9),
          levels: _randInt(5,10),
          rockLine: _rand(0.9, 1.8),
          snowLine: _rand(2.5, 3.8),
          riverAmp: _rand(5, 11),
          riverHalf: _rand(2.8, 5.2),
          bankOuter: _rand(6, 14),
          desertTemp: _rand(0.3, 0.75),
          desertMoist: _rand(0.32, 0.6),
        },
        veg: {
          treeDensity: _rand(0.45, 1.1),
          treeScale: _rand(0.8, 1.15),
          grassDensity: _rand(0.7, 1.7),
          flowerDensity: _rand(0.6, 1.45),
          bambooDensity: _rand(0, 1),
          willowDensity: _rand(0.2, 1),
        },
        timeOverride: null,
        fog: _rand(0,1) < 0.3 ? { near: _rand(60,85)|0, far: _rand(130,165)|0 } : null,
      };
      effectiveSeed = tmpSeed;
      WORLD_CONFIGS[tmpSeed] = config;
    }
    // Genshin nations: apply both terrain and vegetation densities before rebuild
    Object.assign(VEGETATION, DEFAULT_VEG, config.veg || {});
    updateProceduralGen(config.gen);
    if (config.fog) {
      WORLD.fogNear = config.fog.near; WORLD.fogFar = config.fog.far;
      if (scene?.fog) { scene.fog.near = config.fog.near; scene.fog.far = config.fog.far; }
    } else {
      WORLD.fogNear = 80; WORLD.fogFar = 160;
      if (scene?.fog) { scene.fog.near = 80; scene.fog.far = 160; }
    }

    const actualSeed = effectiveSeed;
    spawn = world.regenerate(actualSeed);
    removeBridges(scene, bridgeGroups);
    bridgeGroups = createBridges(scene);
    camps.regenerate(actualSeed);
    player.position.set(spawn.x, groundHeight(spawn.x, spawn.z), spawn.z);
    adventure.regenerate(spawn);
    village.regenerate(spawn);
    try { landmarks?.regenerate(spawn); } catch { /* no landmarks yet */ }
    const destination = config.focusVillage ? village.getHubPosition() : spawn;
    if (config.focusVillage) {
      const villageY = village.getSurfaceHeight(destination.x, destination.z);
      player.position.set(destination.x, villageY ?? groundHeight(destination.x, destination.z), destination.z);
    }
    camTarget.set(player.position.x, 0.5, player.position.z);
    const url = new URL(location.href);
    url.searchParams.set('seed', actualSeed);
    history.replaceState(null, '', url);
    if (seedInput) seedInput.value = actualSeed;
    // Apply time override if the preset specifies one (e.g. Night = midnight).
    const finalTime = timeOverride !== null ? timeOverride : config.timeOverride;
    if (finalTime !== null && env?.setTime) env.setTime(finalTime);
    setAllWorldBtnActive(requested);
  }

  // Wire up title-screen world type grid
  document.getElementById('worldTypeGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.world-type-btn');
    if (!btn) return;
    const seed = btn.dataset.seed;
    const config = WORLD_CONFIGS[seed] || {};
    // Resolve time override from data-time attr or config map
    const timeAttr = btn.dataset.time;
    const timeOverride = timeAttr !== '' ? Number(timeAttr) : config.timeOverride;
    if (titleSeedInput) titleSeedInput.value = seed === '__random__' ? randomSeedString() : seed;
    applySeed(seed, timeOverride);
  });

  // Wire up in-game menu world type grid
  document.getElementById('menuWorldGrid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.menu-world-btn');
    if (!btn) return;
    const seed = btn.dataset.seed;
    const config = WORLD_CONFIGS[seed] || {};
    applySeed(seed, config.timeOverride);
    closeMenu();
  });


  const fpsSelect = document.getElementById('fpsSelect');
  if (fpsSelect && targetFps) {
    fpsSelect.value = String(targetFps);
    fpsSelect.addEventListener('change', (e) => {
      targetFps = parseInt(e.target.value, 10);
    });
  }

  // Vegetation settings rebuild the currently visible chunks so the change is
  // immediate and does not require regenerating the terrain or changing seed.
  const treeDensitySelect = document.getElementById('treeDensitySelect');
  const treeDensityValue = document.getElementById('treeDensityValue');
  const treeScaleSelect = document.getElementById('treeScaleSelect');
  const treeScaleValue = document.getElementById('treeScaleValue');
  const syncVegetationLabels = () => {
    if (treeDensityValue) treeDensityValue.textContent = `${Math.round(VEGETATION.treeDensity * 100)}%`;
    if (treeScaleValue) treeScaleValue.textContent = `${Math.round(VEGETATION.treeScale * 100)}%`;
  };
  const refreshVegetation = () => world.refreshVegetation();
  if (treeDensitySelect) {
    treeDensitySelect.value = String(VEGETATION.treeDensity);
    treeDensitySelect.addEventListener('input', (e) => {
      VEGETATION.treeDensity = Number(e.target.value);
      syncVegetationLabels();
    });
    treeDensitySelect.addEventListener('change', refreshVegetation);
  }
  if (treeScaleSelect) {
    treeScaleSelect.value = String(VEGETATION.treeScale);
    treeScaleSelect.addEventListener('input', (e) => {
      VEGETATION.treeScale = Number(e.target.value);
      syncVegetationLabels();
    });
    treeScaleSelect.addEventListener('change', refreshVegetation);
  }
  syncVegetationLabels();

  // ============ Title screen + dropdown menu ============
  // The world renders behind the title as a living backdrop; movement only
  // starts after Play. All HUD buttons live in the ☰ dropdown menu.
  let started = false;
  const titleScreen = document.getElementById('title-screen');
  const titleSeedInput = document.getElementById('titleSeed');
  const titleDice = document.getElementById('titleDice');
  const playBtn = document.getElementById('btnPlay');
  const menuBtn = document.getElementById('menuBtn');
  const menuPanel = document.getElementById('menuPanel');
  const buildTimeEl = document.getElementById('build-time');
  if (buildTimeEl) {
    buildTimeEl.textContent = `Build: ${typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'Development'}`;
  }
  if (titleSeedInput) titleSeedInput.value = initialSeed;

  function closeMenu() {
    if (menuPanel && !menuPanel.hidden) {
      menuPanel.hidden = true;
      if (menuBtn) {
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.textContent = '☰';
      }
    }
  }
  function startGame() {
    if (started) return;
    started = true;
    // Play is a user gesture: unlock cozy audio (ambience + chill music box).
    try { env.ambience.enable(); } catch { /* audio unsupported: play silent */ }
    const v = (titleSeedInput && titleSeedInput.value.trim()) || initialSeed;
    if (seedInput && v !== seedInput.value) applySeed(v);
    if (titleScreen) titleScreen.hidden = true;
    document.body.classList.add('playing');
    closeMenu();
    if (playBtn) playBtn.blur();
  }
  if (playBtn) playBtn.addEventListener('click', startGame);
  if (titleSeedInput) {
    titleSeedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') startGame();
    });
  }
  if (titleDice) {
    titleDice.addEventListener('click', () => {
      if (titleSeedInput) {
        titleSeedInput.value = randomSeedString();
        titleSeedInput.focus();
      }
    });
  }
  if (menuBtn && menuPanel) {
    menuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = menuPanel.hidden;
      menuPanel.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? '✕' : '☰';
    });
    document.addEventListener('click', (e) => {
      if (!menuPanel.hidden && !menuPanel.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  // ============ Auto Play Agent ============
  const autoPlay = new AutoPlayAgent({ core, player, env });
  const btnAutoPlay = document.getElementById('btnAutoPlay');
  const btnTitleAutoPlay = document.getElementById('btnTitleAutoPlay');
  const autoPlayBadge = document.getElementById('autoPlayBadge');
  const btnStopAutoPlay = document.getElementById('btnStopAutoPlay');
  const btnScreenshot = document.getElementById('btnScreenshot');

  function updateAutoPlayUI(isActive) {
    if (btnAutoPlay) {
      btnAutoPlay.classList.toggle('active', isActive);
      btnAutoPlay.title = isActive ? 'Stop Auto Play' : 'Start Auto Play';
    }
    if (autoPlayBadge) {
      autoPlayBadge.hidden = !isActive;
    }
  }

  function startAutoPlay() {
    if (!started) {
      startGame();
    }
    autoPlay.setEnabled(true);
    updateAutoPlayUI(true);
    closeMenu();
  }

  function stopAutoPlay() {
    autoPlay.setEnabled(false);
    updateAutoPlayUI(false);
  }

  function toggleAutoPlay() {
    if (autoPlay.enabled) {
      stopAutoPlay();
    } else {
      startAutoPlay();
    }
  }

  if (btnAutoPlay) btnAutoPlay.addEventListener('click', toggleAutoPlay);
  if (btnTitleAutoPlay) btnTitleAutoPlay.addEventListener('click', startAutoPlay);
  if (btnStopAutoPlay) btnStopAutoPlay.addEventListener('click', stopAutoPlay);

  if (btnScreenshot) {
    btnScreenshot.addEventListener('click', () => {
      const dataUrl = renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `jungle-stroll-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
      closeMenu();
    });
  }

  // Global hook for debugging or console
  if (typeof window !== 'undefined') {
    window.__autoPlay = autoPlay;
    window.__toggleAutoPlay = toggleAutoPlay;
  }

  // ============ HUD ============
  const posEl = document.getElementById('pos');
  const fpsEl = document.getElementById('fps');
  let fpsAcc = 0;
  let fpsN = 0;
  let fpsT = 0;

  // ============ Movement + world update ============
  let walkTime = 0;
  const clock = new THREE.Clock();
  // Perf: reused scratch vectors — update() runs every frame, so no `new`.
  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _move = new THREE.Vector3();
  const _desired = new THREE.Vector3();

  function update(dt) {
    let ix = 0;
    let iz = 0;
    let sprinting = false;

    if (!started) {
      // Attract mode behind the title screen: slow orbit, no movement.
      state.azimuth += dt * 0.08;
    } else {
      let manualInput = false;
      if (keys.KeyW || keys.ArrowUp) { iz -= 1; manualInput = true; }
      if (keys.KeyS || keys.ArrowDown) { iz += 1; manualInput = true; }
      if (keys.KeyA || keys.ArrowLeft) { ix -= 1; manualInput = true; }
      if (keys.KeyD || keys.ArrowRight) { ix += 1; manualInput = true; }
      if (Math.hypot(joy.x, joy.y) > 0.1) {
        ix += joy.x;
        iz += joy.y;
        manualInput = true;
      }
      sprinting = keys.ShiftLeft || keys.ShiftRight || touch?.sprintHeld || joy.mag > 0.92;

      // If player manually interacts with movement controls while auto play is active, pause auto play
      if (manualInput && autoPlay.enabled) {
        stopAutoPlay();
      }

      if (autoPlay.enabled) {
        autoPlay.update(dt);
        ix = autoPlay.simulatedInput.ix;
        iz = autoPlay.simulatedInput.iz;
        sprinting = autoPlay.simulatedInput.sprint;
      }
    }

    const moving = Math.hypot(ix, iz) > 0.1;
    if (moving) {
      // Camera-relative movement on the ground plane.
      const az = state.azimuth;
      _fwd.set(-Math.cos(az), 0, -Math.sin(az));
      _right.set(Math.sin(az), 0, -Math.cos(az));

      const len = Math.hypot(ix, iz);
      const inputMag = Math.min(1, len);
      ix /= Math.max(1, len);
      iz /= Math.max(1, len);
      _move.set(0, 0, 0).addScaledVector(_fwd, -iz).addScaledVector(_right, ix).normalize();

      // Analog: light push = walk slowly, hard push = walk fast.
      const speed = SPEED * (sprinting ? 1.6 : 1) * (0.35 + 0.65 * inputMag);

      let nx = player.position.x + _move.x * speed * dt;
      let nz = player.position.z + _move.z * speed * dt;

      // Village houses are static gameplay obstacles. Resolve before the
      // generic world obstacles so the player can slide along their walls.
      const villagePosition = village.resolveCollision(nx, nz, player.position.x, player.position.z);
      nx = villagePosition.x;
      nz = villagePosition.z;

      // Circle collision against trees / rocks / cacti (squared distances —
      // Math.hypot per obstacle per frame is needlessly slow).
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        const dx = nx - o.x;
        const dz = nz - o.z;
        const min = o.r + 0.45;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = o.x + (dx / d) * min;
          nz = o.z + (dz / d) * min;
        }
      }
      // Block the winding river (unless on a bridge). No map edge: chunks stream.
      // Simplest stable response: revert to previous position.
      if (riverDist(nx, nz) < RIVER_HALF + 0.5 && !isOnBridge(nx, nz)) {
        nx = player.position.x;
        nz = player.position.z;
      }
      // Safety bound against float precision, far beyond the visible area.
      const r = Math.hypot(nx, nz);
      if (r > 500) {
        nx *= 500 / r;
        nz *= 500 / r;
      }

      player.position.x = nx;
      player.position.z = nz;
      player.rotation.y = Math.atan2(_move.x, _move.z);

      walkTime += dt * 10 * (sprinting ? 1.45 : 1) * (0.5 + 0.5 * inputMag);
      const sw = Math.sin(walkTime);
      parts.legL.rotation.x = sw * 0.7;
      parts.legR.rotation.x = -sw * 0.7;
      parts.armL.rotation.x = -sw * 0.6;
      parts.armR.rotation.x = sw * 0.6;
    } else {
      // Idle breathing.
      const t = performance.now() * 0.002;
      parts.legL.rotation.x *= 0.8;
      parts.legR.rotation.x *= 0.8;
      parts.armL.rotation.x = Math.sin(t) * 0.06;
      parts.armR.rotation.x = -Math.sin(t) * 0.06;
    }
    // Framerate-independent vertical: ground + walk bob (was: += 0.02/frame
    // hop fighting the ground lerp — hover height + jitter scaled with fps,
    // visibly glitchy on 120Hz screens and in the walk cycle).
    const villageY = village.getSurfaceHeight(player.position.x, player.position.z);
    const groundY = villageY ?? groundHeight(player.position.x, player.position.z);
    const bob = moving ? Math.abs(Math.cos(walkTime)) * 0.07 : 0;
    player.position.y += (groundY + bob - player.position.y) * Math.min(1, dt * 12);

    // Stream chunks around the player + keep water/foam nearby.
    world.update(player.position.x, player.position.z);
    river.update(dt, player.position, windState);
    sky.update(dt, player.position, clock.elapsedTime);

    // Day-night + weather drive sun/fog/sky (sun follows target for shadows).
    // Fire proximity feeds the crackle ambience + warm/cool contrast logic.
    const fire = camps.getFireProximity(player.position.x, player.position.z);
    env.update(dt, player.position, { fire });
    animals.update(dt, player.position);
    adventure.update(dt, player.position);
    village.update(dt, player.position, env.nightFactor);
    try { landmarks.update(dt, player.position); } catch {}

    // Night systems (docs/enhance_for_night_screen.md section 5):
    // timeOfDay -> fireflies on, moon takes over, clouds darken, campfires glow.
    const nf = env.nightFactor;
    fireflies.update(dt, clock.elapsedTime, player.position, env.timeOfDay);
    camps.update(dt, clock.elapsedTime, player.position, nf);

    // Phase 7: Dynamic GI — bounce fill + player lantern + firefly lights
    try {
      const sunDir = env.sunDirVec;
      const moonDir = env.moonDirVec;
      const sunCol = env.sunColorVec;
      updateBounceLight(bounceLight, { sunDir, moonDir, sunColor: sunCol, nightFactor: nf, isDay: !env.isNight });
      // fireflies positions for light rig (Float32Array from geometry)
      const ffArr = fireflies.points?.geometry?.attributes?.position?.array || null;
      dynamicRig.update({
        playerPos: player.position,
        nightFactor: nf,
        time: clock.elapsedTime,
        firefliesPosArray: ffArr,
        delta: dt,
      });
    } catch (e) { /* GI lights: non-fatal */ }

    // Smooth camera follow (sun position itself is set by the environment).
    _desired.set(player.position.x, 0.5, player.position.z);
    camTarget.lerp(_desired, Math.min(1, dt * 4));
    updateCameraPos();
  }

  // ============ Loop ============
  const prCap = Math.min(devicePixelRatio || 1, QUALITY.maxPixelRatio);
  let qualityCooldown = 0;
  let downVotes = 0;
  let upVotes = 0;

  // Bloom auto-off when FPS <50 for 2 votes (fill-rate killer fallback)
  let bloomLowVotes = 0;
  // Wire bloom toggle in menu if present (Phase 6)
  const bloomBtn = document.getElementById('bloomToggle');
  if (bloomBtn) {
    bloomBtn.textContent = isBloomEnabled() ? 'Bloom: On' : 'Bloom: Off';
    bloomBtn.onclick = () => {
      const nowOn = !isBloomEnabled();
      setBloomEnabled(nowOn);
      bloomBtn.textContent = nowOn ? 'Bloom: On' : 'Bloom: Off';
      if (nowOn && !composer && !QUALITY.low) {
        composer = createComposer(renderer, scene, camera);
        if (typeof window !== 'undefined') window.__composer = composer;
      } else if (!nowOn && composer) {
        disposeComposer(composer);
        composer = null;
        if (typeof window !== 'undefined') window.__composer = null;
      }
    };
  }
  // Phase 7 FX toggles (rays / flare / GI)
  const raysBtn = document.getElementById('godRaysToggle');
  const flareBtn = document.getElementById('lensFlareToggle');
  const giBtn = document.getElementById('giToggle');
  if (raysBtn) {
    raysBtn.textContent = isRaysEnabled() ? 'Rays: On' : 'Rays: Off';
    raysBtn.onclick = () => {
      const nowOn = !isRaysEnabled();
      setRaysEnabled(nowOn);
      raysBtn.textContent = nowOn ? 'Rays: On' : 'Rays: Off';
    };
  }
  if (flareBtn) {
    flareBtn.textContent = isFlareEnabled() ? 'Flare: On' : 'Flare: Off';
    flareBtn.onclick = () => {
      const nowOn = !isFlareEnabled();
      setFlareEnabled(nowOn);
      flareBtn.textContent = nowOn ? 'Flare: On' : 'Flare: Off';
    };
  }
  if (giBtn) {
    giBtn.textContent = isGIEnabled() ? 'GI: On' : 'GI: Off';
    giBtn.onclick = () => {
      const nowOn = !isGIEnabled();
      setGIEnabled(nowOn);
      giBtn.textContent = nowOn ? 'GI: On' : 'GI: Off';
      if (bounceLight) bounceLight.visible = nowOn;
    };
  }
  // Init bounce visibility from stored GI toggle
  if (bounceLight && !isGIEnabled()) bounceLight.visible = false;

  function animate(now) {
    requestAnimationFrame(animate);
    const frameDuration = 1000 / targetFps;
    if (lastFrameTime !== 0 && now - lastFrameTime < frameDuration - 0.1) return;
    lastFrameTime = now;

    const dt = Math.min(clock.getDelta(), 0.05);
    update(dt);
    // Bloom exposure follows env wetness / day factor + volumetric + lens flare
    if (composer) {
      updateBloomForEnvironment(composer, env);
      try {
        updateAdvancedEffects(composer, {
          camera,
          env,
          sunWorldPos: env.sunMesh?.position || null,
          moonWorldPos: env.moonMesh?.position || null,
        });
      } catch (e) { /* effects: non-fatal */ }
      composer.render();
    } else {
      renderer.render(scene, camera);
    }

    fpsAcc += 1 / Math.max(dt, 1e-4);
    fpsN++;
    fpsT += dt;
    if (fpsT > 0.5) {
      const avg = fpsAcc / fpsN;
      fpsEl.textContent = `${Math.round(avg)} FPS`;
      posEl.textContent = `x: ${player.position.x.toFixed(1)}, z: ${player.position.z.toFixed(1)}`;
      // Perf: DOM writes throttled to 2Hz (was: chunk label every frame).
      if (chunkEl) {
        const s = world.stats();
        chunkEl.textContent = `${s.chunks} chunks · ${s.seed}`;
      }
      // Adaptive resolution: step the pixel ratio down when the GPU can't
      // hold ~45fps, back up with headroom. Requires 2 consecutive votes in
      // the same direction so one slow window (chunk build, weather blend,
      // GC) doesn't thrash the framebuffer size every cooldown cycle —
      // setPixelRatio reallocates buffers, i.e. a hitch of its own.
      qualityCooldown += fpsT;
      const cooldown = QUALITY.low ? 1.2 : 2.5;
      if (qualityCooldown > cooldown) {
        qualityCooldown = 0;
        const pr = renderer.getPixelRatio();
        if (avg < targetFps * 0.75 && pr > QUALITY.minPixelRatio) {
          upVotes = 0;
          if (++downVotes >= 2) {
            downVotes = 0;
            renderer.setPixelRatio(Math.max(QUALITY.minPixelRatio, pr - 0.25));
            if (composer) composer.setPixelRatio?.(renderer.getPixelRatio());
          }
        } else if (avg > targetFps * 0.95 && pr < prCap) {
          downVotes = 0;
          if (++upVotes >= 2) {
            upVotes = 0;
            renderer.setPixelRatio(Math.min(prCap, pr + 0.25));
            if (composer) composer.setPixelRatio?.(renderer.getPixelRatio());
          }
        } else {
          downVotes = 0;
          upVotes = 0;
        }
      }
      // Bloom fill-rate guard: auto-off when <50 FPS for 2 votes (desktop only)
      if (composer && !QUALITY.low) {
        if (avg < 50) {
          if (++bloomLowVotes >= 2) {
            bloomLowVotes = 0;
            // Keep composer but lower strength instead of fully disabling (less jank)
            const bp = composer.userData.bloomPass;
            if (bp) bp.strength = Math.max(0.15, bp.strength - 0.08);
          }
        } else if (avg > 58) {
          bloomLowVotes = 0;
        }
        // FX guard: if still <42 FPS after bloom reduction, shed heavy passes
        if (avg < 42) {
          const ao = composer.userData.aoPass;
          const vol = composer.userData.volumetric;
          if (ao && ao.enabled) ao.enabled = false;
          else if (vol && vol.pass.enabled) vol.pass.enabled = false;
          else {
            const lf = composer.userData.lensFlare;
            if (lf && lf.pass.enabled) lf.pass.enabled = false;
          }
        } else if (avg > 55) {
          // headroom: restore FX if toggles say they should be on
          const ao = composer.userData.aoPass;
          const vol = composer.userData.volumetric;
          const lf = composer.userData.lensFlare;
          if (ao && !ao.enabled && isGIEnabled()) ao.enabled = true;
          else if (vol && !vol.pass.enabled && isRaysEnabled()) vol.pass.enabled = true;
          else if (lf && !lf.pass.enabled && isFlareEnabled()) lf.pass.enabled = true;
        }
      }
      fpsAcc = 0;
      fpsN = 0;
      fpsT = 0;
    }
  }

  // ---- Stage 4: pre-compile shaders before the first frame (anti-jank) ----
  setProgress(0.95, '⚡ Loading shaders…');
  await tick();
  try {
    renderer.compile(scene, camera);
  } catch {
    /* GPU precompile unsupported: first frame compiles as usual */
  }

  setProgress(1, 'Ready — into the jungle! 🌴');
  animate();
  // Hold one beat so players see 100%, then reveal the title screen.
  // The world keeps rendering behind it (attract mode) until Play.
  setTimeout(() => loadingEl.classList.add('hidden'), 250);
}

boot();
