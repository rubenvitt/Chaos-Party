import { describe, expect, it } from 'vitest';
import {
  createPreparePacing,
  NEXT_FRAME_FALLBACK_MS,
  nextPaintOrTimeout,
  PREPARE_BUDGET_MS,
  type FrameScheduler,
} from './preparePacing.ts';

/** Handgesteuerter Zeitplan: Bilder und Zeitgeber laufen nur, wenn der Test sie auslöst. */
function fakeScheduler() {
  let clock = 0;
  let nextId = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  const scheduler: FrameScheduler = {
    requestAnimationFrame: (callback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id) => {
      frames.delete(id);
    },
    setTimeout: (callback, ms) => {
      const id = nextId++;
      timers.set(id, { at: clock + ms, callback });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
    now: () => clock,
  };
  return {
    scheduler,
    get pendingFrames() {
      return frames.size;
    },
    get pendingTimers() {
      return timers.size;
    },
    /** Ein Bild: alle angemeldeten rAF-Rückrufe. */
    paint() {
      const due = [...frames.values()];
      frames.clear();
      for (const callback of due) callback();
    },
    /** Uhr vorstellen und fällige Zeitgeber auslösen. */
    advance(ms: number) {
      clock += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock) {
          timers.delete(id);
          timer.callback();
        }
      }
    },
  };
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('nextPaintOrTimeout', () => {
  it('löst erst nach dem Bild und einer Makroaufgabe auf', async () => {
    const fake = fakeScheduler();
    let done = false;
    void nextPaintOrTimeout(fake.scheduler).then(() => (done = true));
    await flush();
    expect(done).toBe(false);
    fake.paint();
    await flush();
    // Im rAF selbst noch nicht: erst die Makroaufgabe danach.
    expect(done).toBe(false);
    fake.advance(0);
    await flush();
    expect(done).toBe(true);
    // Rückfall-Zeitgeber ist aufgeräumt.
    expect(fake.pendingTimers).toBe(0);
  });

  it('geht ohne Bild (Hintergrund-Tab) nach dem Rückfall weiter', async () => {
    const fake = fakeScheduler();
    let done = false;
    void nextPaintOrTimeout(fake.scheduler).then(() => (done = true));
    fake.advance(NEXT_FRAME_FALLBACK_MS - 1);
    await flush();
    expect(done).toBe(false);
    fake.advance(1);
    await flush();
    expect(done).toBe(true);
    expect(fake.pendingFrames).toBe(0);
  });
});

describe('createPreparePacing', () => {
  it('nutzt die echte Uhr und das Bildbudget', () => {
    const fake = fakeScheduler();
    const pacing = createPreparePacing(fake.scheduler);
    expect(pacing.budgetMs).toBe(PREPARE_BUDGET_MS);
    fake.advance(42);
    expect(pacing.now()).toBe(42);
  });
});
