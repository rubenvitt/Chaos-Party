/**
 * Countdown einer offenen Entscheidung (CHAOS-22) – nur Anzeige.
 *
 * Der Server schickt mit jedem Kontext die **Restzeit** (`prompt.remainingMs`), keine
 * Uhrzeit: Controller- und Server-Uhr sind nie abgeglichen (ADR-003/B8). Der Controller
 * merkt sich die Empfangszeit auf seiner eigenen monotonen Uhr und zählt von dort lokal
 * herunter. Die Frist entscheidet allein der Server; eine verspätete Wahl beantwortet er
 * mit `invalid-choice`. Rein, ohne DOM und ohne Uhr (Zeitpunkte kommen als Argument).
 */
import type { PromptInfo } from '@chaos-party/protocol';

/** Offene Entscheidung eines Slots samt lokaler Frist. */
export interface ActivePrompt {
  readonly info: PromptInfo;
  /** Frist auf der Uhr der Empfangszeit (`performance.now()`) oder `null` = unbegrenzt. */
  readonly deadlineAt: number | null;
  /**
   * Volle Länge des Balkens: Restzeit beim **ersten** Kontext mit dieser Prompt-ID.
   * Ein erneut gesendeter Kontext (z. B. Münzstand geändert) setzt den Balken nicht zurück.
   */
  readonly totalMs: number | null;
}

/**
 * Prompt aus einem neuen Kontext übernehmen. `previous` ist der bisherige Prompt
 * desselben Slots; bei gleicher ID bleibt die volle Länge erhalten, die Frist wird
 * mit dem frischen Server-Wert neu gesetzt.
 */
export function activatePrompt(
  info: PromptInfo,
  previous: ActivePrompt | undefined,
  receivedAt: number,
): ActivePrompt {
  if (info.remainingMs === null) return { info, deadlineAt: null, totalMs: null };
  const deadlineAt = receivedAt + info.remainingMs;
  const previousTotal = previous?.info.id === info.id ? previous.totalMs : null;
  const totalMs =
    previousTotal === null ? info.remainingMs : Math.max(previousTotal, info.remainingMs);
  return { info, deadlineAt, totalMs };
}

/** Verbleibende Zeit in ms (nie negativ) oder `null` ohne Frist. */
export function remainingAt(prompt: ActivePrompt, now: number): number | null {
  if (prompt.deadlineAt === null) return null;
  return Math.max(0, prompt.deadlineAt - now);
}

/** Füllstand des Balkens 0…1 (1 = volle Zeit) oder `null` ohne Frist. */
export function countdownFraction(prompt: ActivePrompt, now: number): number | null {
  const left = remainingAt(prompt, now);
  if (left === null) return null;
  const total = prompt.totalMs ?? 0;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, left / total));
}

/** Angezeigte ganze Sekunden: aufgerundet, damit „0“ erst am Ende erscheint. */
export function secondsLeft(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}
