# Realism Upgrade Plan — Static Assets, Vegetation, Water, Grass, Wind, Lighting + Bloom

Goal: push Jungle Stroll from stylized low-poly toward **grounded semi-realism** while keeping the seeded procedural infinite world, chunk streaming, and mobile performance tier (`src/core/setup.js:QUALITY`).

This is a planning doc. No runtime change is made by merging this file.

## 0. Vision & Constraints

* Keep: infinite seeded world, chunk streaming (`src/world/chunks.js`), biome system (`src/world/procedural.js`), `QUALITY.low` tier (DPR ≤1.0, no shadows, Lambert), PWA offline.
* Target look: UE5-style foliage density but with WebGL2 + Three.js `^0.170.0` + Vite static site. No backend, no heavy native deps.
* Performance envelope (from `docs/tessellation-improvement-plan.md` & `docs/perf-iphone11-safari.md`):
  * Low tier (A13 / ≤4GB): ~120–150k tris sustained, no shadow pass, 55+ FPS walk / 45+ rain-night.
  * Desktop: ~300k tris, shadow 2048, 60 FPS. New realism must be **tier-gated**.
* Principle: **bake what is seed-invariant, generate what is seed-dependent.**
  * Bake: wood grain, leaf albedo, rock, ground, water normal, bark textures; tree/rock meshes if from glTF.
  * Keep procedural: terrain height, river path, biome placement, collision, seed URL.

## 1. Static Asset Pipeline — Textures & Models

### 1.1 Why

Current `src/world/textures.js` + `scripts/generate-textures.mjs` already bakes 7 SVG tileable textures. For realism, hand-painted canvas grain is not enough: need scanned PBR (albedo/normal/roughness/AO) and curated meshes for hero trees / rocks.

### 1.2 Texture upgrade

* **Format:** keep SVG pipeline as fallback, add **WebP** (first) then **KTX2/Basis** (later) for PBR sets. WebP: 80–90 color, lossless/high for normal. KTX2 reduces GPU memory (see `docs/procedural-assets-strategy.md` §4).
* **Sets to download:**
  | Surface | Maps needed | Suggested source (CC0) | Repeat | File |
  |---|---|---|---|---|
  | Bark | albedo + normal + roughness | AmbientCG `Bark014`, Poly Haven `bark_brown` | 1–2 | `bark-*` |
  | Ground / Forest floor | albedo + normal + AO | AmbientCG `ForestLeaves02`, `Ground037` | 9–10 | `ground-*` |
  | Rock / Cliff | albedo + normal + roughness | AmbientCG `Rock031`, Poly Haven `rock_wall` | 1 | `rock-*` |
  | Sand / River bank | albedo + normal | AmbientCG `Sand004` | 9 | `sand-*` |
  | Water normal | normal (2 layers for flow) | Poly Haven `water_normal`, AmbientCG `Water002` | 7 | `water-*` |
  | Leaf atlas (cards) | albedo + alpha + normal | Kenney `nature-kit`, AmbientCG `Leaves` | atlas | `leaf-*` |
  | Grass blade | albedo + alpha | Poly Haven / Kenney | per tuft | `grass-*` |
* **Licensing:** prefer **CC0** (AmbientCG, Poly Haven, Kenney CC0). Avoid CC-BY-NC for commercial reuse. Record license in `public/generated/textures/LICENSE.md`.
* **Pipeline:**
  ```
  public/generated/textures/         # WebP + manifest.json (already exists)
  public/generated/models/           # new: glTF/glb hero meshes
  scripts/generate-textures.mjs      # extend: download + convert + verify
  scripts/fetch-assets.mjs           # new: curated fetch from URLs + hash check
  src/world/textures.js              # load order: static WebP -> canvas fallback (keep API)
  src/world/assetStore.js            # new: glTF loader cache + instance prep
  ```
* **Runtime loading:** `textures.js:loadStaticTextures()` already preloads + `renderer.initTexture()` in `src/core/bootCache.js`. Extend to preload model set (lazy). Keep `cached()` pattern — one texture per key, shared across InstancedMesh.

### 1.3 Mesh upgrade (optional but key for trees)

* Hero meshes as `glb` (draco optional): 1 broadleaf canopy cluster, 1 pine crown tier, 1 palm frond card, 1 kapok umbrella, 1 grass clump. Low-poly hero: 500–2k tris each, single material, vertex-color friendly.
* Instancing: parse glb once via `GLTFLoader`, extract `BufferGeometry`, then feed `InstancedMesh` pools (same as `src/world/presets.js:createVegetationKit()`). No per-instance `Scene` — keep 1 draw call per pool.
* Fallback: if model fetch fails, use current procedural geometry (already tier-gated). Never break seed worlds offline.

