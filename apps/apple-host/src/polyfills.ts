/**
 * Was Node und Browser haben, ein nacktes JSContext aber nicht (geprüft auf macOS und tvOS):
 * `setTimeout`, `performance`, `structuredClone`. Die Uhr ist die von Swift (`tick(nowMs)`),
 * Zeitgeber feuern nur in `tick`. `window`/`self`/`document` bleiben bewusst undefiniert,
 * sonst schlägt Babylon DOM-Pfade ein.
 *
 * Rein und testbar: `createClock()` und `installPolyfills(target, clock)`. Das Bündel installiert
 * sie in `./install.ts` als erstes Modul auf `globalThis`.
 */

/**
 * Virtuelle Uhr des Kerns in ms; Zeitgeber feuern nur in `advance`. Funktionen statt Methoden:
 * Sie werden einzeln als Globals gesetzt (ohne `this`).
 */
export interface Clock {
  readonly now: () => number;
  /** Uhr auf `nowMs` vorstellen (nie zurück) und fällige Zeitgeber in Fälligkeitsreihenfolge ausführen. */
  readonly advance: (nowMs: number) => void;
  readonly setTimeout: (
    callback: (...args: unknown[]) => void,
    ms?: number,
    ...args: unknown[]
  ) => number;
  readonly clearTimeout: (id: number | undefined) => void;
  /** Anzahl wartender Zeitgeber (für Tests und Lecksuche). */
  readonly pending: () => number;
}

export function createClock(): Clock {
  let current = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => current,
    advance: (nowMs) => {
      current = Math.max(current, nowMs);
      for (;;) {
        let dueId: number | null = null;
        let dueAt = Infinity;
        // Bei gleicher Fälligkeit gewinnt der zuerst gestellte (Map behält die Einfügereihenfolge).
        for (const [id, timer] of timers) {
          if (timer.at <= current && timer.at < dueAt) {
            dueId = id;
            dueAt = timer.at;
          }
        }
        if (dueId === null) return;
        const timer = timers.get(dueId);
        timers.delete(dueId);
        timer?.run();
      }
    },
    setTimeout: (callback, ms = 0, ...args) => {
      const id = nextId++;
      const delay = Number.isFinite(ms) ? Math.max(0, ms) : 0;
      timers.set(id, {
        at: current + delay,
        run: () => {
          callback(...args);
        },
      });
      return id;
    },
    clearTimeout: (id) => {
      if (id !== undefined) timers.delete(id);
    },
    pending: () => timers.size,
  };
}

/**
 * Setzt die fehlenden Globals auf `target` (im Bündel `globalThis`). `setTimeout`/`clearTimeout`
 * werden immer ersetzt: Sie müssen an der Uhr des Kerns hängen, nicht an einer echten Zeit.
 * Vorhandenes `performance`, `structuredClone` und `global` bleibt.
 */
export function installPolyfills(target: Record<string, unknown>, clock: Clock): void {
  target.setTimeout = clock.setTimeout;
  target.clearTimeout = clock.clearTimeout;
  target.performance ??= { now: clock.now };
  // NullEngine sucht sein Global als `self ?? global ?? window` (Node hat `global`).
  target.global ??= target;
  target.structuredClone ??= jsonClone;
}

/** `structuredClone` für reine Daten (mehr braucht der Kern nicht: Nachrichten, Spielzustand). */
export function jsonClone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
