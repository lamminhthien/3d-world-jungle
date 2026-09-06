// Data-driven quest state. New villager tasks can be added without rewriting
// the interaction loop or HUD.
export const QUESTS = {
  rangerHerbs: {
    id: 'rangerHerbs',
    title: 'Thảo dược cho người đi rừng',
    description: 'Tìm 3 nhánh thảo dược quanh trại.',
    objective: { type: 'collect', item: 'herb', amount: 3 },
    reward: { coins: 10 },
  },
};

export function createQuestLog() {
  const active = new Map();
  return {
    accept(quest) {
      if (!active.has(quest.id)) active.set(quest.id, { quest, progress: 0, complete: false, rewarded: false });
      return active.get(quest.id);
    },
    progress(id, amount = 1) {
      const entry = active.get(id);
      if (!entry || entry.complete) return entry;
      entry.progress += amount;
      if (entry.progress >= entry.quest.objective.amount) entry.complete = true;
      return entry;
    },
    get(id) { return active.get(id) || null; },
    reset() { active.clear(); },
  };
}
