/**
 * Kennzahlen über eine Messreihe (CHAOS-45). Reine Funktionen, keine Uhr.
 *
 * - Median: bei gerader Anzahl Mittelwert der beiden mittleren Werte.
 * - Perzentil: Nearest-Rank-Methode (Rang = ⌈p/100 · n⌉ in der sortierten Reihe). Liefert
 *   immer einen tatsächlich gemessenen Wert und ist bei kleinen Stichproben nachvollziehbar:
 *   Bei 20 Werten ist p95 der zweitgrößte, bei weniger als 20 der größte.
 * - Nicht endliche Werte (NaN, ±∞) werden ignoriert.
 * - Leere Reihe → `null` (nicht 0: „keine Messung“ ist etwas anderes als „0 ms“).
 */

function sortedFinite(values: readonly number[]): number[] {
  return values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}

function medianOfSorted(s: readonly number[]): number | null {
  const n = s.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  const upper = s[mid] ?? 0;
  if (n % 2 === 1) return upper;
  return ((s[mid - 1] ?? 0) + upper) / 2;
}

function percentileOfSorted(s: readonly number[], p: number): number | null {
  const n = s.length;
  if (n === 0) return null;
  const rank = Math.max(1, Math.min(n, Math.ceil((Math.min(Math.max(p, 0), 100) / 100) * n)));
  return s[rank - 1] ?? null;
}

export function median(values: readonly number[]): number | null {
  return medianOfSorted(sortedFinite(values));
}

/** `p` in Prozent (0–100), z. B. 95 für p95. */
export function percentile(values: readonly number[], p: number): number | null {
  return percentileOfSorted(sortedFinite(values), p);
}

export interface Summary {
  /** Zahl der berücksichtigten (endlichen) Werte. */
  readonly count: number;
  readonly median: number;
  readonly p95: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

/** Median, p95, Minimum, Maximum und Mittelwert; `null` bei leerer Reihe. */
export function summarize(values: readonly number[]): Summary | null {
  const s = sortedFinite(values);
  const med = medianOfSorted(s);
  const p95 = percentileOfSorted(s, 95);
  const min = s[0];
  const max = s[s.length - 1];
  if (med === null || p95 === null || min === undefined || max === undefined) return null;
  const sum = s.reduce((acc, v) => acc + v, 0);
  return { count: s.length, median: med, p95, min, max, mean: sum / s.length };
}
