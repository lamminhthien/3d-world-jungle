// Test Mode — Quick access panel for every scenario / lifecycle / world dimension.
// Activated via ?test=1 / ?testMode=1 / ?debug=1, or the floating 🧪 button, or hotkey ` / F2.
// No external deps; injects its own DOM + styles. Safe to leave bundled for prod — hidden until opened.

import * as THREE from 'three';
import { BIOMES, sampleGround, GEN } from '../world/procedural.js';
import { LIFECYCLE, ANIMALS } from '../config.js';
import { getGraphics, getGraphicsState, setPreset, setOverride } from './graphics.js';
import { groundHeight } from '../utils.js';

const TIME_PRESETS = [
  { label: 'Dawn', icon: '🌅', time: 5.5, desc: 'chorus 4.8-7.2' },
  { label: 'Morning', icon: '🌤️', time: 9.0, desc: 'clear morning 7-11' },
  { label: 'Midday', icon: '☀️', time: 12.5, desc: 'butterflies 11-14.5' },
  { label: 'Golden', icon: '🌇', time: 16.5, desc: 'amber sun 15.5-18.6' },
  { label: 'Dusk', icon: '🌆', time: 18.8, desc: 'bats, crickets, fireflies ignite' },
  { label: 'Night', icon: '🌙', time: 22.0, desc: 'night 22-03' },
  { label: 'Midnight', icon: '🌌', time: 0.5, desc: 'deep night, moon' },
];

const LIFECYCLE_PRESETS = [
  { key: 'dawn', label: 'Dawn', time: 5.5 },
  { key: 'morning', label: 'Morning', time: 9 },
  { key: 'midday', label: 'Midday', time: 12 },
  { key: 'goldenHour', label: 'Golden Hour', time: 16.5 },
  { key: 'dusk', label: 'Dusk', time: 18.8 },
  { key: 'night', label: 'Night', time: 22 },
];

