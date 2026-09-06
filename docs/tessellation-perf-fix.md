# Tessellation perf fix — why `e92d2b8` made FPS choppy and what changed

Follow-up to `docs/tessellation-improvement-plan.md` (commit `e92d2b8`).
Symptom after that commit: choppy rendering, inconsistent FPS while walking.
Root cause is **not** triangle count — it is **main-thread rebuild spikes**
on every chunk-border crossing, running inside `world.update()` in the frame loop.

## 1. Why triangles were never the problem

`e92d2b8` added ~4–25k tris total (SEG 24 ground, grass tufts, 7/8-sided
solids). That fits the budget from the improvement plan (desktop 140–180k,
low-tier 58–85k). The GPU renders that fine.

The kit tessellation itself (plank sag, pine droop lip, radial jitter, grass
blade bend in `presets.js` / `bridge.js`) runs **once at boot** (~ms). It never
re-runs per frame, so pre-baking it to an external binary would save ~ms once
and fix nothing about choppiness. The real cost was re-running **terrain +
placement math for ~15.6k verts + ~750 tries synchronously** whenever the
visible chunk set changed.

## 2. Hot loops, ranked

### 1. Duplicated noise evals per vertex and per try (biggest)
`buildGroundChunk` called `proceduralGroundHeight(x, z)` **and** `getBiome(x, z)`
back-to-back for the same `(x, z)`. Each one re-runs `riverDist` (2× fbm-3
river noise) + `steppedHeight` (fbm-4 height noise) — roughly **25 noise evals
per vertex × 15,625 verts** on a full 25-chunk desktop rebuild, plus the same
duplication × 750 tries in `collectChunk`. Fix: `sampleGround(x, z)`
(`procedural.js:120`) evaluates each noise field once and returns
`{ y, biome, d }`. Both call sites (`chunks.js:128`, `chunks.js:166`) use it.
Same-seed layout is unchanged — `y` already equals the stepped height, so the
biome branch sees identical values.

### 2. Two `offsetHSL` + one `Math.sin` per ground vertex
`biomeGroundColor` (`procedural.js:168`) did two `offsetHSL` calls per vert
(random grain, then terrace stripe). Each `offsetHSL` is an RGB→HSL→RGB round
trip, so two calls = 2× cost (~31k conversions per full rebuild). Fix: fuse
both lightness deltas into **one** `offsetHSL` (`procedural.js:181`). The
`Math.sin` coord hash (up to 15k sins per rebuild, stalls the FPU) is now an
`imul` integer hash (`hashXZ`, `procedural.js:163`). Note: the snow/rock
dither pattern changes slightly vs `e92d2b8` (different hash), still ragged.

### 3. `offsetHSL` per vegetation instance
Every placer (`presets.js`) ran `offsetHSL` per instance — ~2–3k instances ×
HSL conversion per rebuild. Measured: 20k `offsetHSL` = 3.8ms vs 0.8ms for
direct channel scaling (~4.7×). Fix: `tintFast()` (`presets.js:248`, lightness
as multiply) for trunk/palm/grass; bush keeps its hue wobble as a cheap r/b
skew (`presets.js:333`); rock keeps its saturation dip the same way
(`presets.js:375`). Visually identical at these magnitudes (±0.05).

### 4. Kit rebuilt per preview + string-keyed jitter
`buildPresetGroup()` called `createVegetationKit()` fresh every time, re-running
jitter + grass merge + `computeVertexNormals`. Fix: module singleton `_kit`
(`presets.js:207`) — this is the "static tessellation" idea implemented
in-code: bake once into GPU buffers, reuse everywhere. `jitterRadial` also
dropped `${toFixed}` string keys + per-vertex string hashing for integer keys +
`imul` hash (`presets.js:120`). One-time cost, but removes needless work and
GC pressure.

### 5. Small per-vert / per-try overhead
`buildGroundChunk` used `getX/getZ/setY` (3 call overheads × 625 verts/chunk) —
now raw `pos.array` indexing (`chunks.js:122`). `nearBridge` + spawn-radius
checks used `Math.hypot` (~1500+ sqrts per rebuild) — now squared-distance
comparisons. `Math.hypot` avoidance follows the precedent already used in
`main.js` movement collision.

## 3. On the "binary before WebGPU" idea

This game renders with **Three.js WebGL**, not WebGPU — there is no shader-side
tessellation stage to feed with pre-compiled binaries, and hull/domain shaders
were already rejected in the improvement plan (bad trade on WebGL2 + tile
GPUs). The static-geometry spirit of the idea is correct and is now the rule:
**anything that never changes per frame must be baked once** (kit singleton,
fused constants, integer hashes) and **per-rebuild loops must do each noise /
color evaluation exactly once**. If a `.bin` asset pipeline is ever wanted
(e.g. shipping a pre-tessellated hero rock), it would save boot ms only — it
cannot fix frame-time inconsistency, which comes from rebuild scheduling ( §4).

## 4. Measured

- Full 25-chunk ground + color rebuild (15,625 verts, SEG 24): **~10.2ms**
  (was roughly 2× noise + 2× HSL + sin — estimated 20–30ms+, over the 16.6ms
  frame budget before render even starts).
- `hashXZ`, 50k calls: **0.7ms**.
- `sampleGround`, 750 tries (one `collectChunk` sweep): **0.46ms**.
- `vite build` passes.

## 5. Known remaining risks (not fixed here)

- `rebuildVegetation` still sets `needsUpdate` on all 8 `InstancedMesh` buffers
  per chunk crossing (~10k matrices re-uploaded). If crossings still hitch,
  stagger chunk builds to ~1/frame or flag only dirty pools — don't re-add
  per-vertex math.
- `computeVertexNormals()` per new chunk (~1.1k tris × ~5 chunks) still runs on
  the main thread. Move to a worker only if the profiler implicates it.
- `CHUNK_SEG 24` doubles verts vs 16; the loops above now scale linearly, but
  if low-end desktop still dips, 20 is the compromise (not 16 — riser aliasing
  returns).
- Regression check on change: same-seed screenshots — layout/height/biome
  identical; only snow/rock dither grain differs (hash change, §2.2).
