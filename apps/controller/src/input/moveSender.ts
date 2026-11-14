/**
 * Drosselung der `move`-Nachrichten: höchstens ~30 pro Sekunde, nur bei Änderung,
 * Loslassen (`{0, 0}`) sofort. Die Entscheidung ist eine reine Funktion
 * ({@link planMoveSend}); {@link createMoveSender} ergänzt nur den Timer für den
 * nachlaufenden Wert, damit die letzte Stellung nie verloren geht.
 */
import { isZeroStick, sticksEqual, type Stick } from './joystick.ts';

/** Mindestabstand zwischen zwei `move`-Nachrichten (≈ 30 Hz). */
export const MOVE_INTERVAL_MS = 33;

export interface MoveSendState {
  /** Zuletzt gesendeter Vektor oder `null`, wenn noch nichts gesendet wurde. */
  readonly lastSent: Stick | null;
  /** Zeitpunkt der letzten Sendung (ms) oder `null`. */
  readonly lastSentAt: number | null;
}

export type MoveSendPlan =
  | { readonly kind: 'send' }
  | { readonly kind: 'skip' }
  | { readonly kind: 'defer'; readonly waitMs: number };

export function planMoveSend(
  state: MoveSendState,
  now: number,
  stick: Stick,
  intervalMs = MOVE_INTERVAL_MS,
): MoveSendPlan {
  if (state.lastSent !== null && sticksEqual(state.lastSent, stick)) return { kind: 'skip' };
  // Loslassen nie verzögern: die Figur soll sofort stehen bleiben.
  if (isZeroStick(stick)) return { kind: 'send' };
  if (state.lastSentAt === null) return { kind: 'send' };
  const elapsed = now - state.lastSentAt;
  if (elapsed >= intervalMs) return { kind: 'send' };
  return { kind: 'defer', waitMs: intervalMs - elapsed };
}

export interface Timers {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const browserTimers: Timers = {
  now: () => performance.now(),
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
};

export interface MoveSender {
  /** Neue Stick-Stellung melden; sendet sofort, später oder gar nicht. */
  readonly update: (stick: Stick) => void;
  /** Laufenden Timer verwerfen und den Zustand vergessen (z. B. neue Verbindung). */
  readonly reset: () => void;
}

export function createMoveSender(
  send: (stick: Stick) => void,
  options: { intervalMs?: number; timers?: Timers } = {},
): MoveSender {
  const intervalMs = options.intervalMs ?? MOVE_INTERVAL_MS;
  const timers = options.timers ?? browserTimers;
  let state: MoveSendState = { lastSent: null, lastSentAt: null };
  let pending: Stick | null = null;
  let timer: unknown = null;

  function clearTimer() {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  }

  function doSend(stick: Stick) {
    clearTimer();
    pending = null;
    state = { lastSent: stick, lastSentAt: timers.now() };
    send(stick);
  }

  function flush() {
    timer = null;
    const stick = pending;
    pending = null;
    if (stick !== null) update(stick);
  }

  function update(stick: Stick) {
    const plan = planMoveSend(state, timers.now(), stick, intervalMs);
    if (plan.kind === 'send') {
      doSend(stick);
    } else if (plan.kind === 'skip') {
      // Zurück auf den gesendeten Wert: ein vorgemerkter Zwischenwert ist überholt.
      pending = null;
      clearTimer();
    } else {
      pending = stick;
      timer ??= timers.setTimeout(flush, plan.waitMs);
    }
  }

  return {
    update,
    reset() {
      clearTimer();
      pending = null;
      state = { lastSent: null, lastSentAt: null };
    },
  };
}