## 2. Trees — From 20-Tri Blobs to Dense Foliage

### 2.1 Current audit (`src/world/presets.js:253-332`)

* Canopy = `IcosahedronGeometry(1.25, detail 0/1)` = 20 / 80 tris, 3 puffs/tree max. Looks faceted, sparse.
* Frond = `PlaneGeometry(1.0, 2.7, 1,4)` = 8 tris, 6 fronds/palm. Tip is flat.
* No branch detail; trunk = 6–8 sided cylinder.

### 2.2 Target

* 5–7 canopy puffs per tree, overlapping ellipsoid clusters, each puff 30–80 leaf cards or 80-tri blob.
* Palms: 8–12 fronds in 2 tiers + serrated taper (already planned in tessellation doc P1).
* LOD: near (≤18u) = full puffs + leaf cards, far = merged blob (current 1 puff).

### 2.3 Technique (keep instancing)

* **Option A — Procedural dense (no external meshes, fastest to ship):**
  * Keep `createCanopyGeometry()` but instance **more puffs**: add 2 satellite blobs per tree (reuse `blob` pool, grow `POOL.crowns` desktop 4200 → 5600, low unchanged). Overlap offsets `±0.4u`, scale `0.7–0.9`.
  * Add billboard **leaf cards**: new pool `leafCard` = `PlaneGeometry` 2 tris, double-sided, alpha masked leaf atlas, tinted via `instanceColor`. ~3000 cards desktop, 0 on low (fallback to blobs). Same `baked top-light` color attr.
  * Branch: keep `addBranch()` but add 1–2 smaller twig instances per broadleaf/kapok (reuse trunk pool).
* **Option B — Scanned hero (higher realism):**
  * Download 1 broadleaf cluster glb (e.g. Poly Haven `Acer`), bake 2 LODs (high 1.5k / low 80 tris). `assetStore.js` caches geometries; `presets.js` picks LOD by `QUALITY.low`.
* **Wind-ready:** store per-instance wind phase in `InstancedBufferAttribute` (float), updated in vertex shader via `onBeforeCompile` sway (see §5). No CPU matrix churn.
* **Files:** `src/world/presets.js` (kit + `placeBroadleaf/Banana/Palm/Kapok`), `src/world/chunks.js:POOL` (grow counts tier-gated), `src/world/assetStore.js` (new), `src/utils.js:dummy`.

### 2.4 Performance guard

* Low tier: 3 puffs max, no leaf cards, `IcosaDetail 0`, same tris as today. Desktop only grows. Watch `POOL` overflow guards (`bucket.bi < POOL.crowns`) already present.

## 3. Water — From Flat Plane + Foam Points to Shimmering River

### 3.1 Current audit (`src/world/river.js`)

* Single `PlaneGeometry(130,130)` at `y=-0.32`, `MeshStandardMaterial` (desktop) with scrolling `waterDetail` + `waterBump` offset. Foam = `InstancedMesh` 26 quads drifting +z. No reflection, no depth tint, no refraction.

### 3.2 Target (tier-gated)

* **Base (all tiers):** keep plane, add **2-layer normal scroll** (already partially) + depth-based sand tint (deeper center = blue, bank = turquoise). Use vertex color or `riverDist` slope already in `src/world/procedural.js:riverXAt`.
* **Mid (desktop):** `MeshPhysicalMaterial` with `transmission`, `thickness`, `clearcoat` for subsurface; normal scale tied to wind (see §5). Animate `offset` at 2 speeds (0.08 + 0.055 already) + subtle distortion via `onBeforeCompile` uv warp.
* **High (desktop + reflections):** planar `Reflector` or `Water` from `three/examples/jsm/objects/Water.js` — render target of reflected scene (ground + sky). Enable only if `QUALITY.maxAnisotropy >= 8` and not `QUALITY.low`. Fallback to Standard if perf drops.
* **Foam & edge:** extend foam to bank edges via `riverDist` check; add **shore foam line** where `riverWidth` transitions (sampleFootprint). Bank undercut darkening already feasible via `biomeGroundColor`.
* **Files:** `src/world/river.js`, `src/world/textures.js:getWaterTexture/getWaterBump` (swap to scanned normal WebP), `src/core/setup.js:QUALITY` gate.

### 3.3 Asset

* Replace generated SVG water with scanned normal (Poly Haven `water_normal_02` 512px WebP, 2-mip). Keep bump fallback.

## 4. Grass — From Texture-Only to Field

### 4.1 Current

