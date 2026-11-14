/**
 * Wartezeiten zwischen Wiederverbindungsversuchen (CHAOS-12, ADR-009).
 *
 * 0,5 s → 1 s → 2 s → 4 s → 5 s (Deckel), jeweils ±20 % Zufall, damit mehrere Handys
 * nach einem WLAN-Aussetzer oder Server-Neustart nicht im Gleichschritt anklopfen.
 * Im LAN ist ein Versuch billig; ein Deckel von 5 s hält die Wartezeit nach der
 * Rückkehr des PCs kurz.
 */

export const BACKOFF_STEPS_MS: readonly number[] = [500, 1000, 2000, 4000];
export const BACKOFF_MAX_MS = 5000;
/** Anteil Zufall (±) auf jede Stufe. */
export const BACKOFF_JITTER = 0.2;

/**
 * Wartezeit vor Versuch `attempt` (1, 2, …) in ms.
 * `random` liefert Werte in [0, 1) – austauschbar für deterministische Tests.
 */
export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const index = Math.max(0, Math.floor(attempt) - 1);
  const base = BACKOFF_STEPS_MS[index] ?? BACKOFF_MAX_MS;
  const factor = 1 - BACKOFF_JITTER + 2 * BACKOFF_JITTER * random();
  return Math.round(Math.min(BACKOFF_MAX_MS, Math.max(0, base * factor)));
}
