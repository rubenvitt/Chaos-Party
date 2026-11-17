/**
 * Laufzeit eines Minispiels (CHAOS-26, ADR-012): erzwingt den Lebenszyklus, den festen Takt,
 * die Eingaberegeln und die Ergebnisprüfung. Der Host benutzt sie mit echter Szene und
 * Render-Schleife, Tests mit NullEngine (`@chaos-party/minigame-sdk/testing`).
 *
 * Die Laufzeit rendert nicht; sie rechnet nur Logik und Physik. Wer rendert, ruft
 * `advance(seconds)` vor `scene.render()` auf. Die Physik läuft **nicht** im Render-Schritt
 * (`scene.physicsEnabled = false`), sondern hier im festen Takt nach jedem `update`.
 */
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import '@babylonjs/core/Physics/joinedPhysicsEngineComponent.js';
import type { Scene } from '@babylonjs/core/scene.js';
import type HavokPhysics from '@babylonjs/havok';
import type { MinigameInput, MinigameResult, Slot } from '../info.ts';
import { checkResult, rankByScore } from '../result.ts';
import { createMinigameRng } from '../rng.ts';
import { markVisual } from './visual.ts';
import {
  FIXED_STEP_SECONDS,
  type CharacterFactory,
  type Minigame,
  type MinigameFx,
  type MinigameHud,
  type MinigameLook,
  type MinigameModule,
  type MinigamePlayer,
} from './contract.ts';

export type HavokInstance = Awaited<ReturnType<typeof HavokPhysics>>;

/**
 * Höchstens so viele feste Schritte je `advance` (250 ms Aufholen): Bis etwa 4 Bilder/s bleibt
 * das Minispiel in Echtzeit (die Server-Frist hängt daran), längere Hänger werden verworfen.
 */
export const MAX_STEPS_PER_ADVANCE = 15;
/** So lange über das Zeitlimit hinaus wartet die Laufzeit, dann wertet sie selbst (HUD). */
export const OVERTIME_GRACE_MS = 1_000;
/** Schwerkraft für Physik-Minispiele. */
export const GRAVITY = new Vector3(0, -9.81, 0);

export type RunnerState = 'created' | 'preparing' | 'ready' | 'running' | 'finished' | 'disposed';

export interface RunnerOptions {
  readonly scene: Scene;
  readonly players: readonly MinigamePlayer[];
  readonly seed: number;
  /** Fehlt = `info.durationMs`. */
  readonly timeLimitMs?: number;
  readonly fx: MinigameFx;
  readonly characters: CharacterFactory;
  /** Pflicht, wenn `info.physics`. */
  readonly havok?: HavokInstance | null;
  readonly testMode?: boolean;
  /** Look des Hosts (CHAOS-62); fehlt in Tests. */
  readonly look?: MinigameLook;
  /**
   * Höchstzahl fester Schritte je `advance` (Standard `MAX_STEPS_PER_ADVANCE`). Der Host hebt
   * sie bei Software-Rendering an (Bilder dauern dort ≥ 0,25 s), damit die Spielzeit mit der
   * echten Zeit Schritt hält und das Ergebnis rechtzeitig beim Server ist.
   */
  readonly maxStepsPerAdvance?: number;
  /** Einmal, sobald ein gültiges Ergebnis feststeht. */
  readonly onResult?: (result: RunnerResult) => void;
}

export interface RunnerResult {
  readonly result: MinigameResult;
  /** `true`, wenn das Minispiel kein (gültiges) Ergebnis lieferte und die Laufzeit aus dem HUD werten musste. */
  readonly forced: boolean;
  /** Gerechnete Spielzeit bis zum Ergebnis (ms). */
  readonly elapsedMs: number;
}

