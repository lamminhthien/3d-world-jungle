# Adventure gameplay progress

Thiết kế tổng thể được chia thành các file đánh số trong [00-adventure-roadmap.md](./00-adventure-roadmap.md).

## 2026-09-06 — Milestone 1: first quest vertical slice

Implemented:

- A ranger NPC near the spawn point.
- `E` interaction prompt.
- Three herb resource nodes that can be collected.
- A quest tracker and basic reward counter.
- Quest/resource content resets safely when changing world seeds.

## 2026-09-06 — Milestone 2: reusable gameplay data layer

Implemented:

- `src/gameplay/inventory.js`: reusable inventory API (`add`, `remove`, `count`, `has`, `subscribe`).
- `src/gameplay/quests.js`: data-driven quest definitions and quest log state.
- Ranger herb quest now uses the shared inventory and quest log instead of hardcoded counters.

## 2026-09-06 — Milestone 3: expanded resource gathering

Implemented:

- Added four reusable resource types: medicinal plants, forest fruit, wood and river fish.
- Added distinct low-poly visuals and seeded spawn offsets for each resource group around the camp.
- All resource types use the shared inventory API and update the HUD counters.
- Fish nodes are positioned near the river bank; other nodes avoid the river area.
- Added a large mobile interaction button alongside keyboard `E`.
- Changing world type regenerates and clears every resource node and inventory item safely.

## Next milestones

1. Add pet adoption, feeding and care stats.
2. Add swamp biome with shallow water, mud and fog gameplay.
3. Add save/load for inventory, quests and pet state.

## 2026-09-06 — Milestone 4: village dialogue slice

Implemented:

- Added a seed-stable village hub with two low-poly houses, a campfire area and a public quest board.
- Added three villagers with `E`/mobile-button interaction and a short mobile-friendly dialogue panel.
- Added the `🏘️ Village` world option on the title screen and in the in-game menu; selecting it regenerates the world and places the player at the village.

## How to test the current slice

1. Run `npm run dev` and press **Play**.
2. Walk near the ranger and press `E`.
3. Collect the three glowing herbs with `E`.
4. Return to the ranger and press `E` again.
5. Walk to the nearby fruit, wood and river-bank fish nodes; press `E` or the mobile `E` button to collect them.
6. Change world type from the menu to confirm the quest and all resource nodes reset.
