# Tessellation Improvement Plan — grass, rocks, mountain, trees, bridge

Goal: smoother silhouettes / less blocky facets on every object **without**
dropping iPhone 11 (A13, Safari, DPR 2, tile-based GPU) or low Android
(≤4GB RAM / ≤4 cores) below ~55fps walking, 45+ rain/night.

Constraint doc: `docs/perf-iphone11-safari.md`. All cuts there stay in force:
low tier = `QUALITY.low` → DPR 1.0 (floor 0.85), no shadow maps, Lambert +
map-only materials, anisotropy 1, ≤1 campfire PointLight, rain 200, sky 12×8.

Meaning of "tessellation" here: geometry subdivision / silhouette quality —
not GPU hull/domain shaders (WebGL2 + tile GPUs make those a bad trade).
We get smoothness from: segment counts, pre-jittered variants, beveled boxes,
and bump/texture grain (zero extra tris) where geometry would cost too much.

## 1. Current audit (evidence, `src/world/`)

| Object | Code today | Tris / instance | Why it looks low-poly-blocky |
|---|---|---|---|
| Ground / grass | `chunks.js` `CHUNK_SEG=16` on 16-unit chunk (1.0m sampling); `ground.js` legacy 64-seg plane. Grass = texture only (`textures.js` grass blades), **0 grass geometry** | 512 tris/chunk × 25 = ~12.8k total | Step edges (`procedural.js` 0.55 step) alias at 1m sampling; close-up ground looks flat, no blades catch light |
| Rocks | `presets.js` `DodecahedronGeometry(1,0)` = 36 tris; `rocks.js` same | 36 | Pentagon facets + uniform scale jitter only; silhouette repeats, flat faces glint identically |
| Mountain (= stepped terrain + snow pines + gray rocks) | `procedural.js` `steppedHeight` 6 levels × 0.55; sampled at 1m; `flatShading:true`; biome colors only | — (part of ground) | Hard 90° risers, 1m tread stair-steps; no scree / cliff banding; snow line is a hard color cut |
| Trees – trunk | `CylinderGeometry(0.18,0.3,1.4,6)` | ~24 | 6-sided hexagon visible at spawn distance, cap ring hard edge |
| Trees – pine crown | `ConeGeometry(1.25,2.6,7)` ×2 stacked | ~14 each | 7-gon base reads as heptagon ring from top-down iso; tier gap shows trunk spike |
| Trees – broadleaf blob | `IcosahedronGeometry(1.25,0)` = 20 tris | 20 | Perfect icosahedron symmetry repeats; two blobs per tree still read as diamonds |
| Trees – palm frond | `PlaneGeometry(1.0,2.7,1,4)` reshaped (8 tris), `PALM_FRONDS=6` | 8 | 1×4 segs = only 4 bend steps; V-fold is 1 quad wide so fold highlights band; tip is a straight point |
| Trees – bush | `IcosahedronGeometry(0.7,0)` = 20 | 20 | Same as blob, small on screen so facet popping is obvious when walking |
| Trees – cactus | `CylinderGeometry(0.32,0.4,2.4,7)` | ~28 | 7 sides + flat caps; no rounded dome, no arm branches |
| Bridge | `bridge.js` shared `BoxGeometry` plank/rail/post | 12 each, ~21 meshes/bridge ×2 | Razor-sharp box edges catch no highlight; rails are square beams, posts are square pegs; deck is perfectly flat |

Approx live tri budget today (typical view, not worst-case pools):
ground 12.8k + veg ~35–60k + bridges ~0.5k + water/sky/clouds ~5k ≈ **55–80k**.
Headroom on A13 with no shadow pass + Lambert is roughly **120–150k**
sustained; desktop can push 300k+. Every proposal below is sized to fit.

## 2. Principles (low-tier safety)

1. **No new draw calls on the hot path.** Reuse the 7 veg pools + 1 ground
   material + bridge shared `GEO`. New grass = exactly **1** `InstancedMesh`.
   Bridge merge is optional P2, never more meshes than today (42).
2. **Tier-gated subdivision.** `QUALITY.low ? keep : subdivide`.
   Pattern already used in `setup.js` / `presets.js:texturedMat` /
   `bridge.js:woodMaps` — follow it: `const SEG = QUALITY.low ? A : B`.
3. **Silhouette over interior.** Add tris only where the outline changes
   (trunk sides, pine rim, frond bend, rock outline, plank bevel). Interior
   grain stays in `textures.js` bump maps (free on desktop, skipped on low).
4. **Share + pre-jitter, don't clone per instance.** One geometry per tier,
   2–3 pre-baked rock/blob variants max, picked per-instance by scale/rotation
   (rotation already random in every `place*`). Never `new Geometry` per frame.
5. **No shadow / transparency / overdraw regressions.** New grass is opaque,
   `castShadow=false` on low; bridge keeps `castShadow=QUALITY.shadowsEnabled`;
   no alpha-tested fronds, no extra PointLights, no transparent water change.
