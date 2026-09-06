// Small data-only inventory shared by gathering, quests, pets and shops.
export function createInventory() {
  const items = new Map();
  const listeners = new Set();

  function notify() {
    const snapshot = Object.fromEntries(items);
    listeners.forEach((listener) => listener(snapshot));
  }

  return {
    add(id, amount = 1) {
      items.set(id, (items.get(id) || 0) + amount);
      notify();
    },
    remove(id, amount = 1) {
      const next = Math.max(0, (items.get(id) || 0) - amount);
      if (next === 0) items.delete(id);
      else items.set(id, next);
      notify();
      return next;
    },
    count(id) { return items.get(id) || 0; },
    has(id, amount = 1) { return (items.get(id) || 0) >= amount; },
    subscribe(listener) {
      listeners.add(listener);
      listener(Object.fromEntries(items));
      return () => listeners.delete(listener);
    },
    snapshot() { return Object.fromEntries(items); },
    clear() { items.clear(); notify(); },
  };
}
