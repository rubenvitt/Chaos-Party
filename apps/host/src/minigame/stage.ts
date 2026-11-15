/**
 * Minispiel-Bühne (M3, CHAOS-26/33): eine eigene Babylon-Engine und Szene je Minispiel auf
 * einem eigenen Canvas, darin der Runner aus dem minigame-sdk mit Figuren, Havok (falls
 * `info.physics`) und Effekten. Framework-frei; React (`MinigameScreen`) steuert sie.
 *
 * Lebenszyklus: `createMinigameStage` lädt sofort (Figuren, Havok, `runner.prepare`) und
 * rendert das vorbereitete Bild – das ist der Hintergrund der Anleitung. `start()` lässt die
 * Spielzeit laufen (auch wenn es vor Ende des Ladens kommt: dann direkt danach).
 * `celebrate()` lässt die Figuren zum Ergebnis jubeln/schmollen. `dispose()` entsorgt alles:
 * Render-Schleife, Runner (räumt das Minispiel weg), Effekte, Figuren, Szene, Engine.
 *
 * Testmodus: keine Render-Schleife; `step(n)` rechnet n feste Schritte und rendert einmal.
 */
import { Engine } from '@babylonjs/core/Engines/engine.js';
import { Color4 } from '@babylonjs/core/Maths/math.color.js';
import { Scene } from '@babylonjs/core/scene.js';
import type { MinigameInput, MinigamePlacement, Slot } from '@chaos-party/minigame-sdk';
import {
  createMinigameRunner,
  type CharacterFactory,
  type CharacterHandle,
  type MinigameHud,
  type MinigameModule,
  type MinigamePlayer,
  type MinigameRunner,
  type RunnerResult,
  type RunnerState,
} from '@chaos-party/minigame-sdk/babylon';
import { loadCharacters, type CharacterLibrary } from '../characters/index.ts';
import type { SoundEngine } from '../fx/audio.ts';
import { createMinigameFx, type FxStats, type HostMinigameFx } from '../fx/minigameFx.ts';
import { loadHavok } from '../scene/havok.ts';

export type StageStatus = 'loading' | 'ready' | 'error' | 'disposed';

export interface MinigameStageOptions {
  readonly canvas: HTMLCanvasElement;
  readonly module: MinigameModule;
  readonly players: readonly MinigamePlayer[];
  readonly seed: number;
  /** Spielzeit (ms); nach Host-Neuladen die Restzeit. */
  readonly timeLimitMs: number;
  readonly testMode: boolean;
  readonly sound: SoundEngine;
  /** Genau einmal, sobald das Minispiel ein (geprüftes) Ergebnis hat. */
  readonly onResult: (result: RunnerResult) => void;
  /** Ladefehler (Havok, Figuren, `prepare`). */
  readonly onError?: (error: unknown) => void;
}

export interface MinigameStage {
  readonly status: StageStatus;
  /** Erfüllt, sobald vorbereitet und das erste Bild gerendert ist. */
  readonly ready: Promise<void>;
  readonly runnerState: RunnerState | null;
  readonly elapsedMs: number;
  readonly result: RunnerResult | null;
  readonly fxStats: FxStats;
  /** Spielzeit starten (idempotent; vor dem Laden: direkt danach). */
  start(): void;
  input(slot: Slot, input: MinigameInput): void;
  setConnected(slot: Slot, connected: boolean): void;
  /** Figuren jubeln (Platz 1) bzw. schmollen; Jubel-Klang und Konfetti. Einmal je Bühne. */
  celebrate(placements: readonly MinigamePlacement[]): void;
  /** Nur Testmodus: `frames` feste Schritte, dann ein Bild. */
  step(frames: number): void;
  hud(): MinigameHud | null;
  dispose(): void;
}

/** Figuren-Fabrik, die sich die erzeugten Figuren je Slot merkt (für Jubel/Schmollen). */
function trackingFactory(library: CharacterFactory): {
  readonly factory: CharacterFactory;
  readonly handles: Map<Slot, CharacterHandle>;
} {
  const handles = new Map<Slot, CharacterHandle>();
  return {
    handles,
    factory: {
      create(scene, player) {
        const handle = library.create(scene, player);
        handles.set(player.slot, handle);
        return handle;
      },
    },
  };
}

