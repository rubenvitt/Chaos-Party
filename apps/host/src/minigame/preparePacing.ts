/**
 * Taktgeber für den verteilten Minispiel-Aufbau am PC-Host (CHAOS-168, Nachzug zu CHAOS-141).
 *
 * Die Minispiele rufen in `prepare` zwischen ihren Bauschritten `await ctx.pace()`. Mit diesem
 * Taktgeber gibt die Laufzeit nach {@link PREPARE_BUDGET_MS} ms Arbeit ab und rechnet erst nach
 * dem nächsten gezeichneten Bild weiter. Die Anleitung (DOM) läuft so weiter, statt während
 * `runner.prepare` am Stück zu stehen (CHAOS-132 maß dort 0,50–0,77 s in SwiftShader).
 *
 * „Nächstes Bild“ heißt wie bei `afterNextPaint` (`../scene/prepareGradually.ts`): nach dem
 * `requestAnimationFrame` noch eine Makroaufgabe, damit der Bauschritt nicht im selben Bild vor
 * dem Zeichnen landet. Im Hintergrund-Tab ruht `requestAnimationFrame`; dann geht es nach
 * {@link NEXT_FRAME_FALLBACK_MS} ms per Zeitgeber weiter, damit der Aufbau nicht hängt.
 */
import type { PrepareThrottle } from '@chaos-party/minigame-sdk/babylon';

/**
 * So viele ms rechnet der Aufbau höchstens am Stück, dann ein Bild Pause. Unter dem Bildbudget
 * von 16,7 ms: Ein Bauschritt kann das Budget überschreiten, bevor `pace` wieder fragt.
 */
export const PREPARE_BUDGET_MS = 6;

/** Spätestens nach so vielen ms geht der Aufbau weiter, auch ohne Bild (Hintergrund-Tab). */
export const NEXT_FRAME_FALLBACK_MS = 100;

export interface FrameScheduler {
  readonly requestAnimationFrame: (callback: () => void) => number;
  readonly cancelAnimationFrame: (handle: number) => void;
  readonly setTimeout: (callback: () => void, ms: number) => number;
  readonly clearTimeout: (handle: number) => void;
  readonly now: () => number;
}

const browserScheduler: FrameScheduler = {
  requestAnimationFrame: (callback) => window.requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => {
    window.cancelAnimationFrame(handle);
  },
  setTimeout: (callback, ms) => window.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    window.clearTimeout(handle);
  },
  now: () => performance.now(),
};

/** Löst nach dem nächsten gezeichneten Bild auf, spätestens nach `fallbackMs`. */
export function nextPaintOrTimeout(
  scheduler: FrameScheduler = browserScheduler,
  fallbackMs: number = NEXT_FRAME_FALLBACK_MS,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      scheduler.cancelAnimationFrame(frame);
      scheduler.clearTimeout(fallback);
      resolve();
    };
    const frame = scheduler.requestAnimationFrame(() => {
      // Nach dem Bild weiter, nicht im rAF davor (sonst zeichnet das Bild erst nach dem Schritt).
      scheduler.setTimeout(finish, 0);
    });
    const fallback = scheduler.setTimeout(finish, fallbackMs);
  });
}

/** Taktgeber für `RunnerOptions.pacing` mit echter Uhr (`performance.now`). */
export function createPreparePacing(
  scheduler: FrameScheduler = browserScheduler,
  budgetMs: number = PREPARE_BUDGET_MS,
): PrepareThrottle {
  return {
    nextFrame: () => nextPaintOrTimeout(scheduler),
    now: scheduler.now,
    budgetMs,
  };
}