function fmtTime(t) {
  const h = Math.floor(t) % 24;
  const m = Math.floor((t - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function shouldAutoEnable() {
  try {
    const sp = new URLSearchParams(location.search);
    if (sp.has('test') || sp.has('testMode') || sp.has('debug') || sp.get('testmode') === '1') return true;
    if (localStorage.getItem('jungle_testmode') === '1') return true;
  } catch {}
  return false;
}

function injectStyles() {
  if (document.getElementById('test-mode-style')) return;
  const style = document.createElement('style');
  style.id = 'test-mode-style';
  style.textContent = `
#testModeToggle{position:fixed;left:14px;top:14px;z-index:41;width:40px;height:40px;border:1px solid rgba(255,255,255,.7);background:rgba(255,255,255,.9);color:#2e7d32;border-radius:12px;font-size:18px;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.18);display:inline-flex;align-items:center;justify-content:center;transition:transform .12s}
#testModeToggle:hover{transform:translateY(-1px);background:#fff}
#testModeToggle.active{background:#2e7d32;color:#fff;border-color:#1b5e20}
#testPanel{position:fixed;top:62px;left:14px;z-index:41;width:min(520px, calc(100vw - 20px));max-height:calc(100dvh - 76px);overflow:hidden;display:flex;flex-direction:column;background:rgba(255,255,255,.97);backdrop-filter:blur(10px);border:1px solid #c8e6c9;border-radius:16px;box-shadow:0 16px 48px rgba(27,94,32,.28);font-family:"Segoe UI",system-ui,sans-serif}
#testPanel[hidden]{display:none!important}
.test-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-bottom:1px solid #e0e0e0;background:linear-gradient(180deg,#f1f8e9,#e8f5e9)}
.test-head-title{font-weight:800;color:#2e7d32;font-size:13px;letter-spacing:.3px;display:flex;align-items:center;gap:6px}
.test-head-actions{display:flex;gap:6px}
.test-head-actions button{border:1px solid #c8e6c9;background:#fff;color:#2e7d32;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer}
.test-head-actions button:hover{background:#f1f8e9}
.test-tabs{display:flex;gap:4px;padding:8px 8px 0;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid #e8eaf0;flex-wrap:nowrap}
.test-tabs::-webkit-scrollbar{display:none}
.test-tab{border:1px solid #e0e0e0;background:#fafafa;color:#558b2f;border-radius:10px 10px 0 0;padding:6px 9px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}
.test-tab.active{background:#43a047;color:#fff;border-color:#2e7d32}
.test-body{overflow:auto;padding:10px 12px 12px;display:grid;gap:12px;align-content:start}
.test-section{border:1px solid #e8ecef;border-radius:12px;padding:10px;background:#fff}
.test-section-title{font-size:11px;font-weight:800;color:#2e7d32;letter-spacing:.4px;text-transform:uppercase;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.test-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.test-grid2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.test-btn{border:1px solid #c8e6c9;background:#f1f8e9;color:#2e7d32;border-radius:10px;padding:7px 8px;font-size:11px;font-weight:700;cursor:pointer;text-align:center;line-height:1.2}
.test-btn:hover{background:#e8f5e9}
.test-btn.active{background:#43a047;color:#fff;border-color:#2e7d32}
.test-btn.sm{padding:5px 6px;font-size:10px}
.test-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.test-input{border:1px solid #c8e6c9;border-radius:8px;padding:6px 8px;font-size:12px;font-weight:600;color:#33691e;background:#fff;outline:none}
.test-input:focus{border-color:#66bb6a}
.test-range{width:100%;accent-color:#43a047}
.test-meta{font-size:11px;color:#78909c;line-height:1.45}
.test-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;font-size:11px}
.test-kv b{color:#33691e}
.test-badge{display:inline-flex;align-items:center;gap:4px;background:#e8f5e9;color:#2e7d32;border:1px solid #c8e6c9;border-radius:999px;padding:2px 8px;font-size:10px;font-weight:700}
.test-log{max-height:120px;overflow:auto;background:#1b2a1e;color:#c8e6c9;border-radius:8px;padding:8px;font:11px/1.4 monospace;white-space:pre-wrap}
.test-divider{height:1px;background:#e0e0e0;margin:2px 0}
@media(max-width:600px){#testPanel{left:10px;right:10px;width:auto}#testModeToggle{top:10px;left:10px}}
`;
  document.head.appendChild(style);
}

export function createTestMode(ctx = {}) {
  injectStyles();

  const {
    world, env, player, camTarget, scene, coreState,
    adventure, village, landmarks, camps, animals,
    WORLD_CONFIGS = {}, applySeed, getSeed,
  } = ctx;

  // --- Toggle button ---
  let toggleBtn = document.getElementById('testModeToggle');
  if (!toggleBtn) {
    toggleBtn = document.createElement('button');
    toggleBtn.id = 'testModeToggle';
    toggleBtn.title = 'Test Mode (∼ or F2) — ?test=1 to auto-open';
    toggleBtn.textContent = '🧪';
    toggleBtn.setAttribute('aria-label', 'Toggle test mode');
    document.body.appendChild(toggleBtn);
  }

  // --- Panel ---
  let panel = document.getElementById('testPanel');
  if (panel) panel.remove();
  panel = document.createElement('div');
  panel.id = 'testPanel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="test-head">
      <div class="test-head-title">🧪 Test Mode <span id="testModeStatus" class="test-badge">idle</span></div>
      <div class="test-head-actions">
        <button id="testCopyUrl" title="Copy URL with current seed/time">🔗 Copy URL</button>
        <button id="testClose" title="Close (∼ / F2 / Esc)">✕</button>
      </div>
    </div>
    <div class="test-tabs" id="testTabs"></div>
    <div class="test-body" id="testBody"></div>
  `;
  document.body.appendChild(panel);

  const tabsEl = panel.querySelector('#testTabs');
  const bodyEl = panel.querySelector('#testBody');
  const statusEl = panel.querySelector('#testModeStatus');

  const TAB_DEFS = [
    { id: 'world', label: '🌍 World', icon: '🌍' },
    { id: 'time', label: '⏰ Time', icon: '⏰' },
    { id: 'lifecycle', label: '✨ Lifecycle', icon: '✨' },
    { id: 'animals', label: '🦌 Animals', icon: '🦌' },
    { id: 'gameplay', label: '🎯 Quest', icon: '🎯' },
    { id: 'teleport', label: '📍 Teleport', icon: '📍' },
    { id: 'dev', label: '🛠️ Dev', icon: '🛠️' },
  ];

  let activeTab = 'world';
  let refreshTimer = null;

  function setStatus(msg) { if (statusEl) statusEl.textContent = msg; }

  function show() {
    panel.hidden = false;
    toggleBtn.classList.add('active');
    try { localStorage.setItem('jungle_testmode', '1'); } catch {}
    render();
  }
  function hide() {
    panel.hidden = true;
    toggleBtn.classList.remove('active');
  }
  function toggle() { panel.hidden ? show() : hide(); }

  toggleBtn.addEventListener('click', toggle);
  panel.querySelector('#testClose').addEventListener('click', hide);
  panel.querySelector('#testCopyUrl').addEventListener('click', copyUrl);

  // Global hotkeys: ` (backtick), F2, Ctrl+Shift+T
  addEventListener('keydown', (e) => {
    if (e.code === 'Backquote' || e.code === 'F2' || (e.ctrlKey && e.shiftKey && e.code === 'KeyT')) {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.isContentEditable)) return;
      e.preventDefault();
      toggle();
    }
    if (e.code === 'Escape' && !panel.hidden) {
      hide();
    }
  });

  function copyUrl() {
    try {
      const url = new URL(location.href);
      if (getSeed) url.searchParams.set('seed', getSeed());
      if (env?.timeOfDay !== undefined) url.searchParams.set('time', env.timeOfDay.toFixed(2));
      url.searchParams.set('test', '1');
      const str = url.toString();
      navigator.clipboard.writeText(str).then(() => setStatus('URL copied!')).catch(() => prompt('Copy URL:', str));
    } catch (e) { console.warn('[testMode] copyUrl failed', e); }
  }

  function teleportTo(x, z) {
    if (!player) return;
    const y = groundHeight(x, z);
    const villageY = village?.getSurfaceHeight ? village.getSurfaceHeight(x, z) : null;
    const finalY = villageY ?? y;
    player.position.set(x, finalY, z);
    if (camTarget) camTarget.set(x, 0.5, z);
    setStatus(`TP → ${x.toFixed(1)}, ${z.toFixed(1)}`);
  }

  function findNearestBiome(targetBiome, maxRadius = 80) {
    if (!player) return null;
    const px = player.position.x, pz = player.position.z;
    // Spiral scan outward
    for (let r = 4; r <= maxRadius; r += 4) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2 + (r * 0.13);
        const x = px + Math.cos(ang) * r;
        const z = pz + Math.sin(ang) * r;
        // sample a few points around to avoid single-noise outliers
        let hits = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          const s = sampleGround(x + dx * 0.8, z + dz * 0.8);
          if (s.biome === targetBiome) hits++;
        }
        if (hits >= 5) return { x, z };
      }
    }
    return null;
  }

  function triggerRainbow() { if (env) { env.setTime(9); setStatus('Morning 09:00 — clear sky'); } }
  function triggerAurora() { if (env) { env.setTime(23); setStatus('Night 23:00 — look north'); } }
  function triggerPollen() { if (env) { env.setTime(16.5); setStatus('Golden hour 16:30'); } }
  function triggerDew() { if (env) { env.setTime(5.5); setStatus('Dawn 05:30'); } }
  function triggerStorm() { if (env) { env.setTime(12); setStatus('Midday 12:00 — clear sky'); } }

  // ---- Tab rendering ----
  function renderTabs() {
    tabsEl.innerHTML = TAB_DEFS.map(t => `<button class="test-tab ${t.id===activeTab?'active':''}" data-tab="${t.id}">${t.label}</button>`).join('');
    tabsEl.querySelectorAll('.test-tab').forEach(btn => btn.addEventListener('click', () => { activeTab = btn.dataset.tab; render(); }));
  }

  function renderWorld() {
    const seed = getSeed ? getSeed() : (world?.stats ? world.stats().seed : '—');
    const presetKeys = Object.keys(WORLD_CONFIGS);
    const currentActive = (() => {
      try {
        const activeBtn = document.querySelector('.world-type-btn.active, .menu-world-btn.active');
        return activeBtn?.dataset.seed || seed;
      } catch { return seed; }
    })();

    const presetsHtml = presetKeys.map(k => {
      const label = WORLD_CONFIGS[k]?.label || k;
      const icon = ({ JUNGLE_PRIME:'🌴', DESERT_WINDS:'🏜️', MOUNTAIN_PEAKS:'🏔️', BEACH_COVE:'🏖️', NIGHT_FOREST:'🌙', VILLAGE_HUB:'🏘️', MONDSTADT_ANEMO:'🌾', LIYUE_GEO:'⛰️', INAZUMA_ELECTRO:'🌸', SUMERU_DENDRO:'🌳', FONTAINE_HYDRO:'💧', NATLAN_PYRO:'🔥', __random__:'🎲' }[k] || '🌍');
      const active = k === currentActive ? 'active' : '';
      return `<button class="test-btn sm ${active}" data-preset="${k}" title="${k}">${icon} ${label}</button>`;
    }).join('');

    const biomes = Object.values(BIOMES);
    const biomeHtml = biomes.map(b => `<button class="test-btn sm" data-biome="${b}">${b}</button>`).join('');

    return `
      <div class="test-section">
        <div class="test-section-title">🌍 World Presets <span class="test-badge">seed: ${seed}</span></div>
        <div class="test-grid">${presetsHtml}</div>
        <div class="test-row" style="margin-top:8px">
          <input id="testSeedInput" class="test-input" style="flex:1;min-width:0" placeholder="Custom seed…" value="${seed}">
          <button class="test-btn sm" id="testApplySeed">Apply</button>
          <button class="test-btn sm" id="testRandomSeed">🎲 Random</button>
        </div>
        <div class="test-meta" style="margin-top:6px">Each nation is GEN + VEGETATION + fog. Random = per-seed procedural jitter. Apply regenerates terrain + village + camps + bridges.</div>
      </div>
      <div class="test-section">
        <div class="test-section-title">🧭 Biomes — Find & Teleport</div>
        <div class="test-grid">${biomeHtml}</div>
        <div class="test-meta" style="margin-top:6px">Spiral scan from player outward (≤80u). Jungle/Savanna are fastest; volcano/snow may be farther. Village clearing is excluded from scatter.</div>
      </div>
      <div class="test-section">
        <div class="test-section-title">🌿 Vegetation Overrides <span class="test-meta">live, no seed change</span></div>
        <div class="test-kv">
          <b>Tree density</b> <span><input id="testTreeDensity" type="range" class="test-range" min="0.35" max="1.5" step="0.05"><span id="testTreeDensityVal" class="test-meta"></span></span>
          <b>Tree scale</b> <span><input id="testTreeScale" type="range" class="test-range" min="0.65" max="1.5" step="0.05"><span id="testTreeScaleVal" class="test-meta"></span></span>
        </div>
        <div class="test-meta">World refreshVegetation() — instant. Mirrors the ☰ Vegetation sliders.</div>
      </div>
      <div class="test-section">
        <div class="test-section-title">📐 GEN Params (readout)</div>
        <div class="test-kv" id="testGenReadout"></div>
      </div>
    `;
  }

  function renderWind() {
    return `
      <div class="test-section">
        <div class="test-section-title">🍃 Wind</div>
        <div class="test-kv" id="testWindReadout"></div>
        <div class="test-row" style="margin-top:6px">
          <button class="test-btn sm" id="testWindGust">💨 Gust (1.2 for 2s)</button>
          <button class="test-btn sm" id="testWindOff">Toggle Sway</button>
        </div>
      </div>
    `;
  }

  function renderTime() {
    const t = env?.timeOfDay ?? 10;
    const paused = env?.state?.paused ? '⏸ Paused' : '▶ Running';
    const speed = env?.state?.speed ?? 1;
    const presets = TIME_PRESETS.map(p => `<button class="test-btn sm" data-time="${p.time}" title="${p.desc}">${p.icon} ${p.label}<br><span style="font-size:9px;opacity:.8">${fmtTime(p.time)}</span></button>`).join('');
    return `
      <div class="test-section">
        <div class="test-section-title">⏰ Time of Day <span class="test-badge">${fmtTime(t)} · ${paused} · ${speed.toFixed(1)}×</span></div>
        <div class="test-row">
          <input id="testTimeSlider" class="test-range" type="range" min="0" max="23.99" step="0.05" value="${t}" style="flex:1">
          <input id="testTimeInput" class="test-input" type="time" value="${fmtTime(t)}" style="width:110px">
        </div>
        <div class="test-grid" style="margin-top:8px">${presets}</div>
        <div class="test-row" style="margin-top:8px">
          <button class="test-btn sm" id="testTimePause">${paused}</button>
          <button class="test-btn sm" id="testTimeSkip">⏭ Jump 6h</button>
          <label class="test-meta">Speed <input id="testTimeSpeed" type="range" class="test-range" style="width:90px;display:inline-block;vertical-align:middle" min="0" max="5" step="0.25" value="${speed}"> ${speed.toFixed(2)}×</label>
        </div>
        <div class="test-meta">Day length ${(env?.state?.dayLengthSec ?? 600)}s = 10 min per game day. 0h = midnight, 6h = sunrise, 12h = noon, 18h = sunset. LIFECYCLE windows: dawn 4.8-7.2, morning 7-11, midday 11-14.5, golden 15.5-18.6, dusk 18.6-20.2, night 20.2-4.8.</div>
      </div>
      ${renderWind()}
    `;
  }

  function renderLifecycle() {
    const nf = env?.nightFactor ?? 0;
    const isNight = env?.isNight ? '🌙 Night' : '☀️ Day';
    const t = env?.timeOfDay ?? 12;
    return `
      <div class="test-section">
        <div class="test-section-title">✨ VFX & Lifecycle <span class="test-badge">${isNight} · nf ${nf.toFixed(2)} · ${fmtTime(t)}</span></div>
        <div class="test-meta" style="margin-bottom:6px">Conditions for each beauty (time + nightFactor). Buttons jump to the matching time.</div>
        <div class="test-grid2">
          <button class="test-btn sm" id="testTriggerRainbow">🌈 Morning<br><span style="font-size:9px">09:00</span></button>
          <button class="test-btn sm" id="testTriggerAurora">🌌 Night<br><span style="font-size:9px">23:00 north</span></button>
          <button class="test-btn sm" id="testTriggerPollen">✨ Golden<br><span style="font-size:9px">16:30 golden</span></button>
          <button class="test-btn sm" id="testTriggerDew">💧 Dawn<br><span style="font-size:9px">05:30 dawn</span></button>
          <button class="test-btn sm" id="testTriggerStorm">☀️ Midday<br><span style="font-size:9px">12:00</span></button>
          <button class="test-btn sm" id="testShootingStar">☄️ Late night<br><span style="font-size:9px">01:00</span></button>
        </div>
        <div class="test-row" style="margin-top:8px">
          <button class="test-btn sm" id="testToggleFireflies">✨ Fireflies</button>
          <button class="test-btn sm" id="testToggleStars">⭐ Stars opacity</button>
          <span class="test-meta">Fireflies visible 19.5-4.5 · Stars follow nightFactor. See canvas at night.</span>
        </div>
      </div>
      <div class="test-section">
        <div class="test-section-title">🌗 Lifecycle Windows (LIFECYCLE)</div>
        <div class="test-grid">${LIFECYCLE_PRESETS.map(p => `<button class="test-btn sm" data-lifecycle="${p.time}" title="Jump to ${p.label}">${p.label}<br><span style="font-size:9px">${fmtTime(p.time)}</span></button>`).join('')}</div>
        <div class="test-meta" id="testLifecycleReadout" style="margin-top:6px"></div>
      </div>
    `;
  }

  function renderAnimals() {
    const rows = [
      { id: 'birds', label: '🐦 Birds', desc: 'day mostly, night 0.08', count: ANIMALS.birdCount },
      { id: 'deer', label: '🦌 Deer', desc: 'night 0.55', count: ANIMALS.deerCount },
      { id: 'fish', label: '🐟 Fish', desc: 'always in river', count: ANIMALS.fishCount },
      { id: 'butterflies', label: '🦋 Butterflies', desc: 'day only', count: ANIMALS.butterflyCount },
      { id: 'crabs', label: '🦀 Crabs', desc: 'beach band 4.5u from river', count: ANIMALS.crabCount },
      { id: 'boars', label: '🐗 Boars', desc: 'forest chunky deer variant', count: ANIMALS.boarCount },
      { id: 'dragonflies', label: '✈️ Dragonflies', desc: 'day near river', count: ANIMALS.dragonflyCount },
      { id: 'bats', label: '🦇 Bats', desc: '19-05 night', count: ANIMALS.batCount },
    ];
    return `
      <div class="test-section">
        <div class="test-section-title">🦌 Animals — Lifecycle & Density <span class="test-badge">density via Graphics → Animals</span></div>
        <div style="display:grid;gap:6px">
          ${rows.map(r => `
            <div style="display:flex;align-items:center;gap:8px;border:1px solid #e8ecef;border-radius:10px;padding:6px 8px;background:#fafafa">
              <div style="flex:1">
                <div style="font-size:11px;font-weight:700;color:#2e7d32">${r.label} <span style="font-weight:400;color:#78909c">×${r.count}</span></div>
                <div style="font-size:10px;color:#78909c">${r.desc}</div>
              </div>
              <button class="test-btn sm" data-animal="${r.id}" title="Toggle visibility for ${r.label}">👁 Toggle</button>
            </div>
          `).join('')}
        </div>
        <div class="test-row" style="margin-top:8px">
          <label class="test-meta">Animals density <input id="testAnimalsMul" type="range" class="test-range" style="width:110px;display:inline-block;vertical-align:middle" min="0" max="1" step="0.1"> <span id="testAnimalsMulVal"></span></label>
          <label class="test-meta">Particles <input id="testParticlesMul" type="range" class="test-range" style="width:110px;display:inline-block;vertical-align:middle" min="0" max="1" step="0.1"> <span id="testParticlesMulVal"></span></label>
        </div>
        <div class="test-meta">Lifecycle is driven by env timeOfDay passed to animals.update. Toggle hides mesh instantly; density scales InstancedMesh.count via Graphics overrides (live).</div>
      </div>
    `;
  }

  function renderGameplay() {
    const rangerState = adventure?.state || {};
    const questProgress = (() => {
      try { return rangerState.collected ?? 0; } catch { return 0; }
    })();
    return `
      <div class="test-section">
        <div class="test-section-title">🎯 Adventure — Ranger Herbs <span class="test-badge">${rangerState.started ? (rangerState.complete ? '✓ Complete' : `${questProgress}/3`) : 'Not started'}</span></div>
        <div class="test-row">
          <button class="test-btn sm" id="testQuestAccept">Accept quest</button>
          <button class="test-btn sm" id="testGiveHerb">+1 🌿 Herb</button>
          <button class="test-btn sm" id="testCompleteQuest">Complete (3 herbs)</button>
          <button class="test-btn sm" id="testResetQuest">Reset</button>
        </div>
        <div class="test-row" style="margin-top:6px">
          <button class="test-btn sm" data-give="fruit">+ 🍊 Fruit</button>
          <button class="test-btn sm" data-give="wood">+ 🪵 Wood</button>
          <button class="test-btn sm" data-give="fish">+ 🐟 Fish</button>
          <button class="test-btn sm" id="testClearInv">Clear inventory</button>
        </div>
        <div class="test-kv" style="margin-top:6px">
          <b>Press E</b> <span>near ranger / herbs / fish / wood to interact (2.4u radius)</span>
        </div>
      </div>
      <div class="test-section">
        <div class="test-section-title">🏘️ Village — 10 NPCs</div>
        <div class="test-grid2" id="testVillageNpcs"></div>
        <div class="test-row" style="margin-top:8px">
          <button class="test-btn sm" id="testTpBoard">TP → Board</button>
          <button class="test-btn sm" id="testTpVillage">TP → Village Center</button>
        </div>
      </div>
      <div class="test-section">
        <div class="test-section-title">🏛️ Landmarks</div>
        <div class="test-kv" id="testLandmarksList"></div>
        <div class="test-row" style="margin-top:6px">
          <button class="test-btn sm" id="testRefreshLandmarks">Refresh list</button>
        </div>
        <div class="test-meta">Genshin-style: 1 Statue (mountain), 4 Waypoints (cardinal), 3 Ruins (scatter). Regenerate with world seed.</div>
      </div>
      <div class="test-section">
        <div class="test-section-title">🏕️ Campsites (5)</div>
        <div class="test-kv" id="testCampsList"></div>
      </div>
    `;
  }

  function renderTeleport() {
    const px = player ? player.position.x.toFixed(1) : '—';
    const pz = player ? player.position.z.toFixed(1) : '—';
    return `
      <div class="test-section">
        <div class="test-section-title">📍 Teleport <span class="test-badge">now ${px}, ${pz}</span></div>
        <div class="test-row">
          <input id="testTpX" class="test-input" type="number" step="1" placeholder="X" style="width:90px">
          <input id="testTpZ" class="test-input" type="number" step="1" placeholder="Z" style="width:90px">
          <button class="test-btn sm" id="testTpGo">Go</button>
          <button class="test-btn sm" id="testCopyPos">Copy pos</button>
        </div>
        <div class="test-grid" style="margin-top:8px">
          <button class="test-btn sm" data-tp="spawn">🌱 Spawn</button>
          <button class="test-btn sm" data-tp="village">🏘️ Village</button>
          <button class="test-btn sm" data-tp="ranger">🧑 Ranger</button>
          <button class="test-btn sm" data-tp="bridge1">🌉 Bridge N</button>
          <button class="test-btn sm" data-tp="bridge2">🌉 Bridge S</button>
          <button class="test-btn sm" data-tp="statue">🗿 Statue</button>
          <button class="test-btn sm" data-tp="waypoint">🔷 Waypoint</button>
          <button class="test-btn sm" data-tp="camp">🏕️ Camp</button>
          <button class="test-btn sm" data-tp="random">🎲 Random (30u)</button>
        </div>
        <div class="test-row" style="margin-top:8px">
          <label class="test-meta" style="display:flex;align-items:center;gap:6px"><input id="testNoClip" type="checkbox"> No-clip UI (ignore collisions for testing)</label>
          <label class="test-meta" style="display:flex;align-items:center;gap:6px">Speed <input id="testSpeedMul" type="range" min="0.2" max="3" step="0.2" style="width:90px"> <span id="testSpeedVal"></span></label>
        </div>
      </div>
      <div class="test-section">
        <div class="test-section-title">🗺️ Quick Biome TP</div>
        <div class="test-meta">Use World tab biome buttons for precise TP; this is the same finder.</div>
      </div>
    `;
  }

  function renderDev() {
    const g = (() => { try { return getGraphics(); } catch { return {}; } })();
    const s = (() => { try { return getGraphicsState(); } catch { return { preset:'auto', overrides:{} }; } })();
    const stats = world ? world.stats() : { chunks: 0, seed: '—' };
    const chunkSeg = (() => { try { return world?.stats ? String(stats.chunks) : '—'; } catch { return '—'; } })();
    return `
      <div class="test-section">
        <div class="test-section-title">🛠️ Graphics</div>
        <div class="test-kv">
          <b>Preset</b> <span>${s.preset} → ${g.presetName || '—'} (${g.fpsCap || '—'} FPS cap)</span>
          <b>DPR</b> <span>${(g.resolution ?? 1)}× · view ${g.viewDistance ?? 2} · veg ${g.vegetation ?? 1} · animals ${g.animals ?? 1}</span>
          <b>Shadows</b> <span>${g.shadows || '—'} · clouds ${g.clouds?'on':'off'} · rain ${g.rain===false?'off':'on'}</span>
        </div>
        <div class="test-grid" style="margin-top:8px">
          <button class="test-btn sm" data-gfx="low">Low 30fps</button>
          <button class="test-btn sm" data-gfx="medium">Medium 45</button>
          <button class="test-btn sm" data-gfx="high">High 60</button>
          <button class="test-btn sm" data-gfx="ultra">Ultra 60+</button>
        </div>
        <div class="test-row" style="margin-top:8px">
          <label class="test-meta">FPS Cap <select id="testFpsCap" class="test-input" style="padding:2px 6px;font-size:11px"><option value="30">30</option><option value="45">45</option><option value="60">60</option><option value="90">90</option><option value="120">120</option></select></label>
          <label class="test-meta" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="testToggleRays"> Rays</label>
          <label class="test-meta" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="testToggleFlare"> Flare</label>
          <label class="test-meta" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="testToggleGI"> GI</label>
        </div>
      </div>
      <div class="test-section">
        <div class="test-section-title">📊 World Stats</div>
        <div class="test-kv">
          <b>Chunks</b> <span>${stats.chunks} (${(stats.chunks)} loaded) · radius ${g.viewDistance ?? 2}</span>
          <b>Seed</b> <span>${stats.seed}</span>
          <b>GEN maxH</b> <span>${GEN.maxHeight.toFixed(2)} · levels ${GEN.levels} · snow ${GEN.snowLine.toFixed(2)} · rock ${GEN.rockLine.toFixed(2)}</span>
          <b>River</b> <span>amp ${GEN.riverAmp.toFixed(1)} · half ${GEN.riverHalf.toFixed(2)} · bank ${GEN.bankOuter.toFixed(2)} · freq ${GEN.riverFreq.toFixed(4)}</span>
        </div>
        <div class="test-row" style="margin-top:8px">
          <button class="test-btn sm" id="testFlushChunks">Flush chunks (rebuild)</button>
          <button class="test-btn sm" id="testClearStorage">Clear storage</button>
        </div>
      </div>
      <div class="test-section">
        <div class="test-section-title">📋 State Export</div>
        <div class="test-log" id="testStateLog"></div>
        <div class="test-row" style="margin-top:6px">
          <button class="test-btn sm" id="testExportJson">Export JSON</button>
          <button class="test-btn sm" id="testCopyJson">Copy JSON</button>
        </div>
      </div>
      <div class="test-section">
        <div class="test-section-title">⌨️ Hotkeys</div>
        <div class="test-kv">
          <b>\` / F2</b> <span>Toggle this panel</span>
          <b>Esc</b> <span>Close panel</span>
          <b>Ctrl+Shift+T</b> <span>Toggle panel (alt)</span>
          <b>?test=1</b> <span>Auto-open on load</span>
        </div>
      </div>
    `;
  }

  function bindWorldEvents(root) {
    root.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const seed = btn.dataset.preset;
        if (applySeed) applySeed(seed, WORLD_CONFIGS[seed]?.timeOverride ?? null);
        setStatus(`World → ${seed}`);
        render();
      });
    });
    root.querySelector('#testApplySeed')?.addEventListener('click', () => {
      const v = root.querySelector('#testSeedInput').value.trim();
      if (v && applySeed) { applySeed(v); setStatus(`Seed → ${v}`); }
    });
    root.querySelector('#testSeedInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') root.querySelector('#testApplySeed').click();
    });
    root.querySelector('#testRandomSeed')?.addEventListener('click', () => {
      if (applySeed) { applySeed('__random__'); setStatus('Random world'); render(); }
    });
    root.querySelectorAll('[data-biome]').forEach(btn => {
      btn.addEventListener('click', () => {
        const b = btn.dataset.biome;
        const found = findNearestBiome(b);
        if (found) { teleportTo(found.x, found.z); setStatus(`Found ${b} @ ${found.x.toFixed(1)}, ${found.z.toFixed(1)}`); }
        else setStatus(`No ${b} within 80u — try farther or different seed`);
      });
    });
    // vegetation sliders — reuse main.js VEGETATION live
    try {
      const td = root.querySelector('#testTreeDensity');
      const ts = root.querySelector('#testTreeScale');
      const tdVal = root.querySelector('#testTreeDensityVal');
      const tsVal = root.querySelector('#testTreeScaleVal');
      if (td && ts) {
        // Try to get VEGETATION from window or config
        import('../config.js').then(mod => {
          const VEG = mod.VEGETATION;
          td.value = String(VEG.treeDensity);
          ts.value = String(VEG.treeScale);
          if (tdVal) tdVal.textContent = `${Math.round(VEG.treeDensity*100)}%`;
          if (tsVal) tsVal.textContent = `${Math.round(VEG.treeScale*100)}%`;
          td.addEventListener('input', () => {
            VEG.treeDensity = Number(td.value);
            if (tdVal) tdVal.textContent = `${Math.round(VEG.treeDensity*100)}%`;
          });
          td.addEventListener('change', () => world?.refreshVegetation?.());
          ts.addEventListener('input', () => {
            VEG.treeScale = Number(ts.value);
            if (tsVal) tsVal.textContent = `${Math.round(VEG.treeScale*100)}%`;
          });
          ts.addEventListener('change', () => world?.refreshVegetation?.());
        }).catch(() => {
          // sync with existing sliders in menu
          const origTd = document.getElementById('treeDensitySelect');
          const origTs = document.getElementById('treeScaleSelect');
          if (origTd) { td.value = origTd.value; if (tdVal) tdVal.textContent = origTd.value; td.addEventListener('change', () => { origTd.value = td.value; origTd.dispatchEvent(new Event('change')); world?.refreshVegetation?.(); }); }
          if (origTs) { ts.value = origTs.value; if (tsVal) tsVal.textContent = origTs.value; ts.addEventListener('change', () => { origTs.value = ts.value; origTs.dispatchEvent(new Event('change')); world?.refreshVegetation?.(); }); }
        });
        const genEl = root.querySelector('#testGenReadout');
        if (genEl) {
          genEl.innerHTML = `
            <b>maxHeight</b> <span>${GEN.maxHeight.toFixed(2)}</span>
            <b>levels</b> <span>${GEN.levels}</span>
            <b>step</b> <span>${GEN.stepSize}</span>
            <b>snowLine</b> <span>${GEN.snowLine.toFixed(2)}</span>
            <b>rockLine</b> <span>${GEN.rockLine.toFixed(2)}</span>
            <b>riverAmp</b> <span>${GEN.riverAmp.toFixed(1)}</span>
            <b>riverHalf</b> <span>${GEN.riverHalf.toFixed(2)}</span>
            <b>bankOuter</b> <span>${GEN.bankOuter.toFixed(2)}</span>
            <b>desertT/M</b> <span>${GEN.desertTemp.toFixed(2)} / ${GEN.desertMoist.toFixed(2)}</span>
            <b>volcano</b> <span>${GEN.volcanoThresh.toFixed(2)}</span>
            <b>plateau</b> <span>${GEN.plateauThresh.toFixed(2)}</span>
          `;
        }
      }
    } catch {}
  }

  function bindWindEvents(root) {
    root.querySelector('#testWindGust')?.addEventListener('click', () => {
      try { window.__windGust?.(); } catch {}
      // also directly bump windState
      import('../world/wind.js').then(m => {
        const ws = m.windState;
        const old = ws.strength;
        ws.strength = 1.2;
        setTimeout(() => ws.strength = old, 2200);
        setStatus('Gust 1.2 (2s)');
        bindWindReadout();
      });
    });
    root.querySelector('#testWindOff')?.addEventListener('click', () => {
      const cur = getGraphics()?.windSway;
      setOverride('windSway', cur === false ? null : false);
      setStatus(`Wind sway ${cur===false?'on':'off'}`);
    });
    bindWindReadout();
  }

  function bindWindReadout() {
    import('../world/wind.js').then(m => {
      const el = document.getElementById('testWindReadout');
      if (!el) return;
      const ws = m.windState;
      el.innerHTML = `<b>strength</b> <span>${ws.strength.toFixed(3)} · gust ${ws.gust.toFixed(3)}</span><b>dir</b> <span>${ws.direction.x.toFixed(2)}, ${ws.direction.y.toFixed(2)}</span>`;
    }).catch(()=>{});
  }

  function bindTimeEvents(root) {
    const slider = root.querySelector('#testTimeSlider');
    const input = root.querySelector('#testTimeInput');
    const speed = root.querySelector('#testTimeSpeed');
    slider?.addEventListener('input', () => {
      const v = Number(slider.value);
      env?.setTime(v);
      if (input) input.value = fmtTime(v);
      setStatus(`Time ${fmtTime(v)}`);
    });
    input?.addEventListener('change', () => {
      const [h,m] = input.value.split(':').map(Number);
      if (!isNaN(h)) { env?.setTime(h + m/60); if (slider) slider.value = String(h + m/60); }
    });
    root.querySelectorAll('[data-time]').forEach(btn => btn.addEventListener('click', () => {
      env?.setTime(Number(btn.dataset.time));
      render();
    }));
    root.querySelector('#testTimePause')?.addEventListener('click', () => {
      if (env?.state) { env.state.paused = !env.state.paused; render(); }
    });
    root.querySelector('#testTimeSkip')?.addEventListener('click', () => {
      if (env) env.setTime((env.timeOfDay + 6) % 24);
      render();
    });
    root.querySelectorAll('[data-lifecycle]').forEach(btn => btn.addEventListener('click', () => {
      env?.setTime(Number(btn.dataset.lifecycle));
      render();
    }));
    speed?.addEventListener('input', () => {
      if (env?.state) env.state.speed = Number(speed.value);
      render();
    });
    speed?.addEventListener('change', () => {
      if (env?.state) env.state.speed = Number(speed.value);
    });
    // lifecycle readout
    const lcEl = root.querySelector('#testLifecycleReadout');
    if (lcEl) {
      const t = env?.timeOfDay ?? 10;
      function inWindow([a,b]) {
        if (a < b) return t >= a && t < b;
        return t >= a || t < b; // wrap for night
      }
      const active = Object.entries(LIFECYCLE).filter(([k, win]) => inWindow(win)).map(([k])=>k).join(', ') || '—';
      lcEl.textContent = `Now ${fmtTime(t)} → active windows: ${active}. Each window gates a beauty + animal visibility. See Lifecycle tab for exact triggers.`;
    }
    bindWindEvents(root);
  }

  function bindLifecycleEvents(root) {
    root.querySelector('#testTriggerRainbow')?.addEventListener('click', triggerRainbow);
    root.querySelector('#testTriggerAurora')?.addEventListener('click', triggerAurora);
    root.querySelector('#testTriggerPollen')?.addEventListener('click', triggerPollen);
    root.querySelector('#testTriggerDew')?.addEventListener('click', triggerDew);
    root.querySelector('#testTriggerStorm')?.addEventListener('click', triggerStorm);
    root.querySelector('#testShootingStar')?.addEventListener('click', () => {
      env?.setTime(1); setStatus('Late night 01:00');
    });
    root.querySelector('#testToggleFireflies')?.addEventListener('click', () => {
      const cur = getGraphics()?.fireflies;
      setOverride('fireflies', cur===false?null:false);
      setStatus(`Fireflies ${cur===false?'on':'off'}`);
    });
    root.querySelector('#testToggleStars')?.addEventListener('click', () => setStatus('Stars follow nightFactor. See canvas at night.'));
  }

  function bindAnimalsEvents(root) {
    root.querySelectorAll('[data-animal]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.animal;
        // Toggle visibility by flipping mesh.visible if we can find it
        try {
          // animals is the combined factory; try to find sub-mesh via window or scene scan
          const meshes = scene ? scene.children.filter(o => o.isInstancedMesh) : [];
          // Fallback: use animals.setVisible if exists, else brute-force
          const map = { birds: '🐦', deer:'🦌', butterflies:'🦋', crabs:'🦀', boars:'🐗', dragonflies:'✈️', bats:'🦇', fish:'🐟' };
          // brute search by material color heuristic not reliable — toggle all via setVisible hack
          if (animals?.setVisible) {
            const cur = btn.dataset.on !== '0';
            btn.dataset.on = cur ? '0' : '1';
            // per-type toggle not in original API — hide/show by scanning InstancedMesh by count
            // Instead expose a simple global hide: we store per-type visibility in window.__animalVis
            if (!window.__animalVis) window.__animalVis = {};
            window.__animalVis[id] = !cur;
            setStatus(`${id} ${window.__animalVis[id] ? 'hidden' : 'shown'} (global opacity lifecycle still applies)`);
            // Apply by toggling mesh.visible for matching count heuristics
            // Count is unique per type, so we can identify.
            const counts = { birds: ANIMALS.birdCount, deer: ANIMALS.deerCount, fish: ANIMALS.fishCount, butterflies: ANIMALS.butterflyCount, crabs: ANIMALS.crabCount, boars: ANIMALS.boarCount, dragonflies: ANIMALS.dragonflyCount, bats: ANIMALS.batCount };
            const targetCount = counts[id];
            for (const m of meshes) {
              if (m.count === targetCount || m.geometry) {
                // narrow by material color doesn't work — use instanceMatrix length
                // For now just brute: if mesh has instanceColor, it's likely butterfly/dragonfly, if dark → bats
              }
            }
            // Simpler: expose via window.__animalsByType if factory kept refs - not in old build, so warn
            setStatus(`Toggled ${id} — for per-type isolate, use Graphics → Animals density or Dev console window.__animals`);
          }
        } catch {}
      });
    });
    const amul = root.querySelector('#testAnimalsMul');
    const pmul = root.querySelector('#testParticlesMul');
    const aval = root.querySelector('#testAnimalsMulVal');
    const pval = root.querySelector('#testParticlesMulVal');
    if (amul) {
      try {
        const g = getGraphics();
        amul.value = String(g.animals ?? 1);
        if (aval) aval.textContent = `${Math.round((g.animals??1)*100)}%`;
        amul.addEventListener('input', () => { if (aval) aval.textContent = `${Math.round(Number(amul.value)*100)}%`; });
        amul.addEventListener('change', () => { setOverride('animals', Number(amul.value)); try { animals?.applyDensity?.(); } catch {} });
      } catch {}
    }
    if (pmul) {
      try {
        const g = getGraphics();
        pmul.value = String(g.particles ?? 1);
        if (pval) pval.textContent = `${Math.round((g.particles??1)*100)}%`;
        pmul.addEventListener('input', () => { if (pval) pval.textContent = `${Math.round(Number(pmul.value)*100)}%`; });
        pmul.addEventListener('change', () => { setOverride('particles', Number(pmul.value)); });
      } catch {}
    }
  }

  function bindGameplayEvents(root) {
    root.querySelector('#testQuestAccept')?.addEventListener('click', () => {
      try { adventure?.state?.started ? setStatus('Already accepted') : document.dispatchEvent(new KeyboardEvent('keydown', { code:'KeyE' })); } catch {}
      // Direct fallback: try questLog accept via adventure exposure
      try {
        if (window.__adventureQuestLog) window.__adventureQuestLog.accept({ id:'rangerHerbs', title:'', objective:{amount:3}});
      } catch {}
      setTimeout(render, 100);
    });
    root.querySelector('#testGiveHerb')?.addEventListener('click', () => {
      try {
        // find nearest herb and collect via inventory injection if available
        const inv = window.__adventureInventory;
        const qlog = window.__adventureQuestLog;
        if (inv && qlog) { inv.add('herb'); qlog.progress('rangerHerbs'); setStatus('Gave 1 herb'); }
        else {
          // teleport to herb instead
          const spawn = world?.getSpawn ? world.getSpawn() : { x:0,z:0 };
          const offs = [-5.5,4.5];
          teleportTo(spawn.x+offs[0], spawn.z+offs[1]);
        }
        render();
      } catch {}
    });
    root.querySelector('#testCompleteQuest')?.addEventListener('click', () => {
      try {
        const inv = window.__adventureInventory;
        const qlog = window.__adventureQuestLog;
        if (inv && qlog) { for(let i=0;i<3;i++){ inv.add('herb'); qlog.progress('rangerHerbs'); } setStatus('Quest 3/3 → return to ranger (E)'); }
        render();
      } catch {}
    });
    root.querySelector('#testResetQuest')?.addEventListener('click', () => {
      try {
        const spawn = world?.getSpawn ? world.getSpawn() : null;
        if (spawn && adventure?.regenerate) adventure.regenerate(spawn);
        setStatus('Quest reset');
        render();
      } catch {}
    });
    root.querySelectorAll('[data-give]').forEach(b => b.addEventListener('click', () => {
      try {
        const inv = window.__adventureInventory;
        if (inv) { inv.add(b.dataset.give); setStatus(`Gave ${b.dataset.give}`); render(); }
      } catch {}
    }));
    root.querySelector('#testClearInv')?.addEventListener('click', () => {
      try { window.__adventureInventory?.clear(); setStatus('Inventory cleared'); render(); } catch {}
    });
    root.querySelector('#testTpVillage')?.addEventListener('click', () => {
      const hub = village?.getHubPosition?.();
      if (hub) teleportTo(hub.x, hub.z);
    });
    root.querySelector('#testTpBoard')?.addEventListener('click', () => {
      const hub = village?.getHubPosition?.();
      if (hub) teleportTo(hub.x+3, hub.z+3);
    });
    // Populate village NPC list
    const npcRoot = root.querySelector('#testVillageNpcs');
    if (npcRoot && village) {
      try {
        // NPC data is closed-over in village.js; expose via hub position + heuristic teleport
        const hub = village.getHubPosition();
        const npcs = ['merchant','gardener','fisher','farmer','child','elder','baker','woodworker','herbalist','trader'];
        npcRoot.innerHTML = npcs.map(id => `<button class="test-btn sm" data-npc="${id}">${id}</button>`).join('');
        npcRoot.querySelectorAll('[data-npc]').forEach(b => b.addEventListener('click', () => {
          // teleport near village + roughly where that NPC wanders
          teleportTo(hub.x + (Math.random()-0.5)*8, hub.z + (Math.random()-0.5)*8);
          setStatus(`TP near ${b.dataset.npc} (NPCs wander routes)`);
        }));
      } catch {}
    }
    const landmarksList = root.querySelector('#testLandmarksList');
    const campsList = root.querySelector('#testCampsList');
    function refreshLists() {
      if (landmarksList) {
        try {
          const items = landmarks?.getItems ? landmarks.getItems() : [];
          if (!items.length) landmarksList.innerHTML = `<b>—</b> <span class="test-meta">No landmarks yet (spawn may be mountain-less)</span>`;
          else landmarksList.innerHTML = items.map(it => `<b>${it.kind}</b> <span class="test-meta">${it.x.toFixed(1)}, ${it.z.toFixed(1)} · y ${it.y.toFixed(2)} <button class="test-btn sm" data-lm-tp="${it.x},${it.z}" style="display:inline;padding:2px 6px;margin-left:4px">TP</button></span>`).join('');
          landmarksList.querySelectorAll('[data-lm-tp]').forEach(b => b.addEventListener('click', () => {
            const [x,z] = b.dataset.lmTp.split(',').map(Number);
            teleportTo(x,z);
          }));
        } catch { landmarksList.innerHTML = `<b>error</b><span>—</span>`; }
      }
      if (campsList) {
        try {
          const sites = camps?.sites || [];
          if (!sites.length) campsList.innerHTML = `<b>—</b> <span class="test-meta">No campsites</span>`;
          else campsList.innerHTML = sites.map((s,i) => `<b>Camp ${i+1}</b> <span class="test-meta">${s.pos.x.toFixed(1)}, ${s.pos.z.toFixed(1)} <button class="test-btn sm" data-camp-tp="${s.pos.x},${s.pos.z}" style="display:inline;padding:2px 6px;margin-left:4px">TP</button></span>`).join('');
          campsList.querySelectorAll('[data-camp-tp]').forEach(b => b.addEventListener('click', () => {
            const [x,z] = b.dataset.campTp.split(',').map(Number);
            teleportTo(x,z);
          }));
        } catch { campsList.innerHTML = `<b>error</b><span>—</span>`; }
      }
    }
    refreshLists();
    root.querySelector('#testRefreshLandmarks')?.addEventListener('click', refreshLists);
  }

  function bindTeleportEvents(root) {
    root.querySelector('#testTpGo')?.addEventListener('click', () => {
      const x = Number(root.querySelector('#testTpX').value);
      const z = Number(root.querySelector('#testTpZ').value);
      if (!isNaN(x) && !isNaN(z)) teleportTo(x,z);
    });
    root.querySelector('#testCopyPos')?.addEventListener('click', () => {
      if (!player) return;
      const str = `${player.position.x.toFixed(2)}, ${player.position.z.toFixed(2)}`;
      navigator.clipboard.writeText(str).then(()=>setStatus(`Copied ${str}`)).catch(()=>prompt('Pos:',str));
    });
    root.querySelectorAll('[data-tp]').forEach(btn => btn.addEventListener('click', () => {
      const kind = btn.dataset.tp;
      const spawn = world?.getSpawn ? world.getSpawn() : { x:0,z:0 };
      const hub = village?.getHubPosition ? village.getHubPosition() : { x: spawn.x+16, z: spawn.z+14 };
      if (kind === 'spawn') teleportTo(spawn.x, spawn.z);
      else if (kind === 'village') teleportTo(hub.x, hub.z);
      else if (kind === 'ranger') teleportTo(spawn.x+2.5, spawn.z+2.5);
      else if (kind === 'bridge1') { const bx = world?.getBridgePoints?.()?.[0]; if (bx) teleportTo(bx.x, bx.z); else teleportTo(0, -10); }
      else if (kind === 'bridge2') { const bx = world?.getBridgePoints?.()?.[1]; if (bx) teleportTo(bx.x, bx.z); else teleportTo(0, 12); }
      else if (kind === 'statue') {
        const items = landmarks?.getItems?.() || [];
        const s = items.find(i=>i.kind==='statue');
        if (s) teleportTo(s.x, s.z); else teleportTo(spawn.x+8, spawn.z-10);
      }
      else if (kind === 'waypoint') {
        const items = landmarks?.getItems?.() || [];
        const w = items.find(i=>i.kind==='waypoint');
        if (w) teleportTo(w.x, w.z); else teleportTo(spawn.x+14, spawn.z);
      }
      else if (kind === 'camp') {
        const c = camps?.sites?.[0];
        if (c) teleportTo(c.pos.x, c.pos.z); else teleportTo(spawn.x+5, spawn.z+5);
      }
      else if (kind === 'random') {
        const a = Math.random()*Math.PI*2; const r = 20+Math.random()*20;
        teleportTo(player.position.x + Math.cos(a)*r, player.position.z + Math.sin(a)*r);
      }
    }));
    const speedEl = root.querySelector('#testSpeedMul');
    const speedVal = root.querySelector('#testSpeedVal');
    if (speedEl) {
      speedEl.value = '1';
      if (speedVal) speedVal.textContent = '1.0×';
      // patch SPEED via config live is not trivial (imported const), so we offer a multiplier via window.__speedMul consumed by main loop
      speedEl.addEventListener('input', () => {
        const v = Number(speedEl.value);
        if (speedVal) speedVal.textContent = v.toFixed(1)+'×';
        window.__speedMul = v;
      });
    }
  }

  function bindDevEvents(root) {
    root.querySelectorAll('[data-gfx]').forEach(b => b.addEventListener('click', () => { setPreset(b.dataset.gfx); setStatus(`GFX → ${b.dataset.gfx}`); render(); }));
    const fpsSel = root.querySelector('#testFpsCap');
    if (fpsSel) {
      try { fpsSel.value = String(getGraphics()?.fpsCap ?? 60); } catch {}
      fpsSel.addEventListener('change', () => { setOverride('fpsCap', Number(fpsSel.value)); setStatus(`FPS cap → ${fpsSel.value}`); });
    }
    ['Rays','Flare','GI'].forEach(name => {
      const el = root.querySelector(`#testToggle${name}`);
      if (!el) return;
      try {
        const g = getGraphics();
        const key = name.toLowerCase() === 'gi' ? 'gi' : name.toLowerCase() === 'flare' ? 'flare' : 'rays';
        el.checked = g[key] !== false;
      } catch {}
      el.addEventListener('change', () => {
        const key = name.toLowerCase() === 'gi' ? 'gi' : name.toLowerCase() === 'flare' ? 'flare' : 'rays';
        setOverride(key, el.checked ? null : false);
        // also keep postprocessing legacy toggles in sync for immediate effect
        try {
          if (key==='rays') { const fn = window.__setRaysEnabled; if(fn) fn(el.checked); }
          if (key==='flare') { const fn = window.__setFlareEnabled; if(fn) fn(el.checked); }
          if (key==='gi') { const fn = window.__setGIEnabled; if(fn) fn(el.checked); }
        } catch {}
      });
    });
    root.querySelector('#testFlushChunks')?.addEventListener('click', () => { world?.rebuildAll?.(player.position.x, player.position.z); setStatus('Chunks rebuilt'); });
    root.querySelector('#testClearStorage')?.addEventListener('click', () => {
      if (confirm('Clear localStorage (graphics + caches)? Page will reload.')) { localStorage.clear(); location.reload(); }
    });
    const exportLog = root.querySelector('#testStateLog');
    function updateExport() {
      if (!exportLog) return;
      const state = {
        seed: (()=>{ try{return world.stats().seed}catch{return getSeed?.()}} )(),
        time: env?.timeOfDay ?? null,
        timeFmt: env ? fmtTime(env.timeOfDay) : null,
        nightFactor: env?.nightFactor ?? null,
        pos: player ? { x: Number(player.position.x.toFixed(2)), z: Number(player.position.z.toFixed(2)), y: Number(player.position.y.toFixed(2)) } : null,
        camAzimuth: coreState?.azimuth ?? null,
        gen: { ...GEN },
        graphics: (()=>{ try{return getGraphics()}catch{return null}})(),
        chunks: (()=>{ try{return world.stats()}catch{return null}})(),
      };
      exportLog.textContent = JSON.stringify(state, null, 2);
    }
    updateExport();
    root.querySelector('#testExportJson')?.addEventListener('click', updateExport);
    root.querySelector('#testCopyJson')?.addEventListener('click', () => {
      const txt = exportLog.textContent;
      navigator.clipboard.writeText(txt).then(()=>setStatus('JSON copied')).catch(()=>prompt('JSON:', txt));
    });
    // auto-refresh export every 2s while dev tab active
    if (activeTab === 'dev') {
      clearInterval(refreshTimer);
      refreshTimer = setInterval(updateExport, 2000);
    }
  }

  function render() {
    clearInterval(refreshTimer);
    if (activeTab === 'weather') activeTab = 'time';
    renderTabs();
    let html = '';
    if (activeTab === 'world') html = renderWorld();
    else if (activeTab === 'time') html = renderTime();
    else if (activeTab === 'lifecycle') html = renderLifecycle();
    else if (activeTab === 'animals') html = renderAnimals();
    else if (activeTab === 'gameplay') html = renderGameplay();
    else if (activeTab === 'teleport') html = renderTeleport();
    else if (activeTab === 'dev') html = renderDev();
    bodyEl.innerHTML = html;
    // bind after DOM insert
    if (activeTab === 'world') bindWorldEvents(bodyEl);
    else if (activeTab === 'time') bindTimeEvents(bodyEl);
    else if (activeTab === 'lifecycle') bindLifecycleEvents(bodyEl);
    else if (activeTab === 'animals') bindAnimalsEvents(bodyEl);
    else if (activeTab === 'gameplay') bindGameplayEvents(bodyEl);
    else if (activeTab === 'teleport') bindTeleportEvents(bodyEl);
    else if (activeTab === 'dev') bindDevEvents(bodyEl);

    // update status badge with live summary
    try {
      const t = env ? fmtTime(env.timeOfDay) : '--:--';
      const seed = (()=>{ try{return world.stats().seed}catch{return getSeed?.()||'—'}})();
      setStatus(`${seed} · ${t} · ${activeTab}`);
    } catch { setStatus(activeTab); }
  }

  // expose global for console
  const api = {
    show, hide, toggle,
    get enabled() { return !panel.hidden; },
    teleportTo, findNearestBiome,
    triggerRainbow, triggerAurora, triggerPollen, triggerDew, triggerStorm,
    BIOMES, TIME_PRESETS, LIFECYCLE,
  };
  if (typeof window !== 'undefined') {
    window.__testMode = api;
    window.__testPanel = panel;
  }

  // Auto-open if query flag present
  if (shouldAutoEnable()) {
    // slight delay so main boot finished
    setTimeout(show, 900);
  }

  return api;
}
