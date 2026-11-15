import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate.js';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder.js';
import type { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { describe, expect, it } from 'vitest';
import type { MinigameInfo, MinigameInput, MinigameResult, Slot } from '../info.ts';
import { rankByScore } from '../result.ts';
import {
  createHeadlessScene,
  createRecordingFx,
  createTestCharacters,
  EMPTY_RESIDUE,
  loadHavokForNode,
  runMinigameHeadless,
  sceneResidue,
  testPlayers,
} from '../testing/headless.ts';
import type { Minigame, MinigameContext, MinigameModule } from './contract.ts';
import { createMinigameRunner, MAX_STEPS_PER_ADVANCE, type RunnerOptions } from './runner.ts';

const BASE_INFO: MinigameInfo = {
  id: 'test-spiel',
  category: 'arcade',
  title: 'Test',
  tagline: 'Nur für Tests',
  instructions: ['Testen.'],
  controls: { joystick: 'Laufen', a: 'Springen', b: null },
  durationMs: 5_000,
  physics: false,
  scoring: 'higher',
  scoreUnit: 'Punkte',
};

/** Protokolliert alle Aufrufe; Ergebnis nach `finishAfterMs` oder nie. */
function probe(options: {
  info?: Partial<MinigameInfo>;
  finishAfterMs?: number;
  badResult?: boolean;
  physicsBall?: boolean;
}) {
  const info = { ...BASE_INFO, ...options.info };
  const calls: string[] = [];
  const inputs: [Slot, MinigameInput][] = [];
  let ball: Mesh | null = null;
  const created: { dispose(): void }[] = [];
  const module: MinigameModule = {
    info,
    create(): Minigame {
      let ctx: MinigameContext | null = null;
      let elapsed = 0;
      let result: MinigameResult | null = null;
      return {
        prepare(context) {
          ctx = context;
          calls.push('prepare');
          if (options.physicsBall) {
            const ground = CreateBox('boden', { width: 10, depth: 10, height: 1 }, context.scene);
            ground.position.y = -0.5;
            const groundBody = new PhysicsAggregate(
              ground,
              PhysicsShapeType.BOX,
              { mass: 0 },
              context.scene,
            );
            ball = CreateSphere('ball', { diameter: 1 }, context.scene);
            ball.position.y = 5;
            const ballBody = new PhysicsAggregate(
              ball,
              PhysicsShapeType.SPHERE,
              { mass: 1 },
              context.scene,
            );
            created.push(ballBody, ball, groundBody, ground);
          }
          return Promise.resolve();
        },
        start: () => calls.push('start'),
        handleInput: (slot, input) => inputs.push([slot, input]),
        update(dt) {
          elapsed += dt * 1000;
          if (
            options.finishAfterMs !== undefined &&
            elapsed >= options.finishAfterMs &&
            !result &&
            ctx
          ) {
            result = options.badResult
              ? { minigameId: info.id, placements: [] }
              : {
                  minigameId: info.id,
                  placements: rankByScore(
                    ctx.players.map((p) => ({ slot: p.slot, score: p.slot })),
                  ),
                };
          }
        },
        getResult: () => result,
        getHud: () => ({
          remainingMs: Math.max(0, 5000 - elapsed),
          scores: (ctx?.players ?? []).map((p) => ({ slot: p.slot, score: 10 - p.slot })),
        }),
        dispose() {
          calls.push('dispose');
          for (const item of created.splice(0)) item.dispose();
        },
      };
    },
  };
  return { module, calls, inputs, ball: () => ball };
}

async function setup(
  module: MinigameModule,
  players = 2,
  extra: Partial<Pick<RunnerOptions, 'maxStepsPerAdvance' | 'look'>> = {},
) {
  const headless = createHeadlessScene();
  const runner = createMinigameRunner(module, {
    scene: headless.scene,
    players: testPlayers(players),
    seed: 1,
    fx: createRecordingFx(),
    characters: createTestCharacters(),
    havok: module.info.physics ? await loadHavokForNode() : null,
    testMode: true,
    ...extra,
  });
  return { headless, runner };
}

describe('Minispiel-Laufzeit', () => {
  it('erzwingt die Reihenfolge prepare → start → step → dispose', async () => {
    const { module, calls } = probe({ finishAfterMs: 100 });
    const { runner, headless } = await setup(module);
    expect(() => {
      runner.start();
    }).toThrow();
    await runner.prepare();
    await expect(runner.prepare()).rejects.toThrow();
    runner.start();
    runner.step(10);
    expect(runner.state).toBe('finished');
    runner.dispose();
    runner.dispose();
    expect(calls).toEqual(['prepare', 'start', 'dispose']);
    headless.dispose();
  });

  it('gibt Eingaben nur laufend, nur an Teilnehmer und begrenzt die Achsen', async () => {
    const { module, inputs } = probe({});
    const { runner, headless } = await setup(module, 2);
    await runner.prepare();
    runner.input(1, { type: 'press', button: 'a' }); // vor dem Start
    runner.start();
    runner.input(3, { type: 'press', button: 'a' }); // spielt nicht mit
    runner.input(1, { type: 'move', x: 4, y: -Infinity });
    runner.input(2, { type: 'press', button: 'a' });
    runner.input(2, { type: 'press', button: 'a' }); // doppelt
    runner.input(2, { type: 'release', button: 'b' }); // nie gedrückt
    expect(inputs).toEqual([
      [1, { type: 'move', x: 1, y: 0 }],
      [2, { type: 'press', button: 'a' }],
    ]);
    runner.dispose();
    headless.dispose();
  });

  it('neutralisiert getrennte Spieler und ignoriert ihre Eingaben bis zur Rückkehr', async () => {
    const { module, inputs } = probe({});
    const { runner, headless } = await setup(module, 2);
    await runner.prepare();
    runner.start();
    runner.input(1, { type: 'move', x: 0.5, y: 0.5 });
    runner.input(1, { type: 'press', button: 'a' });
    runner.setConnected(1, false);
    runner.input(1, { type: 'press', button: 'b' });
    runner.setConnected(1, true);
    runner.input(1, { type: 'press', button: 'b' });
    expect(inputs.slice(2)).toEqual([
      [1, { type: 'move', x: 0, y: 0 }],
      [1, { type: 'release', button: 'a' }],
      [1, { type: 'press', button: 'b' }],
    ]);
    runner.dispose();
    headless.dispose();
  });

  it('wertet selbst aus dem HUD, wenn das Minispiel das Zeitlimit überzieht', async () => {
    const run = await runMinigameHeadless(probe({}).module, { players: 3 });
    expect(run.outcome?.forced).toBe(true);
    // HUD-Punkte 10 - Slot → Slot 1 vorn.
    expect(run.outcome?.result.placements.map((p) => p.slot)).toEqual([1, 2, 3]);
    expect(run.outcome?.elapsedMs).toBeGreaterThan(5_000);
    expect(run.outcome?.elapsedMs).toBeLessThan(6_100);
  });

  it('ersetzt ein ungültiges Ergebnis durch die HUD-Wertung', async () => {
    const run = await runMinigameHeadless(probe({ finishAfterMs: 500, badResult: true }).module);
    expect(run.outcome?.forced).toBe(true);
    expect(run.outcome?.elapsedMs).toBeLessThan(600);
  });

  it('rechnet in advance feste Schritte, begrenzt Rückstand und steht bei Pause', async () => {
    const { module } = probe({});
    const { runner, headless } = await setup(module);
    await runner.prepare();
    runner.start();
    expect(runner.advance(0.05)).toBe(3);
    expect(runner.advance(5)).toBe(MAX_STEPS_PER_ADVANCE); // Hänger: kein Nachholen
    runner.pause();
    expect(runner.advance(1)).toBe(0);
    runner.resume();
    expect(runner.advance(1 / 60 + 1e-6)).toBe(1);
    runner.dispose();
    headless.dispose();
  });

  it('holt bei Software-Rendering mehr Schritte je advance nach (maxStepsPerAdvance)', async () => {
    const { module } = probe({});
    const { runner, headless } = await setup(module, 2, { maxStepsPerAdvance: 60 });
    await runner.prepare();
    runner.start();
    // Ein Bild nach 0,5 s: 30 Schritte, die Spielzeit bleibt bei der echten Zeit.
    expect(runner.advance(0.5)).toBe(30);
    expect(runner.advance(5)).toBe(60);
    runner.dispose();
    headless.dispose();
  });

  it('rechnet Havok-Physik im festen Takt (nicht beim Rendern) und räumt Körper weg', async () => {
    const probeGame = probe({ info: { physics: true }, finishAfterMs: 2_000, physicsBall: true });
    const { runner, headless } = await setup(probeGame.module);
    await runner.prepare();
    runner.start();
    const ball = probeGame.ball();
    if (!ball) throw new Error('Ball fehlt');
    const camera = new FreeCamera('testkamera', new Vector3(0, 2, -10), headless.scene);
    for (let frame = 0; frame < 30; frame++) headless.scene.render(); // darf die Physik nicht bewegen
    expect(ball.position.y).toBeCloseTo(5, 5);
    camera.dispose();
    runner.step(120);
    // Invariante statt Bitgenauigkeit: liegt auf dem Boden, fällt nicht durch.
    expect(ball.position.y).toBeGreaterThan(0.4);
    expect(ball.position.y).toBeLessThan(0.6);
    runner.dispose();
    expect(sceneResidue(headless.scene)).toEqual(EMPTY_RESIDUE);
    headless.dispose();
  });
});