export function createMinigameStage(options: MinigameStageOptions): MinigameStage {
  const { canvas, module, testMode } = options;
  const engine = new Engine(
    canvas,
    true,
    { preserveDrawingBuffer: testMode, stencil: true },
    // Testmodus: Gerätepixelverhältnis 1 wie Arena und Brett (stabile Screenshots).
    !testMode,
  );
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0, 0, 0, 0);
  const fx: HostMinigameFx = createMinigameFx(scene, { sound: options.sound, testMode });

  let status: StageStatus = 'loading';
  let runner: MinigameRunner | null = null;
  let library: CharacterLibrary | null = null;
  let handles = new Map<Slot, CharacterHandle>();
  // Als Objekt, damit TypeScript die Werte nach `await` nicht fälschlich festnagelt.
  const flags = { startRequested: false, celebrated: false };
  const isDisposed = () => status === 'disposed';

  const resize = () => {
    engine.resize();
  };
  window.addEventListener('resize', resize);

  const renderOnce = () => {
    if (!isDisposed() && scene.activeCamera) scene.render();
  };

  const startNow = () => {
    if (runner?.state !== 'ready') return;
    runner.start();
  };

  const ready = (async () => {
    const loaded = await loadCharacters(scene);
    if (isDisposed()) {
      loaded.dispose();
      return;
    }
    library = loaded;
    const havok = module.info.physics ? await loadHavok() : null;
    if (isDisposed()) return;
    const tracked = trackingFactory(loaded);
    handles = tracked.handles;
    runner = createMinigameRunner(module, {
      scene,
      players: options.players,
      seed: options.seed,
      timeLimitMs: options.timeLimitMs,
      fx,
      characters: tracked.factory,
      havok,
      testMode,
      onResult: (result) => {
        options.onResult(result);
      },
    });
    await runner.prepare();
    if (isDisposed()) return;
    // Erst wenn alle Shader/Texturen bereit sind, zeigt das erste Bild die ganze Szene
    // (Hintergrund der Anleitung, stabile Screenshots).
    await scene.whenReadyAsync(true);
    if (isDisposed()) return;
    status = 'ready';
    if (flags.startRequested) startNow();
    renderOnce();
    if (testMode) return;
    let last = performance.now();
    engine.runRenderLoop(() => {
      const now = performance.now();
      runner?.advance((now - last) / 1000);
      last = now;
      renderOnce();
    });
  })();
  ready.catch((error: unknown) => {
    if (isDisposed()) return;
    status = 'error';
    console.error(`Minispiel ${module.info.id} konnte nicht geladen werden`, error);
    options.onError?.(error);
  });

  return {
    get status() {
      return status;
    },
    ready,
    get runnerState() {
      return runner?.state ?? null;
    },
    get elapsedMs() {
      return runner?.elapsedMs ?? 0;
    },
    get result() {
      return runner?.result ?? null;
    },
    get fxStats() {
      return fx.stats;
    },
    start() {
      flags.startRequested = true;
      if (status === 'ready') startNow();
    },
    input(slot, input) {
      runner?.input(slot, input);
    },
    setConnected(slot, connected) {
      runner?.setConnected(slot, connected);
    },
    celebrate(placements) {
      if (flags.celebrated || isDisposed()) return;
      flags.celebrated = true;
      fx.sound('cheer');
      for (const entry of placements) {
        const handle = handles.get(entry.slot);
        if (!handle) continue;
        try {
          handle.play(entry.place === 1 ? 'cheer' : 'sad');
          if (entry.place === 1) {
            const at = handle.root.getAbsolutePosition();
            fx.burst('confetti', { x: at.x, y: at.y + 1.6, z: at.z });
          }
        } catch (error) {
          // Das Minispiel hat die Figur womöglich schon selbst entsorgt – reine Optik.
          console.warn('Figur kann nicht jubeln', error);
        }
      }
    },
    step(frames) {
      if (!runner) return;
      for (let index = 0; index < frames; index++) {
        if (runner.state === 'running' || runner.state === 'finished') runner.step(1);
      }
      renderOnce();
    },
    hud() {
      if (!runner || runner.state === 'created' || runner.state === 'preparing') return null;
      try {
        return runner.hud();
      } catch (error) {
        console.warn('Minispiel-HUD nicht lesbar', error);
        return null;
      }
    },
    dispose() {
      if (isDisposed()) return;
      status = 'disposed';
      window.removeEventListener('resize', resize);
      engine.stopRenderLoop();
      try {
        runner?.dispose();
      } finally {
        fx.dispose();
        library?.dispose();
        scene.dispose();
        engine.dispose();
      }
    },
  };
}