6. **Deterministic.** Any jitter uses the chunk `rng` (`rngFromString`), not
   `Math.random`, so the same seed builds the same world.

## 3. Per-object plan

### 3.1 Grass / ground (biggest visual win, currently 0 geometry)

- **P0 — ground skirt sampling (both tiers, ~0 extra tris on low):**
  keep `CHUNK_SEG=16` on low; desktop `16 → 24` (`chunks.js:37`).
  Cost desktop: 512 → 1152 tris/chunk (+16k total, fine without shadow pass).
  Resolves step risers from 1.0m to 0.66m. Low keeps 1m sampling (fill-bound).
- **P0 — grass tufts, 1 new InstancedMesh (`presets.js` + `chunks.js`):**
  geometry = 3 crossed quads bent at midrib, **~12 tris**, opaque,
  `Lambert + leaf map`, vertex-color tint via `setColorAt` (reuse dry/jungle
  palettes). Placement: jungle/beach only, `TRIES` loop already in
  `collectChunk`, density `POOL.grass = 600 low / 1500 high`, culled
  `>4.5u` from spawn and `nearBridge`, `castShadow=false` on low
  (true on desktop is 1 extra shallow depth draw — acceptable, or keep false
  everywhere; tufts are <0.5u tall). Sway in vertex shader = no; sway via
  per-frame matrix updates = no (CPU). Static tufts + wind in texture only.
- **P1 — step chamfer coloring:** in `buildGroundChunk`, detect
  `proceduralGroundHeight` discontinuity vs neighbor sample; darken riser verts
  ×0.85 and lighten tread edge ×1.05 (color-only, 0 tris). Sells cliffs without
  geometry. Optional scree: reuse `rock` pool at step feet (no new pool).

### 3.2 Rocks

- **P0 — 3 pre-jittered variants, same tri count (both tiers, ~0 extra tris):**
  replace single `DodecahedronGeometry(1,0)` with 3 baked variants
  (vertex offset ±12% along normal, seeded once at kit build, `computeVertexNormals`,
  `flatShading` kept). `placeRock` picks variant by `rng()`. Silhouette variety
  for free; instance rotation/scale already random. Memory: 3×36 tris, trivial.
- **P1 — high-tier bevel only:** `DodecahedronGeometry(1,1)` (108 tris) for
  `QUALITY.low ? 0 : 1`, i.e. +72 tris × ~200 visible rocks ≈ +14k on desktop
  only. Low stays at 36. Gate at `createVegetationKit` with one ternary.
- Keep `collide || s>0.9` obstacle rule unchanged.

### 3.3 Mountain (terrain steps + snow/pine/rock dressing)

- **P0 — color banding, 0 tris:** `biomeGroundColor` already lerps two hexes;
  add altitude stripe: `offsetHSL(0,0,±0.03)` keyed to `lvl % 2` + snow-cap
  noise (`moistureAt` dither at `snowLine`) so the snow edge is ragged, not a
  straight contour. File: `procedural.js:biomeGroundColor` + `chunks.js:116`.
- **P1 — desktop sampling 24 (see 3.1) + cliff rocks:** bias `collectChunk`
  mountain branch `roll<0.6 → rock` to also spawn at step risers (reuse pool).
  No new geometry; reads as scree.
- Non-goal: smoothing steps into ramps (breaks Minecraft-tier art + gameplay
  height lookups). Chamfer coloring (3.1 P1) is the approved substitute.

### 3.4 Trees

| Part | Low tier (iPhone 11 / old Android) | High tier (desktop) | File |
|---|---|---|---|
| Trunk | `6 → 7` sides (~24→28 tris, +4×800 worst = +3.2k, negligible) + slight butt flare via `CylinderGeometry(0.22,0.34,…)` | `8` sides + 2 height segs with ±0.03 taper jitter | `presets.js:91` |
| Pine crown | `7 → 8` sides + droop lip (bottom ring pulled in 6%, 0 tris) | `10` sides + 3rd small top cone (reuse `pine` pool, +1 instance per pine; grow `POOL.crowns` +400) | `presets.js:92,128` |
| Broadleaf blob | keep `Icosahedron(1.25,0)` + per-variant jitter (3 variants like rocks, 0 extra tris) | `Icosahedron(1.25,1)` = 80 tris for blobs only (+60 × ~600 visible ≈ +36k, desktop-only) | `presets.js:93,141` |
| Palm frond | keep `1×4` (8 tris) | `2×6` (24 tris, center rib + serrated taper) + keep V-fold/droop math | `presets.js:63` |
| Bush | keep 20 tris + jitter variant | share blob high-tier geo (no new geometry object) | `presets.js:95` |
| Cactus | `7 → 8` sides, flat cap kept | `9` sides + hemisphere cap (`SphereGeometry` merged or 2nd instance; +~30 tris each, cacti are desert-only so count is small) | `presets.js:96` |

Pool growth is desktop-only pain: pine 3rd tier needs `POOL.crowns 1600 → 2000`
if enabled — do it inside the same `QUALITY.low ? … : …` so low pools don't grow.
`PALM_FRONDS` stays 6 (pool math already tight at 4800).

