# Color Overall Audit — Too Green (run + captures 2026-09-06)

Seed tested: `FOREST_123` — `http://127.0.0.1:5173/?seed=FOREST_123`, paused clock (`__env.state.paused=true`).

States captured via `window.__env.setTime(h)` + `setWeather(w)` (~6-7s crossfade wait):

| State | Time | Weather | Observation |
|---|---|---|---|
| Day clear | 10:00 | clear | **Problem worst here.** Ground + all trees same saturated lime-green. Monochrome carpet, no depth. |
| Sunset | 17:17 | clear | Much better — warm sun desaturates green, orange tents/bridges pop. |
| Night | 22:00 | clear | Good — blue moonlight + campfire orange gives complementary contrast. |
| Day rain | 11:00 | rain | Better than day-clear (darkened + blue water), but ground still flat green. |

## Root causes (code)

1. **Jungle ground too saturated / too light** — `src/world/procedural.js:118`:
   `JUNGLE: [0x7ecb5f, 0x5da844]` + `src/world/ground.js:12-13` `0x7ecb5f / 0x67b34c`.
   Both are high-saturation yellow-greens at ~65-70% lightness. Covers ~70% of pixels in day view.
2. **All vegetation in one hue family** — `src/world/presets.js:18-28`:
   - `pine: [0x2f9e44, 0x2b8a3e, 0x37b24d]`
   - `broadleaf: [0x40b34f, 0x51cf66, 0x2f9e44, 0x69db7c]`
   - `palmLeaf: 0x37b24d`, `bush: 0x69b93e`, `cactus: 0x2f9e44`
   All sit at hue ~125-135°, sat 55-70%. Pine vs broadleaf vs palm indistinguishable at iso distance.
3. **Green bounce light amplifies it** — `src/core/setup.js:86`:
   `HemisphereLight(0xcdeffd, 0x7ec850, 0.95)` — ground color is pure green, so every shadowed face gets green fill.
   Plus `ACES exposure 1.1` + `sun 1.9` at midday pushes greens to neon.
4. **No warm/cool counterweight in day** — sand `0xd9c27a` and water `0x38b6d3` are the only contrasts, but jungle density buries them.
   Trunks `0x8a5a3b` are thin (0.18-0.3 radius) — not enough brown to break green.

Night/sunset look fine because moon `0xa1c4fd` / warm sun `0xffb37a` force a complementary palette. Fix must target **day-clear without breaking night**.

## Enhancement plan (approved approach)

Goal: natural forest floor, readable tree types, keep low-poly flat look, no perf cost (colors only).

1. **Ground jungle → mossy olive, darker, desaturated ~20%**
   - `procedural.js biomeColors[JUNGLE]`: `[0x7ecb5f, 0x5da844]` → `[0x7aa856, 0x597f3e]`
   - `ground.js cGrass/cGrass2`: `0x7ecb5f / 0x67b34c` → `0x7aa856 / 0x5f8a44`
   - Keeps vertex jitter (`offsetHSL`) as-is for low-poly variation.
2. **Split vegetation hues (same shapes, new tints)**
   - `pine`: cooler deep conifer → `[0x2e7d4f, 0x256b43, 0x37935d]`
   - `broadleaf`: warmer yellow-green canopy → `[0x5da344, 0x74bd4a, 0x4a8540, 0x8ac14f]`
   - `palmLeaf`: tropical yellow-green → `0x55a347`
   - `bush`: muted understory → `0x5f9e46`
   - `trunk`: slightly deeper brown → `0x7b5334` (more soil contrast)
   - `cactus` stays `0x2f9e44` (desert, rarely next to jungle).
3. **Neutralize bounce light**
   - `setup.js hemi ground`: `0x7ec850` → `0x8a9a6b` (warm khaki, stops green bleed)
   - Keep sky `0xcdeffd`, keep intensities.
4. **Calm water + exposure slightly**
   - `river.js water color`: `0x38b6d3` → `0x3da9c4` (less neon cyan, better with olive ground)
   - Day `STOPS` sunInt 1.9 stays (shadows need it); renderer exposure 1.1 stays — re-evaluate after tint change.
5. **Out of scope (not this pass)**: textures (already near-white, multiply correctly), sky/fog (blue `0xa8dcf0` is good contrast), night values (already balanced).

## Verify

- `npm run build` passes.
- Re-capture 10:00 clear + 17:30 clear + 22:00 clear on same seed; day should show olive floor + distinguishable pine (dark blue-green) vs broadleaf (warm light green) vs palm, with brown trunks visible.
