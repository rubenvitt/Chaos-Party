/**
 * Seitenweite Szenen-Messung (CHAOS-39), nur mit `?debug=1`.
 *
 * Szenen melden sich mit {@link attachPerf} dort an, wo sie gebaut werden (Arena, Brett,
 * Minispiel-Bühne, Podest); die App meldet mit `?debug=1` einen {@link PerfMonitor} an. Die
 * Reihenfolge ist egal (React führt Effekte von Kindern vor denen der Eltern aus): Ein später
 * angemeldeter Monitor übernimmt die schon gebauten Szenen. Ohne Monitor merkt sich
 * `attachPerf` die Szene nur – keine Beobachter, keine Kosten.
 *
 * `window.__chaosPerf` (nur mit `?debug=1`, auch ohne Testmodus) liefert den Bericht je Szene
 * – für die automatischen Messläufe (`pnpm perf`) und zum Abschreiben in der Konsole.
 */
import type { PerfMonitor, ScenePerf } from './perfMonitor.ts';
import type { PerfSource } from './perfTypes.ts';
import type { SceneTransition } from './transitions.ts';

export interface ChaosPerfHook {
  /** Kennzahlen je Szene seit dem Laden bzw. dem letzten `reset()`. */
  report(): ScenePerf[];
  /** Kopierbare Zusammenfassung je Szene (wie „Alle Szenen kopieren“). */
  summary(): string;
  /** Gerade angemeldete Szenen. */
  activeScenes(): string[];
  /**
   * Szenenwechsel mit längstem Block (Long Task) zwischen Aufbau und erstem Bild (CHAOS-153,
   * `sceneMarks.ts`); leer in Browsern ohne `longtask`-Einträge nur ohne Blöcke.
   */
  transitions(): SceneTransition[];
  /** Neue Messreihe beginnen (auch Marken und Long Tasks). */
  reset(): void;
}

declare global {
  interface Window {
    __chaosPerf?: ChaosPerfHook;
  }
}

interface Registration {
  readonly scene: () => string;
  readonly source: PerfSource;
  detach: (() => void) | null;
}

const registrations = new Set<Registration>();
let active: PerfMonitor | null = null;

/** Monitor seitenweit anmelden (übernimmt gebaute Szenen); liefert die Abmeldung. */
export function installPerfMonitor(monitor: PerfMonitor): () => void {
  for (const registration of registrations) registration.detach?.();
  active = monitor;
  for (const registration of registrations) {
    registration.detach = monitor.attach(registration.scene, registration.source);
  }
  return () => {
    if (active !== monitor) return;
    active = null;
    for (const registration of registrations) {
      registration.detach?.();
      registration.detach = null;
    }
  };
}

/**
 * Szene anmelden (gemessen nur mit `?debug=1`). `scene` ist der Name in Bericht und Anzeige
 * oder eine Funktion, die ihn je Bild liefert. Liefert die Abmeldung.
 */
export function attachPerf(scene: string | (() => string), source: PerfSource): () => void {
  const registration: Registration = {
    scene: typeof scene === 'string' ? () => scene : scene,
    source,
    detach: null,
  };
  registrations.add(registration);
  if (active) registration.detach = active.attach(registration.scene, source);
  return () => {
    registration.detach?.();
    registration.detach = null;
    registrations.delete(registration);
  };
}
