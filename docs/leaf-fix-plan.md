# Palm-Leaf Fix Plan — ugly / incorrect fronds

Live run: `npm run dev` on port 5174, seed `FOREST_123`, daytime.
Screenshot: full viewport (see chat capture) — palms at bottom edge and top-left
show the bug clearly.

## 1. Observed symptoms (evidence)

- Palm fronds look like thin flat **paper spikes / starfish**, detached from the
  crown, floating around the trunk top.
- Pine cones (`ConeGeometry(1.25, 2.6, 7)`) and broadleaf blobs
  (`IcosahedronGeometry(1.25, 0)`) in the same screenshot look correct low-poly —
  so the bug is **palm-only**, not a global leaf-material issue.
- Leaf texture (`textures.js` `buildLeaf`) is fine (near-white leaflets multiply
  correctly with `instanceColor` on pines/bushes).

## 2. Root cause (`src/world/presets.js`)

| # | Code today | Why it looks wrong |
|---|---|---|
| R1 | `palmLeaf: ConeGeometry(0.4, 2.6, 4)` + instance scale `[1, 1, 0.28]` | 4-sided cone = diamond spike; Z-squash makes a flat blade with a sharp tip and a flat square base — not a frond. Flat shading accentuates the facets. |
| R2 | Geometry is **center-anchored**; placer offsets center `1.05*s` out from crown | Base/tip straddle the crown (`base ≈ -0.25`, `tip ≈ +2.35`), so fronds look detached / floating instead of growing out of the crown. |
| R3 | Fixed tilt `rotation.set(PI/2.3, 0, -a+PI/2)`, XYZ Euler, same height `±0.15` | All 5 fronds leave at the same ~78° angle in one flat whorl → starfish. No droop arc, no upper/lower tier, fragile yaw-pitch coupling. |
| R4 | `scale.set(1, 1, 0.28)` in local space, length 2.6 vs crown offset 1.05 | Fronds are over-long and spindly (`2.6` long, only `~0.8` wide) — out of proportion with trunk (`h≈1.6*s`) and coconut (`0.28*s`). |
| R5 | Single pitch tier × 5 fronds | Real palms read as 2 tiers (upper spears more upright, lower skirt drooping). One tier reads as a ceiling fan. |

Non-causes ruled out: `palmLeaf` material (`DoubleSide`, leaf map/bump) is
correct; `placePalm` crown position / coconut / trunk tilt are fine; chunk pools
(`chunks.js` `POOL.palms = 4000`, `+5` guard) and legacy scatter (`trees.js`
`MAX_TREES*5`) are consistent — they just need updating if fronds-per-palm changes.

## 3. Fix design (chosen: anchored bent-frond geometry + 2-tier placement)

**G1 — new `createPalmFrondGeometry()`** in `presets.js`, replacing the cone:
- Base: `PlaneGeometry(1.0, 2.7, 1, 4)` (8 tris, still trivial for 4000+ instances),
  re-shaped per-vertex: tapered width (narrow base → widest ~35% → point tip),
  V-fold (`|x| * 0.35` ridge on the spine so it catches sun), droop arc
  (`tip drops ≈ 0.7`), base translated to origin, length along `+Z`.
- Keeps `DoubleSide` material + existing leaf map/bump UVs (plane UVs work as-is).
- `flatShading: true` kept — the fold + segments give intentional low-poly facets.

**P1 — rewrite `placePalm()` orientation:**
- Base sits exactly at crown top (`topX/topY/topZ`), geometry extends outward —
  no center-offset gap.
- Per-frond: `yaw = PI/2 - a + jitter`, `pitch = droop tier + jitter`
  (`outer ≈ 0.45–0.65 rad`, `inner ≈ 0.1–0.25 rad`), Euler order `YXZ`
  (yaw then pitch), slight roll jitter, length jitter `0.9–1.15`.
- 6 fronds per palm: 3 outer (drooping skirt) + 3 inner (upright spears,
  azimuth-offset by half-step). Coconut raised to sit visibly in the crown.

**C1 — capacity updates (same PR, no behavior change otherwise):**
- `chunks.js`: `POOL.palms 4000 → 4800`, guard `+5 → +6`.
- `trees.js`: `MAX_TREES*5 → *6`, guard `+5 → +6`.
- `buildPresetGroup('palm')`: same frond geometry + tiered transforms so the
  hero/preview palm matches the instanced world.

Alternatives rejected:
- Bigger cone / more radial segs — still a spike, keeps center-anchor gap.
- Cross-plane alpha fronds — needs alpha texture + sorting, heavier, style clash.
- Per-frond curvature via skinning — overkill for low-poly; static droop is enough.

## 4. Implementation steps

1. `presets.js`: add `createPalmFrondGeometry()`, swap `geometries.palmLeaf`.
2. `presets.js`: rewrite `placePalm()` (anchored base, YXZ yaw/pitch, 6 fronds,
   2 tiers, jitter; return count 6).
3. `presets.js`: update `buildPresetGroup` palm branch to match.
4. `chunks.js`: pool `4800`, guard `+6`.
5. `trees.js`: pool multipliers `*6`, guard `+6`.
6. Verify: `npm run dev`, screenshot seed `FOREST_123` day + night, close-up on
   palms; check (a) fronds connect to crown, (b) no starfish whorl, (c) no
   z-fighting/gap, (d) FPS unchanged (~60), (e) `vite build` passes.

## 5. Risks / rollback

- Euler-order change is placer-local (`dummy` shared object — set
  `dummy.rotation.order = 'YXZ'` inside `placePalm` and restore or keep YXZ only
  for palms; other placers use default XYZ and are unaffected since order is set
  per-call).
- If the V-fold shades too dark, reduce fold to `0.25` or bump
  `palmLeaf` color lightness — one-constant tweak, no geometry rebuild needed.
- Rollback = revert 3 files (`presets.js`, `chunks.js`, `trees.js`); pools and
  guards are the only cross-file contract (fronds-per-palm = 6).
