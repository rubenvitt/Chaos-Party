/**
 * Headless-Bühne mit verteiltem Aufbau (CHAOS-141): Der Aufbau läuft über mehrere Bilder,
 * `bodies()` zeigt erst die fertige Szene, und eine während des Aufbaus entsorgte Bühne baut
 * nicht weiter und meldet keinen Fehler.
 */
import { getMinigameModule } from '@chaos-party/minigames';
import type { MinigamePlayer, PrepareThrottle } from '@chaos-party/minigame-sdk/babylon';
import { describe, expect, it } from 'vitest';
import { createHeadlessStage } from '../src/stage.ts';

const PLAYERS: MinigamePlayer[] = [
  { slot: 1, name: 'Anna', color: '#0072B2', symbol: '●', character: 'raccoon' },
  { slot: 2, name: 'Ben', color: '#E69F00', symbol: '▲', character: 'sock' },
];

/** Bilder von Hand; das Budget ist jedes Mal sofort verbraucht (ein Bauschritt je Bild). */
function manualFrames() {
  const waiting: (() => void)[] = [];
  let clock = 0;
  const pacing: PrepareThrottle = {
    budgetMs: 0,
    now: () => (clock += 1),
    nextFrame: () =>
      new Promise((resolve) => {
        waiting.push(resolve);
      }),
  };
  const frame = async () => {
    for (const resolve of waiting.splice(0)) resolve();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { pacing, frame };
}

function wackelturm() {
  const module = getMinigameModule('wackelturm');
  if (!module) throw new Error('wackelturm fehlt');
  return module;
}

describe('Headless-Bühne: verteilter Aufbau (CHAOS-141)', () => {
  it('baut über viele Bilder und zeigt Körper erst, wenn alles steht', async () => {
    const frames = manualFrames();
    const logs: string[] = [];
    const stage = createHeadlessStage({
      module: wackelturm(),
      players: PLAYERS,
      seed: 7,
      timeLimitMs: 5_000,
      havok: null,
      onResult: () => undefined,
      log: (line) => logs.push(line),
      pacing: frames.pacing,
    });
    stage.start();
    await frames.frame();
    expect(stage.ready).toBe(false);
    expect(stage.bodies()).toEqual([]);
    expect(stage.runner.state).toBe('preparing');

    let count = 1;
    while (!stage.ready && count < 2_000) {
      await frames.frame();
      count++;
    }
    expect(stage.ready).toBe(true);
    expect(count).toBeGreaterThan(20);
    // Start war angefordert: läuft, sobald der Aufbau fertig ist.
    expect(stage.runner.state).toBe('running');
    stage.advance(1 / 60);
    expect(stage.bodies().length).toBeGreaterThan(50);
    stage.dispose();
    expect(logs).toEqual([]);
  });

  it('entsorgt mitten im Aufbau ohne Fehler und baut nicht weiter', async () => {
    const frames = manualFrames();
    const logs: string[] = [];
    const stage = createHeadlessStage({
      module: wackelturm(),
      players: PLAYERS,
      seed: 7,
      timeLimitMs: 5_000,
      havok: null,
      onResult: () => undefined,
      log: (line) => logs.push(line),
      pacing: frames.pacing,
    });
    for (let index = 0; index < 5; index++) await frames.frame();
    stage.dispose();
    for (let index = 0; index < 5; index++) await frames.frame();
    expect(stage.ready).toBe(false);
    expect(stage.runner.state).toBe('disposed');
    expect(stage.bodies()).toEqual([]);
    expect(logs).toEqual([]);
  });
});
