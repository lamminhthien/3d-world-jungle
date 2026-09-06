# iPhone 11 Safari perf — why 30fps and how we fix it

Target: iPhone 11 (A13, 4GB RAM, 828×1792, DPR 2, Safari WebGL2, tile-based GPU).
Symptom: ~30fps. Desktop holds 60.

## Root causes (ranked by impact on A13 Safari)

### 1. Shadow pass renders ~10k instanced meshes every frame (biggest)
- `sun.castShadow = true`, map 1024 on mobile.
- All 7 vegetation pools (`trunk 800, crowns 2×1600, palms 4800, bushes 900, rocks 1000`)
  have `castShadow = true` → the depth pass re-transforms up to ~10k instances/frame.
- Bridges (42 meshes), tents (~18 meshes × 5 sites), player (7 meshes) also cast.
- On a tile-based GPU this doubles geometry + fragment work for little visual gain
  at iso distance. Expected cost: **~10–15fps**.

### 2. Fill-rate bound: DPR 1.5 × fullscreen transparent layers
- iPhone 11 DPR = 2, we cap at 1.5 → still ~1242×2688 ≈ 3.3M pixels shaded.
- Every pixel runs `MeshStandardMaterial` + `map` + `bumpMap` + `flatShading`
  (derivatives) + ACES + PCF shadow sampling, lit by **4 base lights**
  (sun + hemi + ambient + moon) **plus up to 5 campfire PointLights**.
  Forward renderer = every light adds per-fragment cost to every Standard pixel.
- Full-screen overdraw stack: transparent water plane (130×130, Standard),
  skydome shader (`pow(s,350)` + `pow(s,12)`), 6 transparent clouds
  (`depthWrite:false` = no early-z), foam, flames, embers/smoke, rain, fireflies.
  Tiled GPUs hate overdraw. Expected cost: **~8–12fps**.

### 3. Texture bandwidth: anisotropy 8 + bumpMap on everything
- `textures.js` sets `anisotropy = 8` on all 7 canvas texture pairs.
  On iOS this multiplies texture fetch cost; 1–2 is enough at iso distance.
- Every material has a `bumpMap` = second texture fetch + perturbation ALU
  per fragment. On low-poly flat surfaces the relief is barely visible.
  Expected cost: **~3–5fps**.

### 4. Too many draw calls (~130+)
- 25 ground chunks (1 call each) + 7 veg pools + water + foam + 6 clouds.
- Bridges: **42 individual Meshes** (9 planks + rails + posts ×2), each with a
  **fresh `BoxGeometry`** → 42 draw calls + wasted memory.
- Campsites: ~18 meshes × 5 sites ≈ 90 meshes (frustum-culled when off-screen,
  but 1–2 visible sites still ≈ 20–36 calls).
- iPhone Safari CPU starts struggling past ~100 calls with Standard materials.

### 5. Per-frame CPU loops + slow adaptive quality
- `env.update`: rain loop (450 pts), color lerps, HUD — every frame.
- Fireflies: 140 × 4 sins/frame + `needsUpdate` upload when visible.
- Campfire: embers (5×22) + smoke (5×8) CPU sim + uploads.
- River: 26 foam matrix composes + `needsUpdate` every frame.
- Adaptive resolution reacts every **2.5s** in **0.25 steps** with floor 1.0 —
  too slow to rescue a device stuck at 30fps, and it never drops below 1.0
  even though 0.85 would still look fine on a 6.1" screen.

### Safari-specific notes
- `antialias:false` on mobile is already correct (MSAA is brutal on tiled GPUs).
- `powerPreference:'high-performance'` is ignored on iOS — harmless.
- `flatShading:true` needs derivative instructions; Safari compiles them
  slower and executes them per-fragment. Lambert is cheaper than Standard.
- Safari throttles aggressively when hot: sustained 30fps → thermal cap →
  stays 30fps. Must start low (DPR 1.0, no shadows) instead of starting high
  and adapting down.

## Fix plan

| # | Change | File | Expected gain |
|---|--------|------|---------------|
| P0-1 | Low-tier detect (iPhone / old GPU): `QUALITY.low`, `maxPixelRatio 1.0`, `shadowSize 512`, `shadowsEnabled false` | `core/setup.js` | +10–20fps |
| P0-2 | Veg + ground: Lambert, no bumpMap on low tier | `presets.js`, `chunks.js` | +5–8fps |
| P0-3 | Water opaque + no bump on low tier | `river.js` | +3–5fps |
| P0-4 | Anisotropy 8 → 1 (low) / 4 (desktop) | `textures.js` | +2–4fps |
| P0-5 | Campfire: max **1** PointLight on low (nearest site), dim rest | `campfire.js` | +3–6fps |
| P1-1 | Bridges: shared geometries, no shadow on low | `bridge.js` | −40 geos, −draw setup |
| P1-2 | Rain 450→200, skydome 24×16→12×8, clouds 6→4, fireflies 140→80 on low | `environment.js`, `clouds.js`, `fireflies.js` | +2–4fps CPU/GPU |
| P1-3 | Tents/stones/seats: `castShadow=false` on low | `campfire.js` | shadow pass ↓ |
| P2 | Adaptive: 1.2s cooldown, step 0.25, floor 0.85 on low; start at cap | `main.js` | recovers faster |

Non-goals: reducing CHUNK_RADIUS (visual pop, keep 25 chunks), changing art style,
touching desktop quality (all cuts are gated behind `QUALITY.low`).

## Verification
- `npm run build` passes.
- Desktop: no visual change (low-tier gated).
- iPhone 11 Safari: target 55–60fps walking, 45+ in rain/night.
- No real-device profiler here; gains are estimated from draw-call / fill-rate /
  light-count reasoning. Confirm on-device via the in-game FPS counter.
