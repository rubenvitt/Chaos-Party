/**
 * Bildwiederholrate des Bildschirms schätzen (CHAOS-76). Rein bis auf {@link startRefreshProbe}.
 *
 * Der Browser zeichnet höchstens so oft, wie der Bildschirm auffrischt. Ein 30-Hz-Fernseher
 * (4K über HDMI 1.4) liefert deshalb nie mehr als 30 fps, auch wenn die GPU viel mehr könnte.
 * Die Grafik-Automatik ({@link ./quality.ts}) misst ihre Schwelle deshalb relativ zur hier
 * geschätzten Rate statt fest gegen 45 fps.
 *
 * Schätzung: Bildabstände in Paketen sammeln; der **schnellste stabile** Abstand ist die
 * Auffrischdauer. „Stabil“ heißt: Ein guter Teil der Abstände liegt dicht beim schnellen Rand
 * (10-%-Quantil). Lange Abstände (Ladezeiten, langsame GPU) verschieben das Ergebnis nicht,
 * einzelne kurze Ausreißer auch nicht.
 *
 * Mehrdeutig bleibt: Eine GPU, die an 60 Hz jedes Bild knapp verpasst, liefert ebenfalls
 * stabile 33 ms. Deshalb gilt für die Sitzung die **höchste** je erkannte Rate, und beim
 * Seitenstart misst {@link startRefreshProbe} kurz, solange noch keine 3D-Szene rendert.
 */

export const REFRESH = {
  /** So viele Bildabstände bilden ein Paket für eine Schätzung. */
  batch: 60,
  /** Mindestanteil der Abstände nahe beim schnellen Rand, sonst keine Schätzung. */
  stableShare: 0.3,
  /** Relative Abweichung, die noch als „gleich schnell“ zählt (Zeitstempel zittern). */
  tolerance: 0.15,
  /** Plausibler Bereich (Hz); außerhalb keine Schätzung. */
  minHz: 20,
  maxHz: 500,
  /** Abstände darüber (Tab im Hintergrund, Ladepause) zählen nicht. */
  pauseMs: 500,
  /** Startmessung: mindestens so viele Bilder (4 s bei 60 Hz) … */
  probeMinFrames: 240,
  /** … und ohne Ergebnis höchstens so viele. */
  probeMaxFrames: 600,
} as const;

/**
 * Rate (Hz) aus einem Paket Bildabständen (ms) oder `null`, wenn kein stabiler schneller
 * Abstand erkennbar ist.
 */
export function estimateRefreshHz(intervals: readonly number[]): number | null {
  const valid = intervals
    .filter((ms) => Number.isFinite(ms) && ms > 0 && ms <= REFRESH.pauseMs)
    .sort((a, b) => a - b);
  if (valid.length < REFRESH.batch / 2) return null;
  const anchor = valid[Math.floor(valid.length * 0.1)] ?? 0;
  const cluster = valid.filter(
    (ms) => ms >= anchor * (1 - REFRESH.tolerance) && ms <= anchor * (1 + REFRESH.tolerance),
  );
  if (cluster.length < valid.length * REFRESH.stableShare) return null;
  const period = cluster[Math.floor(cluster.length / 2)] ?? 0;
  const hz = 1000 / period;
  return hz >= REFRESH.minHz && hz <= REFRESH.maxHz ? hz : null;
}

export interface RefreshEstimator {
  /** Höchste bisher erkannte Rate (Hz) oder `null`. */
  readonly hz: number | null;
  /** Ein Bildabstand (ms); liefert die neue Rate, wenn das Paket sie erhöht hat. */
  sample(intervalMs: number): number | null;
}

/** Sammelt Abstände paketweise und merkt sich die höchste erkannte Rate. */
export function createRefreshEstimator(): RefreshEstimator {
  let hz: number | null = null;
  let batch: number[] = [];
  return {
    get hz() {
      return hz;
    },
    sample(intervalMs) {
      if (!Number.isFinite(intervalMs) || intervalMs <= 0 || intervalMs > REFRESH.pauseMs) {
        return null;
      }
      batch.push(intervalMs);
      if (batch.length < REFRESH.batch) return null;
      const estimate = estimateRefreshHz(batch);
      batch = [];
      if (estimate === null || (hz !== null && estimate <= hz)) return null;
      hz = estimate;
      return hz;
    },
  };
}

/** Schätzung dieser Sitzung (Seite): Startmessung und alle Szenen mit Automatik füttern sie. */
let session = createRefreshEstimator();

/** Erkannte Bildwiederholrate der Sitzung (Hz) oder `null`, solange unbekannt. */
export function sessionRefreshHz(): number | null {
  return session.hz;
}

/** Einen Bildabstand (ms) in die Schätzung der Sitzung geben. */
export function recordFrameInterval(intervalMs: number): void {
  session.sample(intervalMs);
}

/** Für Tests: Schätzung der Sitzung vergessen. */
export function resetSessionRefresh(): void {
  session = createRefreshEstimator();
}

/**
 * Startmessung beim Seitenstart: zählt `requestAnimationFrame`-Abstände über
 * {@link REFRESH.probeMinFrames} Bilder, ohne erkannte Rate weiter bis
 * {@link REFRESH.probeMaxFrames}. Kostet nichts Nennenswertes (leere Callbacks). Die Zeitstempel der Callbacks sind die
 * Bildanfänge und zittern weniger als `performance.now()` in der Render-Schleife.
 */
export function startRefreshProbe(
  raf: (callback: (time: number) => void) => unknown = (cb) => window.requestAnimationFrame(cb),
): void {
  let last: number | null = null;
  let frames = 0;
  const step = (time: number): void => {
    if (last !== null) recordFrameInterval(time - last);
    last = time;
    frames += 1;
    const more =
      frames < REFRESH.probeMinFrames || (session.hz === null && frames < REFRESH.probeMaxFrames);
    if (more) raf(step);
  };
  raf(step);
}