### 3.5 Bridge (42 meshes today, shared `GEO` — keep count)

- **P0 — bevel + character, ~+10 tris/plank (both tiers):**
  `plank: BoxGeometry(0.9,0.12,1.1)` → `BoxGeometry(0.9,0.12,1.1,1,1,2)` with
  mid-span sag (−0.03) + end lift, per-plank yaw jitter ±0.02 and gap jitter
  (placer-side, deterministic by index). Rails stay boxes on low.
- **P0 — round rails/posts on high only:** `rail/post` boxes → 6-sided
  `CylinderGeometry` rotated to span X (`QUALITY.low ? box : cyl`), ~+20 tris
  each × 24 rails/posts total ≈ +0.5k desktop-only. Reads as logs vs lumber.
- **P1 — rope + arch (0–1 extra mesh per bridge):** catenary rope via
  `TubeGeometry` 6-sided × 8 segs per side on high only; deck arch +0.15 mid.
  Gate behind `QUALITY.low` check; low keeps flat deck (gameplay height
  `isOnBridge` unchanged — visual arch only, collision stays flat).
- **P2 (optional) — merge per bridge to 2 meshes** (deck merged + rails merged
  via `BufferGeometryUtils.mergeGeometries`) to cut 42 → ~4 draw calls. Only if
  profiler still shows CPU-bound on low; visual tessellation is P0, merging is
  perf hygiene. Keep `removeBridges` dispose path working.

## 4. Triangle budget (visible-area estimate)

| Tier | Ground | Veg (typical) | Grass (new) | Bridge | Total | Headroom |
|---|---|---|---|---|---|---|
| Today (either) | 12.8k | 35–60k | 0 | 0.5k | 55–80k | — |
| Low after (iPhone 11) | 12.8k | 38–65k (+trunk/ pine 8-side) | +7k (600×12) | +0.2k | **58–85k** | ✅ under ~120k, no shadow pass, DPR ≤1.0 |
| High after (desktop) | 28.8k | 90–130k (subdiv + 3rd pine tier) | +18k (1500×12) | +1k | **140–180k** | ✅ desktop holds 60 (shadow map 2048 already proven) |

Fill-rate guardrails (tile GPUs): grass opaque + `depthWrite:true`; no alpha
fronds; no new transparent layers; water/foam/cloud rules from
`perf-iphone11-safari.md` untouched.

## 5. Implementation phases

- **P0 (one PR, low-risk, both tiers):** rock/blob 3 jitter variants; trunk 7
  sides; pine 8 sides + droop lip; bridge plank sag/jitter; grass tuft pool
  (600/1500) + mountain/snow color banding. Files:
  `presets.js` (kit + placers), `chunks.js` (`CHUNK_SEG`, `POOL.grass`,
  `collectChunk`, `buildGroundChunk` chamfer), `procedural.js` (banding),
  `bridge.js` (plank geo). Verify `vite build` + 60fps desktop + FPS counter
  on low-tier emulation (DPR 1, `QUALITY.low` forced).
- **P1 (gated high-tier subdiv):** `CHUNK_SEG 24`, blob `detail 1`, frond
  `2×6`, rock `detail 1`, round rails/cyl caps, cactus dome, scree bias.
  All behind `QUALITY.low ?` ternaries. Desktop screenshot compare day/night +
  rain; low-tier must show **zero** geometry change (diff screenshots).
- **P2 (if needed):** bridge merge 42→4 calls; grass distance fade
  (skip matrices beyond 30u instead of rendering); adaptive floor already 0.85.

## 6. Verification

1. `npm run build` passes; `npm run dev`, seed `FOREST_123`, day + night + rain.
2. Close-ups: grass tuft at spawn, rock cluster riverbank, mountain steps north,
   pine/broadleaf/palm/cactus hero, both bridges deck + rails.
3. FPS: desktop 60 sustained walking; force-low (`?low=1` or UA spoof)
   55+ walking, 45+ rain/night via in-game counter; no thermal sag over 3 min.
4. Regression: same-seed screenshots — silhouettes smoother, no popping,
   `isOnBridge`/collision unchanged, pool overflows impossible
   (`bucket.x < POOL` guards for grass + pine 3rd tier).
5. Rollback per object: every change is a `QUALITY.low ? A : B` or variant
   count — revert one ternary / variant without touching pools or placers.

## 7. Risks

- Blob `detail 1` on high adds ~36k — if desktop dips, drop to jitter-only
  (P0 already covers 80% of the win).
- Grass overdraw on tiny Android GPUs — mitigation: opaque quads, 600 cap on
  low, no sway matrices, `frustumCulled=false` kept (single call) but instances
  beyond 30u collapsed to zero-scale at rebuild.
- Bridge rope `TubeGeometry` adds draw + overdraw — high-only, static, one call.
- Determinism: all jitter from chunk `rng`; kit-level variant baking uses a
  fixed seed constant, never `Math.random` at build.
