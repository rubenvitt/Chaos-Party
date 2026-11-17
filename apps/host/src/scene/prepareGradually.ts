/**
 * Shader schrittweise vorbereiten (CHAOS-71). `scene.whenReadyAsync` übersetzt alle Shader einer
 * Szene in einem Aufruf: Ohne `KHR_parallel_shader_compile` (z. B. SwiftShader, manche
 * Treiber) steht der Hauptthread dabei am Stück, beim Siegerpodest gemessen 0,5–1,5 s auf
 * 4 Kernen, unter Last deutlich mehr.
 *
 * Hier ist jedes Mesh ein eigener Schritt (Material und Schatten). Ist das Zeitbudget eines
 * Abschnitts verbraucht, darf der Browser erst ein Bild zeichnen; DOM-Animationen wie die
 * Trophäenzählung laufen weiter. Babylon 9 lädt Shader-Quellen nach: Ein Schritt meldet dann
 * „noch nicht bereit“, ohne etwas zu übersetzen. Solche Schritte kommen in der nächsten Runde
 * wieder dran, nach einer Pause. Was danach noch fehlt (Tiefenkarte, Schein, Nachbearbeitung,
 * parallele Übersetzung), erledigt `whenReadyAsync` – in einem Stück, gemessen 0,5–1,2 s bei
 * Stufe `hoch` in SwiftShader.
 *
 * Die Planung ({@link runInSlices}, {@link runInRounds}) ist ohne Babylon testbar;
 * {@link prepareSceneGradually} verdrahtet sie mit einer Szene.
 */
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh.js';
import type { Scene } from '@babylonjs/core/scene.js';

export interface SliceOptions {
  /** So viele ms Arbeit am Stück, dann ein Bild Pause (ein einzelner Schritt kann länger dauern). */
  readonly budgetMs: number;
  /** `true` = abbrechen (Szene entsorgt). */
  readonly isCancelled: () => boolean;
  /** Wartet bis nach dem nächsten gezeichneten Bild (Standard: {@link afterNextPaint}). */
  readonly pause?: () => Promise<void>;
  readonly now?: () => number;
}

export interface SliceStats {
  /** Bearbeitete Einträge. */
  readonly done: number;
  /** Pausen zwischen den Abschnitten. */
  readonly pauses: number;
  /** Längster Abschnitt am Stück in ms (Richtwert für Standbilder). */
  readonly longestSliceMs: number;
  readonly cancelled: boolean;
}

/** Wartet, bis der Browser das nächste Bild gezeichnet hat (rAF, danach eine Makroaufgabe). */
export function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      setTimeout(resolve, 0);
    });
  });
}

/** Bearbeitet `items` in Abschnitten von etwa `budgetMs`, mit einer Bildpause dazwischen. */
export async function runInSlices<T>(
  items: readonly T[],
  work: (item: T) => void,
  options: SliceOptions,
): Promise<SliceStats> {
  const now = options.now ?? (() => performance.now());
  const pause = options.pause ?? afterNextPaint;
  let done = 0;
  let pauses = 0;
  let longest = 0;
  let sliceStart = now();
  for (const item of items) {
    if (options.isCancelled()) {
      return { done, pauses, longestSliceMs: longest, cancelled: true };
    }
    work(item);
    done += 1;
    const elapsed = now() - sliceStart;
    longest = Math.max(longest, elapsed);
    if (elapsed >= options.budgetMs && done < items.length) {
      await pause();
      pauses += 1;
      sliceStart = now();
    }
  }
  return { done, pauses, longestSliceMs: longest, cancelled: options.isCancelled() };
}

export interface RoundStats {
  /** Durchgänge über die noch nicht bereiten Schritte. */
  readonly rounds: number;
  /** Schritte, die nach der letzten Runde noch nicht bereit waren. */
  readonly pending: number;
  readonly longestSliceMs: number;
  readonly cancelled: boolean;
}

/**
 * Wie {@link runInSlices}, aber `check` meldet, ob der Schritt fertig ist. Unfertige kommen nach
 * einer Pause in der nächsten Runde wieder dran, höchstens `maxRounds` Runden.
 */
export async function runInRounds<T>(
  items: readonly T[],
  check: (item: T) => boolean,
  options: SliceOptions & { readonly maxRounds: number },
): Promise<RoundStats> {
  const pause = options.pause ?? afterNextPaint;
  let pending = [...items];
  let rounds = 0;
  let longest = 0;
  while (pending.length > 0 && rounds < options.maxRounds) {
    if (rounds > 0) await pause();
    rounds += 1;
    const next: T[] = [];
    const stats = await runInSlices(
      pending,
      (item) => {
        if (!check(item)) next.push(item);
      },
      options,
    );
    longest = Math.max(longest, stats.longestSliceMs);
    if (stats.cancelled) {
      return { rounds, pending: pending.length, longestSliceMs: longest, cancelled: true };
    }
    pending = next;
  }
  return {
    rounds,
    pending: pending.length,
    longestSliceMs: longest,
    cancelled: options.isCancelled(),
  };
}

/** Ein Vorbereitungsschritt; `true` = fertig (oder nichts mehr zu tun). */
export type PreparationStep = () => boolean;

/**
 * Einzelschritte der Vorbereitung: je Mesh Material und Schatten, für den Pass der aktiven
 * Kamera wie `scene.isReady`.
 *
 * Bewusst **nicht** einzeln: Tiefenkarte, Schein (Glow), Schattenkarten-Ziele und
 * Nachbearbeitung. Deren eigene Bereitschaftsprüfungen außerhalb ihres Render-Passes meldeten
 * „bereit“, die Programme entstanden dann erst im ersten Bild und kosteten dort ein Vielfaches
 * (gemessen 2,9–3,3 s statt 0,5–1,2 s in `whenReadyAsync`, SwiftShader, CHAOS-71).
 */
export function preparationSteps(scene: Scene): PreparationStep[] {
  const engine = scene.getEngine();
  const camera = scene.activeCamera;
  // Wie `scene.isReady`: Meshes ohne Teilmeshes (Wurzeln, leere Knoten) zeichnen nichts.
  const meshes = scene.meshes.filter(
    (mesh) => (mesh.subMeshes as AbstractMesh['subMeshes'] | undefined)?.length,
  );
  const steps: PreparationStep[] = [];
  for (const mesh of meshes) {
    steps.push(() => {
      if (mesh.isDisposed()) return true;
      // Wirkungen gelten je Render-Pass; ohne den Pass der Kamera übersetzte `whenReadyAsync`
      // alles noch einmal.
      const previous = engine.currentRenderPassId;
      engine.currentRenderPassId = camera?.renderPassId ?? previous;
      try {
        return mesh.isReady(true);
      } finally {
        engine.currentRenderPassId = previous;
      }
    });
  }
  return steps;
}

/**
 * Bereitet alle Shader der Szene schrittweise vor ({@link preparationSteps}) und wartet danach
 * mit `whenReadyAsync` auf den Rest (Render-Ziele, parallele Übersetzung). Liefert `false` bei
 * Abbruch.
 */
export async function prepareSceneGradually(
  scene: Scene,
  options: Pick<SliceOptions, 'isCancelled'> & {
    readonly budgetMs?: number;
    readonly maxRounds?: number;
  },
): Promise<boolean> {
  const stats = await runInRounds(preparationSteps(scene), (step) => step(), {
    budgetMs: options.budgetMs ?? 12,
    maxRounds: options.maxRounds ?? 120,
    isCancelled: options.isCancelled,
  });
  if (stats.cancelled || options.isCancelled()) return false;
  await scene.whenReadyAsync(true);
  return !options.isCancelled();
}