export interface MinigameRunner {
  readonly state: RunnerState;
  readonly elapsedMs: number;
  readonly result: RunnerResult | null;
  readonly paused: boolean;
  prepare(): Promise<void>;
  start(): void;
  /** Eingabe eines Slots; außerhalb von `running` oder für Fremde still ignoriert. */
  input(slot: Slot, input: MinigameInput): void;
  /** Verbindungsstatus; bei Trennung neutrale Eingaben (Stick 0/0, Knöpfe los). */
  setConnected(slot: Slot, connected: boolean): void;
  /** Echte Zeit vergeht (Sekunden); rechnet 0…`MAX_STEPS_PER_ADVANCE` feste Schritte. */
  advance(seconds: number): number;
  /** Genau `steps` feste Schritte (Tests, deterministisch). */
  step(steps?: number): void;
  /**
   * Hält das Minispiel an (Partie-Pause, ADR-015): `advance` rechnet keine Schritte, `input`
   * wird ignoriert, gehaltene Eingaben werden neutralisiert. `elapsedMs` bleibt stehen.
   */
  pause(): void;
  /** Setzt fort, ohne die Pausenzeit nachzuholen. */
  resume(): void;
  hud(): MinigameHud;
  dispose(): void;
}

export function createMinigameRunner(
  module: MinigameModule,
  options: RunnerOptions,
): MinigameRunner {
  const { info } = module;
  const { scene, players } = options;
  const slots = players.map((player) => player.slot);
  const timeLimitMs = Math.max(1_000, Math.round(options.timeLimitMs ?? info.durationMs));
  const game: Minigame = module.create();
  const held = new Map<Slot, Set<'a' | 'b'>>();
  const stickActive = new Set<Slot>();
  const disconnected = new Set<Slot>();

  let state: RunnerState = 'created';
  let paused = false;
  let accumulator = 0;
  const maxSteps = Math.max(1, Math.floor(options.maxStepsPerAdvance ?? MAX_STEPS_PER_ADVANCE));
  let steps = 0;
  let result: RunnerResult | null = null;
  let physicsStep: ((seconds: number) => void) | null = null;

  const elapsedMs = () => Math.round(steps * FIXED_STEP_SECONDS * 1000);

  const settle = (candidate: MinigameResult | null): void => {
    if (result) return;
    const overtime = elapsedMs() > timeLimitMs + OVERTIME_GRACE_MS;
    if (candidate) {
      const check = checkResult(candidate, { minigameId: info.id, slots, scoring: info.scoring });
      if (check.ok) {
        finish({ result: candidate, forced: false, elapsedMs: elapsedMs() });
        return;
      }
      console.error(`Minispiel ${info.id}: ungültiges Ergebnis (${check.reason}), werte selbst`);
    } else if (!overtime) {
      return;
    }
    finish({ result: fallbackResult(), forced: true, elapsedMs: elapsedMs() });
  };

  const fallbackResult = (): MinigameResult => {
    let scores: readonly { slot: Slot; score: number }[] = [];
    try {
      scores = game.getHud().scores;
    } catch (error) {
      console.error(error);
    }
    const bySlot = new Map(scores.map((entry) => [entry.slot, entry.score]));
    return {
      minigameId: info.id,
      placements: rankByScore(
        slots.map((slot) => ({ slot, score: bySlot.get(slot) ?? 0 })),
        info.scoring,
      ),
    };
  };

  const finish = (value: RunnerResult) => {
    result = value;
    state = 'finished';
    options.onResult?.(value);
  };

  const fixedStep = () => {
    game.update(FIXED_STEP_SECONDS);
    physicsStep?.(FIXED_STEP_SECONDS);
    steps++;
    if (state === 'running') settle(game.getResult());
  };

  const neutralize = (slot: Slot) => {
    if (stickActive.has(slot)) {
      game.handleInput(slot, { type: 'move', x: 0, y: 0 });
      stickActive.delete(slot);
    }
    for (const button of held.get(slot) ?? []) game.handleInput(slot, { type: 'release', button });
    held.delete(slot);
  };

  return {
    get state() {
      return state;
    },
    get elapsedMs() {
      return elapsedMs();
    },
    get result() {
      return result;
    },
    get paused() {
      return paused;
    },
    async prepare() {
      if (state !== 'created') throw new Error(`prepare in Zustand ${state}`);
      state = 'preparing';
      if (info.physics) {
        if (!options.havok) throw new Error(`Minispiel ${info.id} braucht Havok`);
        const plugin = new HavokPlugin(false, options.havok);
        scene.enablePhysics(GRAVITY, plugin);
        // Physik nur im festen Takt der Laufzeit, nicht im Render-Schritt.
        scene.physicsEnabled = false;
        const engine = scene.getPhysicsEngine();
        if (!engine) throw new Error('Physik konnte nicht aktiviert werden');
        engine.setTimeStep(FIXED_STEP_SECONDS);
        physicsStep = (seconds) => {
          engine._step(seconds);
        };
      }
      await game.prepare({
        scene,
        players,
        seed: options.seed,
        rng: createMinigameRng(options.seed),
        timeLimitMs,
        fx: options.fx,
        characters: {
          // Figuren für native Hosts kennzeichnen (visual.ts), egal welche Fabrik sie baut.
          create: (figureScene, player) => {
            const handle = options.characters.create(figureScene, player);
            markVisual(handle.root, 'figur', player.slot);
            return handle;
          },
        },
        testMode: options.testMode ?? false,
        ...(options.look ? { look: options.look } : {}),
      });
      // Während `prepare` entsorgt? Dann nicht wiederbeleben.
      if ((state as RunnerState) === 'preparing') state = 'ready';
    },
    start() {
      if (state !== 'ready') throw new Error(`start in Zustand ${state}`);
      state = 'running';
      game.start();
      for (const slot of disconnected) neutralize(slot);
    },
    input(slot, input) {
      if (state !== 'running' || paused || !slots.includes(slot) || disconnected.has(slot)) return;
      if (input.type === 'move') {
        const x = clampAxis(input.x);
        const y = clampAxis(input.y);
        if (x === 0 && y === 0) stickActive.delete(slot);
        else stickActive.add(slot);
        game.handleInput(slot, { type: 'move', x, y });
        return;
      }
      const buttons = held.get(slot) ?? new Set();
      if (input.type === 'press') {
        if (buttons.has(input.button)) return; // doppeltes press ohne release
        buttons.add(input.button);
      } else {
        if (!buttons.has(input.button)) return;
        buttons.delete(input.button);
      }
      held.set(slot, buttons);
      game.handleInput(slot, input);
    },
    setConnected(slot, connected) {
      if (!slots.includes(slot)) return;
      if (connected) {
        disconnected.delete(slot);
        return;
      }
      disconnected.add(slot);
      if (state === 'running') neutralize(slot);
    },
    advance(seconds) {
      if ((state !== 'running' && state !== 'finished') || paused) return 0;
      accumulator += Math.max(0, seconds);
      let done = 0;
      while (accumulator >= FIXED_STEP_SECONDS && done < maxSteps) {
        accumulator -= FIXED_STEP_SECONDS;
        fixedStep();
        done++;
      }
      // Rückstand nach einem Hänger verwerfen statt nachzuholen.
      if (done === maxSteps) accumulator = Math.min(accumulator, FIXED_STEP_SECONDS);
      return done;
    },
    step(count = 1) {
      if (state !== 'running' && state !== 'finished') throw new Error(`step in Zustand ${state}`);
      for (let index = 0; index < count; index++) fixedStep();
    },
    pause() {
      // Server-Pause (ADR-015): Takt steht, Eingaben werden ignoriert. Gehaltene Sticks und
      // Knöpfe lassen los, damit nach `resume` nichts „klemmt“ (Loslassen kommt in der Pause
      // nicht mehr an, der Server leitet dann keine Eingaben weiter).
      if (paused) return;
      paused = true;
      if (state === 'running') for (const slot of slots) neutralize(slot);
    },
    resume() {
      // Rückstand aus der Pause wird nicht nachgeholt: Spielzeit läuft genau dort weiter.
      paused = false;
      accumulator = 0;
    },
    hud() {
      return game.getHud();
    },
    dispose() {
      if (state === 'disposed') return;
      state = 'disposed';
      try {
        game.dispose();
      } finally {
        physicsStep = null;
        if (scene.isPhysicsEnabled()) scene.disablePhysicsEngine();
      }
    },
  };
}

function clampAxis(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}
