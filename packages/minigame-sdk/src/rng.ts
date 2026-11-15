/**
 * Deterministischer Zufall für Minispiele (mulberry32, wie game-core). Jedes Minispiel
 * bekommt seinen Seed vom Server (`BoardView.minigame.seed`); gleicher Seed + gleiche
 * Eingaben + gleiche Schrittfolge → gleicher Ablauf der Spiellogik. Physik (Havok) ist
 * davon ausgenommen und wird über Invarianten getestet.
 */
export interface MinigameRng {
  /** Gleichverteilt in [0, 1). */
  next(): number;
  /** Ganzzahl in [min, max] (beide inklusive). */
  int(min: number, max: number): number;
  /** Zufälliges Element (wirft bei leerer Liste). */
  pick<T>(items: readonly T[]): T;
}

export function createMinigameRng(seed: number): MinigameRng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => {
      if (items.length === 0) throw new Error('pick aus leerer Liste');
      return items[Math.floor(next() * items.length)] as T;
    },
  };
}
