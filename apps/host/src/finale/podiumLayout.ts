/**
 * Aufstellung des Siegerpodests (CHAOS-37), ohne Babylon: Höhe je Platz, x-Position je Eintrag
 * und Farbstich der Blöcke. Geteilt von `podiumStage.ts` (Browser-Host) und dem JS-Kern des
 * nativen Apple-Hosts (`apps/apple-host/src/finaleView.ts`, CHAOS-145), der das Podest in
 * RealityKit zeichnen lässt.
 */

/** Podesthöhe je Platz (geteilte Plätze gleich hoch). */
export function podiumHeight(place: number): number {
  return [1.5, 1.0, 0.68, 0.42][place - 1] ?? 0.42;
}

/**
 * x-Position je Eintrag in Rangfolge: Platz 1 in die Mitte, dann abwechselnd links/rechts
 * (klassisches Podest 2–1–3, ein vierter ganz außen links).
 */
export function podiumSlots(count: number): number[] {
  const spacing = 2.25;
  const order = [0, -1, 1, -2, 2];
  return order.slice(0, count).map((index) => index * spacing);
}

/** `podiumSlots`, um die Mitte der Aufstellung verschoben (das Podest steht mittig auf der Insel). */
export function centeredPodiumSlots(count: number): number[] {
  const raw = podiumSlots(count);
  const center = (Math.min(0, ...raw) + Math.max(0, ...raw)) / 2;
  return raw.map((x) => x - center);
}

/** Farbstich des Holzes je Platz: Gold, Silber, Bronze, Lila. */
export const BLOCK_COLORS: readonly string[] = ['#ffd75e', '#e2e8ee', '#eaa974', '#cfc6f2'];

/** Farbstich des Blocks für einen Platz. */
export function blockColor(place: number): string {
  return BLOCK_COLORS[place - 1] ?? '#cfc6f2';
}
