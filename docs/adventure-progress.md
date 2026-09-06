# Adventure gameplay progress

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

## Next milestones

1. Add more resource node types: fruit, wood, fish and medicinal plants.
2. Add a village hub with villagers, dialogue and a quest board.
3. Add pet adoption, feeding and care stats.
4. Add swamp biome with shallow water, mud and fog gameplay.
5. Add save/load for inventory, quests and pet state.

## How to test the current slice

1. Run `npm run dev` and press **Play**.
2. Walk near the ranger and press `E`.
3. Collect the three glowing herbs with `E`.
4. Return to the ranger and press `E` again.
5. Change world type from the menu to confirm the quest resets.
