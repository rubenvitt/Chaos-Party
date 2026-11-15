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

/** Gleichverteilt ein Element aus einer nicht-leeren Liste ziehen. */
export function pickOne<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) {
    throw new RangeError('Aus einer leeren Liste kann nichts gezogen werden');
  }
  return items[rng.int(0, items.length - 1)] as T;
}

/** Neue, gemischte Kopie (Fisher-Yates); die Eingabe bleibt unverändert. */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    const tmp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = tmp;
  }
  return result;
}

/**
 * Gewichteter Zug. Einträge mit Gewicht ≤ 0 werden nie gezogen; ist kein Gewicht
 * positiv, kommt `null` zurück (ohne Zufallszahl zu verbrauchen).
 */
export function pickWeighted<T>(rng: Rng, entries: readonly (readonly [T, number])[]): T | null {
  let total = 0;
  for (const [, weight] of entries) {
    if (!Number.isFinite(weight)) {
      throw new RangeError(`Ungültiges Gewicht ${String(weight)}`);
    }
    if (weight > 0) total += weight;
  }
  if (total <= 0) return null;
  let roll = rng.next() * total;
  let last: T | null = null;
  for (const [value, weight] of entries) {
    if (weight <= 0) continue;
    last = value;
    if (roll < weight) return value;
    roll -= weight;
  }
  // Nur bei Rundungsfehlern erreichbar: letztes Element mit positivem Gewicht.
  return last;
}
