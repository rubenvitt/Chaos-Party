/**
 * Was Node und Browser haben, ein nacktes JSContext aber nicht (geprüft auf macOS und tvOS):
 * `setTimeout`, `performance`, `structuredClone`. Die Uhr ist die von Swift (`tick(nowMs)`),
 * Zeitgeber feuern nur in `tick`. `window`/`self`/`document` bleiben bewusst undefiniert,
 * sonst schlägt Babylon DOM-Pfade ein.
 */
let clock = 0;
let nextTimerId = 1;
const timers = new Map<number, { at: number; run: () => void }>();

export function now(): number {
  return clock;
}

/** Uhr vorstellen und fällige Zeitgeber (in Fälligkeitsreihenfolge) ausführen. */
export function advanceClock(nowMs: number): void {
  clock = Math.max(clock, nowMs);
  for (;;) {
    let dueId: number | null = null;
    let dueAt = Infinity;
    for (const [id, timer] of timers) {
      if (timer.at <= clock && timer.at < dueAt) {
        dueId = id;
        dueAt = timer.at;
      }
    }
    if (dueId === null) return;
    const timer = timers.get(dueId);
    timers.delete(dueId);
    timer?.run();
  }
}

const g = globalThis as unknown as Record<string, unknown>;

g.setTimeout = (callback: (...args: unknown[]) => void, ms = 0, ...args: unknown[]) => {
  const id = nextTimerId++;
  timers.set(id, {
    at: clock + Math.max(0, ms),
    run: () => {
      callback(...args);
    },
  });
  return id;
};
g.clearTimeout = (id: number | undefined) => {
  if (id !== undefined) timers.delete(id);
};
g.performance ??= { now };
// NullEngine sucht sein Global als `self ?? global ?? window` (Node hat `global`).
g.global ??= globalThis;
g.structuredClone ??= (value: unknown): unknown => JSON.parse(JSON.stringify(value));
