/**
 * Deterministischer Zufallsgenerator (mulberry32).
 *
 * Alle Zufallsentscheidungen der Spielregeln (Würfel, Ereignisse, Items)
 * laufen über eine Instanz davon, damit Partien mit gleichem Seed
 * reproduzierbar sind. Nicht für Sicherheitszwecke geeignet.
 */
export interface Rng {
  /** Gleichverteilte Zahl in [0, 1). */
  next(): number;
  /** Gleichverteilte ganze Zahl in [min, max] (beide inklusive). */
  int(min: number, max: number): number;
  /** Aktueller interner Zustand, um den Generator später fortzusetzen. */
  state(): number;
}

export function createRng(seed: number): Rng {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`Seed muss eine ganze Zahl sein, war ${String(seed)}`);
  }
  let s = seed >>> 0;

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    int(min, max) {
      if (!Number.isInteger(min) || !Number.isInteger(max) || min > max) {
        throw new RangeError(`Ungültiger Bereich [${String(min)}, ${String(max)}]`);
      }
      return min + Math.floor(next() * (max - min + 1));
    },
    state: () => s,
  };
}
