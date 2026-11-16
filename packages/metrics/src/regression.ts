/**
 * Relative Regressionsschwellen gegen eine eigene Baseline (CHAOS-39). Rein, ohne Uhr.
 *
 * Es gibt bewusst **keine** absoluten Universalwerte („60 fps“): Grenzen entstehen aus einer
 * gemessenen Baseline desselben Messaufbaus (gleicher Rechner, gleicher Browser, gleiches
 * Szenario). Jede Kennzahl hat eine Toleranz aus relativem Anteil und absolutem Sockel; der
 * Sockel fängt Rauschen kleiner Werte ab (z. B. 2 ms bei 8 ms Bildabstand).
 *
 * Alle Kennzahlen sind „kleiner ist besser“ (Bildabstand, Draw Calls, Kontexte, Speicher).
 * Für Bildraten den Bildabstand vergleichen.
 */

export interface Tolerance {
  /** Erlaubter Anstieg relativ zur Baseline, z. B. 0.25 = +25 %. */
  readonly relative: number;
  /** Zusätzlich erlaubter absoluter Anstieg (gleiche Einheit wie die Kennzahl). */
  readonly absolute: number;
}

export type RegressionStatus = 'ok' | 'regression' | 'fehlt';

export interface RegressionResult {
  readonly metric: string;
  readonly baseline: number | null;
  readonly current: number | null;
  /** Höchster erlaubter Wert; `null`, wenn ohne Baseline nicht bestimmbar. */
  readonly limit: number | null;
  readonly status: RegressionStatus;
}

/** Höchster erlaubter Wert: Baseline · (1 + relativ) + absolut. */
export function regressionLimit(baseline: number, tolerance: Tolerance): number {
  return baseline * (1 + Math.max(0, tolerance.relative)) + Math.max(0, tolerance.absolute);
}

/**
 * Vergleicht jede Kennzahl mit Toleranz gegen die Baseline.
 * - Kennzahl fehlt in Baseline **oder** Messung → `fehlt` (kein stilles Bestehen).
 * - Messwert über der Grenze → `regression`, sonst `ok`.
 */
export function compareToBaseline(
  baseline: Readonly<Record<string, number | null | undefined>>,
  current: Readonly<Record<string, number | null | undefined>>,
  tolerances: Readonly<Record<string, Tolerance>>,
): RegressionResult[] {
  return Object.entries(tolerances).map(([metric, tolerance]): RegressionResult => {
    const base = finiteOrNull(baseline[metric]);
    const now = finiteOrNull(current[metric]);
    if (base === null || now === null) {
      return { metric, baseline: base, current: now, limit: null, status: 'fehlt' };
    }
    const limit = regressionLimit(base, tolerance);
    return {
      metric,
      baseline: base,
      current: now,
      limit,
      status: now > limit ? 'regression' : 'ok',
    };
  });
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