* `chunks.js:POOL.grass` = 600 low / 1500 high, `createGrassTuftGeometry()` 12 tris (3 crossed quads). Good start (tessellation plan §3.1). Still sparse near river banks / jungle.

### 4.2 Target

* **Density:** jungle/beach `POOL.grass` → 900 low / 2400 desktop, plus **meadow noise mask** (use `moistureAt`): moist lowland = denser, dry ridge = sparse.
* **Variety:** 2–3 blade archetypes: short tuft (current 0.65u), tall reed (1.1u) for river bank, dry clump (beach `PALETTES.dryGrass`). Pick by `rand() < 0.2` tall case (already `tint` logic).
* **Texture:** alpha-masked blade atlas (Kenney `grass_pack`) instead of vertex-color only; `MeshLambert` on low, `MeshStandard` + `alphaTest 0.5` desktop. Keep opaque where possible to avoid overdraw.
* **Culling:** keep `castShadow=false` everywhere (grass <0.5u). No transparency sorting cost.
* **Files:** `src/world/presets.js:createGrassTuftGeometry` (add 2nd variant), `src/world/chunks.js:collectChunk` (jungle/beach grass branch), `public/generated/textures/grass-*`.

## 5. Wind — Global Sway + Gusts for Foliage, Grass, Water, Clouds

### 5.1 Current

* Wind is audio only (`src/world/environment.js:createAmbience` `windGain`). No visual wind. Trees/grass are static.

### 5.2 Design

* **Central wind uniform:** `src/world/wind.js` (new) exports `WindState { direction: Vector2, speed, gust }` updated each frame by `environment.js`. Gust is low-freq noise (`performance.now()*0.0003` + chunk `rng` seed).
* **Shader sway (GPU, zero CPU matrices):**
  * Inject via `material.onBeforeCompile`: add `uniform float windTime; uniform vec2 windDir; uniform float windStrength; attribute float windPhase;` Bend vertex `position` by `sin(windTime * 0.6 + windPhase) * windStrength * heightFactor`.
  * Apply to: `blob/pine/palmLeaf/bush/grass` geometries (tilt + droop amplification). Trunks sway 10% of canopy amplitude.
  * Water normals: add windDir to UV scroll amplitude (`river.js:waterBump.offset.x += windDir.x * dt * 0.05`).
  * Clouds: modulate `clouds.js:update` drift speed by `windStrength` (currently constant).
* **Audio link:** `ambience.windGain` already tied to weather rain; tie gain to `windStrength` as well.
* **Files:** `src/world/wind.js` (new), `src/world/presets.js:createVegetationKit` (add `windPhase` attr), `src/world/river.js`, `src/world/clouds.js`, `src/world/environment.js`.

### 5.3 Tuning

* `windStrength` 0.1 calm → 0.7 gale (rain weather). `direction` rotates slowly (15° per minute) for parallax. All math in shaders, no per-instance matrix rebuild.

## 6. Dynamic Lighting, Shadows & Bloom

### 6.1 Current audit (`src/core/setup.js`, `src/world/environment.js`)

* Lights: `Hemi` + `Directional sun` + `Ambient` + night `moonLight` (toggles shadow pass). `ACESFilmic`, `exposure 1.1`. Skydome shader + sun/moon billboards + CSS sunset overlay. No post-processing.
* Shadows: `shadowSize` 512/1024/2048, `PCFSoft` desktop / `PCF` mobile, shadow map swapped sun↔moon. Vegetation `receiveShadow=false` for perf.

### 6.2 Target (tier-gated, progressive)

* **P0 — Free realism (all tiers, no post-processing):**
  * Keep `toneMappingExposure = sample.exp * weather.sun` (already). Add subtle `shadow bias` per tier (already).
  * Sunflower: increase `hemi` sky tint lerp at golden hour (already in `environment.js` sunset block). No code change.
* **P1 — Soft shadows + contact AO (desktop):**
  * Enable `renderer.shadowMap.type = VSM` or `PCFSoft` (already) + enlarge `sun.shadow.camera` to 32 when far view (already 26). Keep `castShadow` on trunks/pines/blobs, never on grass/flowers (perf).
  * Add **baked AO via vertex color**: darken bottom verts of canopy (`bakeTopLight bottom 0.62 → 0.58`). Already baked, free.
* **P2 — Bloom + god rays (desktop only, post-processing):**
  * Stack: `EffectComposer` → `RenderPass` → `UnrealBloomPass` (strength 0.35, radius 0.4, threshold 0.85) → `OutputPass`. Sources: sun billboard, moon halo, campfire point lights (`src/world/campfire.js`), emissive fruits/flowers. Low tier **never** creates composer (keep direct `renderer.render`).
  * Sun shafts: fake via `sunsetOverlay` (already CSS radial) — keep CSS, no volumetric pass (fill-rate killer on mobile). Optional: `GodRays` pass gated behind `?bloom=1` flag for testing.
  * Exposure: lift `renderer.toneMapping = ACESFilmic` (already) + modulate `renderer.toneMappingExposure` by `WX.sun` (already does). Add slight auto-exposure on entering shadow (lerp `exp` 0.9→1.15 over 1s).
* **P3 — SSR / SSAO (future, optional):**
  * `SSAOPass` desktop only if 60 FPS headroom remains; otherwise skip (tile GPU unfriendly). Prefer baked AO.

### 6.3 Files

* `src/core/setup.js` (renderer + shadow config, add `composer` factory `createComposer(renderer, scene, camera)` desktop-only).
* `src/world/environment.js` (sun/moon intensity, fog, sky uniforms already tiered — wire bloom strength to `sunInt` + `campfire` proximity).
* `src/world/campfire.js` (ensure `PointLight.intensity` scales with `bloom` uniform).
* `src/main.js` render loop: `if (composer && !QUALITY.low) composer.render()` else `renderer.render`.

### 6.4 Performance guard

* Bloom is the only new full-screen pass. Gate `QUALITY.low ? off : on`. Provide in-game toggle (menu → Performance → Bloom On/Off) persisted to `localStorage`. Watch `renderer.info` memory; composer adds 2 RTs.

## 7. Texture & Model Sourcing Checklist

| Asset | CC0 source | URL pattern (verify before download) | Use |
|---|---|---|---|
| Bark albedo/normal | AmbientCG `Bark014`, `Bark012` | `ambientcg.com/view?id=Bark014` | trunk `map`/`bump` |
| Forest ground | AmbientCG `Ground037`, `Ground080` | `ambientcg.com/view?id=Ground037` | ground `map`/`bump` |
| Rock wall | Poly Haven `rock_wall_04` 2k | `polyhaven.com/a/rock_wall_04` | rock, mountain scree |
| Sand dunes | AmbientCG `Sand004` | `ambientcg.com/view?id=Sand004` | river bank, beach |
| Water normal | Poly Haven `water_02` | `polyhaven.com/a/water_02` | river normal 2 layers |
| Leaf alpha atlas | Kenney `nature-kit` leaves | `kenney.nl/assets/nature-kit` | leaf cards |
| Grass blade | Kenney `grass` + AmbientCG `Grass001` | `kenney.nl` / `ambientcg.com/view?id=Grass001` | grass tuft |
| Tree cluster glb (optional) | Poly Haven, Quaternius `Animated Trees` (CC0) | `quaternius.com` | hero canopy glb |

Record every file in `fetch-assets.mjs` with SHA + license line. Commit `public/generated/*` or `.gitignore` + CI fetch — either is fine; keep `loadStaticTextures` fallback so dev works without fetch.

## 8. File-Level Change Map

| Change | Files | Risk |
|---|---|---|
| Fetch + WebP pipeline | `scripts/fetch-assets.mjs` (new), `scripts/generate-textures.mjs` (extend), `public/generated/textures/*`, `vite.config.js:define` | low, build-time only |
| glTF cache | `src/world/assetStore.js` (new), `src/core/bootCache.js` (preload) | low, lazy, fallback kept |
| Dense foliage + LOD | `src/world/presets.js`, `src/world/chunks.js:POOL/collectChunk` | medium — pool sizing |
| Water shader + normal | `src/world/river.js`, `src/world/textures.js` | low |
| Grass variety | `src/world/presets.js:createGrassTuftGeometry`, `src/world/chunks.js` | low |
| Wind uniforms + sway | `src/world/wind.js` (new), `src/world/presets.js` (windPhase), `src/world/environment.js`, `src/world/clouds.js` | medium — shader injection |
| Bloom composer | `src/core/setup.js` (+ `src/core/postprocessing.js` maybe), `src/main.js` (render branch), `src/world/campfire.js` | medium — desktop only |

## 9. Implementation Phases (sequential, each shippable)

**Phase 0 — Baseline (1 day, no visuals)**
  * Capture `npm run build` bundle size, `renderer.info`, FPS walk/rain/night on desktop + force-low, screenshots day/sunrise/sunset/night/rain (matches `README` table).
  * Verify `scripts/generate-textures.mjs` still produces 14 SVGs + `manifest.json`.

**Phase 1 — Texture realism (2–3 days)**
  * Add `scripts/fetch-assets.mjs`, download 7 PBR sets as WebP 512 (desktop) / 256 (low variant), emit `public/generated/textures/*` + manifest.
  * Swap `textures.js` loaders to prefer WebP; keep Canvas fallback.
  * Visually QA: bark grain no longer SVG strokes, ground reads as leaf litter.

**Phase 2 — Dense foliage (3–4 days)**
  * `presets.js` add satellite blobs + optional leaf-card pool (tier-gated), `chunks.js` grow `POOL.crowns`/`leafCard` + moist mask.
  * No shader change yet. QA same-seed screenshots — canopy overlap without popping.

**Phase 3 — Water (2 days)**
  * Scan water normal, switch `river.js` to `MeshPhysicalMaterial` desktop, depth tint via `riverDist`.
  * Keep foam instancing. QA: river reflects sky, banks have shore foam line.

**Phase 4 — Grass fields (1–2 days)**
  * Add reed variant + meadow density mask, alpha-masked blades.
  * QA: spawn meadow reads as field, not polka dots; low tier still opaque/perf.

**Phase 5 — Wind (2–3 days)**
  * `wind.js` + shader sway injection for foliage/grass/water/clouds; link to `ambience`.
  * Gate `windStrength` by weather (clear 0.2, rain 0.7). QA: no CPU matrix churn, sway is GPU-only.

**Phase 6 — Lighting + Bloom (2–3 days)**
  * Desktop `EffectComposer + UnrealBloomPass` behind `QUALITY.low` gate + toggle; emissive on fireflies/campfires/moon halo.
  * Keep CSS `sunset-overlay` for god rays. QA: bloom visible on fire at night, no bloom on low tier, toggle persists.

## 10. Budget & Perf Targets (visible-area)

| Tier | Ground | Veg (after dense) | Grass | Water | Post | Total | Target |
|---|---|---|---|---|---|---|---|
| Today either | 12.8k | 35–60k | 0–7k | 2 tris (plane) | — | 55–80k | — |
| Low after (A13) | 12.8k | 40–70k (3 puffs, no cards) | +7k (900×12) | 2 | none | **60–90k** | 55+ walk, 45+ rain |
| High after (desktop) | 28.8k | 90–150k (5–7 puffs + cards) | +20k (2400×12) | 2 + reflector RT | bloom 2 RTs | **160–210k** | 60 sustained |

Composer headroom: ~1.5ms extra on M1/desktop; skip on iPhone (fill-rate bound). Shadow pass already saved on low (no map).

## 11. Verification Checklist (per phase)

  1. `npm run build` — `dist/offline/index.html` contains inlined CSS/JS + correct `generated/textures/*` hash.
  2. `npm run dev` — seed `FOREST_123`, cycle `__env.setTime(7)`, `17.5`, `0`, `setWeather('rain'|'fog')`; screenshot diff vs baseline.
  3. Walk + sprint behind title screen attract loop; cross 3 chunk borders; assert no hitch >50ms (time-sliced `chunks.js:MAX_CHUNK_BUILDS_PER_FRAME=2`).
  4. FPS counter: desktop 60 sustained walking; force-low (UA spoof or `QUALITY.low` forced) 55+ walking, 45+ rain/night over 3 min.
  5. Cache: hard reload + offline mode (SW) — textures/models served from Cache Storage; missing asset falls back to Canvas.
  6. Each tier-gated change must be revertible by one ternary (`QUALITY.low ? A : B`).

## 12. Risks & Mitigations

  * **Leaf-card overdraw on mobile** → low tier renders 0 cards; desktop uses `alphaTest` not `transparent`.
  * **Bloom fill-rate on iPhone** → never enable composer on `QUALITY.low`; add user toggle + `Bloom` auto-off when FPS <50 for 2 votes (reuse `main.js` adaptive logic).
  * **Asset bloat** → WebP 512 desktop ~120KB/set ×7 ≈ 0.8MB; acceptable vs bundle  <300KB gzip. Provide 256 variants for low.
  * **Determinism loss** → wind phase derived from chunk `rng`, sway seeded per instance; never `Math.random` in build.
  * **Offline break** → every loader has `Promise.allSettled` + Canvas fallback (`textures.js:106`).

## 13. Open Questions (decide before Phase 1 kickoff)

  1. Single repo commitment to hero glb vs pure procedural dense? Recommendation: procedural first (Phase 2), glb later if cards still feel flat.
  2. Water reflector vs normal-only — start normal-only (cheaper), add reflector behind `?water=high`.
  3. KTX2 now or after WebP ships? Per `procedural-assets-strategy.md` — WebP first, KTX2 in follow-up.
