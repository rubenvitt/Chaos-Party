/**
 * Headless-Bühne mit verteiltem Aufbau (CHAOS-141): Der Aufbau läuft über mehrere Bilder,
 * `bodies()` zeigt erst die fertige Szene, und eine während des Aufbaus entsorgte Bühne baut
 * nicht weiter und meldet keinen Fehler.
 */
import { getMinigameModule, ROTATION } from '@chaos-party/minigames';
import { loadHavokForNode } from '@chaos-party/minigame-sdk/testing';
import type { MinigamePlayer, PrepareThrottle } from '@chaos-party/minigame-sdk/babylon';
import { describe, expect, it } from 'vitest';
import {
  createHeadlessStage,
  FRAME_RESERVE_MS,
  PREPARE_BUDGET_MAX_MS,
  PREPARE_BUDGET_MS,
  prepareBudgetMs,
} from '../src/stage.ts';

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

describe('Headless-Bühne: Darstellung für Swift (CHAOS-144)', () => {
  const FOUR: MinigamePlayer[] = [
    ...PLAYERS,
    { slot: 3, name: 'Cem', color: '#009E73', symbol: '■', character: 'robot' },
    { slot: 4, name: 'Dora', color: '#CC79A7', symbol: '★', character: 'cactus' },
  ];

  it.each(ROTATION)('%s liefert Kamera, Kulisse, Figuren, Rollen und Geometrie', async (id) => {
    const module = getMinigameModule(id);
    if (!module) throw new Error(id);
    const logs: string[] = [];
    const stage = createHeadlessStage({
      module,
      players: FOUR,
      seed: 7,
      timeLimitMs: 20_000,
      havok: module.info.physics ? await loadHavokForNode() : null,
      onResult: () => undefined,
      log: (line) => logs.push(line),
    });
    for (let index = 0; index < 50 && !stage.ready; index++) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    expect(stage.ready).toBe(true);
    stage.start();
    for (let index = 0; index < 120; index++) stage.advance(1 / 60);

    const camera = stage.camera();
    expect(camera?.fov).toBeGreaterThan(0);
    expect(stage.backdrop?.halfX).toBeGreaterThan(0);

    const figures = stage.figures();
    expect(figures.map((figure) => figure.slot)).toEqual([1, 2, 3, 4]);
    expect(figures.map((figure) => figure.character)).toEqual([
      'raccoon',
      'sock',
      'robot',
      'cactus',
    ]);

    const bodies = stage.bodies();
    expect(bodies.some((body) => body.role === 'figur')).toBe(false);
    expect(bodies.some((body) => body.role !== undefined)).toBe(true);
    const geometry = stage.takeGeometry(Number.POSITIVE_INFINITY);
    const ids = new Set(geometry.map((entry) => entry.id));
    expect(ids.size).toBe(stage.geometryTotal);
    // Jeder Körper mit Geometrie verweist auf einen ausgelieferten Eintrag.
    for (const body of bodies) if (body.mesh) expect(ids.has(body.mesh), body.id).toBe(true);
    expect(bodies.filter((body) => body.mesh).length).toBeGreaterThan(bodies.length * 0.9);
    // Ein zweiter Abruf liefert nichts doppelt.
    expect(stage.takeGeometry(Number.POSITIVE_INFINITY)).toEqual([]);

    stage.celebrate([
      { slot: 1, place: 1, score: 3 },
      { slot: 2, place: 2, score: 1 },
      { slot: 3, place: 3, score: 0 },
      { slot: 4, place: 3, score: 0 },
    ]);
    const after = stage.figures();
    expect(after.map((figure) => figure.anim)).toEqual(['cheer', 'sad', 'sad', 'sad']);
    expect(stage.effects(0).some((effect) => effect.kind === 'confetti')).toBe(true);
    stage.dispose();
    expect(logs).toEqual([]);
  });
});

describe('Aufbau-Budget je Tick (CHAOS-205)', () => {
  it('bleibt bei 60 Hz und schneller bei PREPARE_BUDGET_MS', () => {
    expect(prepareBudgetMs(0)).toBe(PREPARE_BUDGET_MS);
    expect(prepareBudgetMs(1000 / 120)).toBe(PREPARE_BUDGET_MS);
    expect(prepareBudgetMs(1000 / 60)).toBe(PREPARE_BUDGET_MS);
    expect(prepareBudgetMs(Number.NaN)).toBe(PREPARE_BUDGET_MS);
  });

  it('wächst mit der Tick-Dauer (gleicher Anteil wie bei 60 Hz), gedeckelt', () => {
    expect(prepareBudgetMs(1000 / 30)).toBeCloseTo(2 * PREPARE_BUDGET_MS);
    expect(prepareBudgetMs(100)).toBeCloseTo(12);
    expect(prepareBudgetMs(1250)).toBe(PREPARE_BUDGET_MAX_MS);
  });

  it('gibt bei knapper Bühne die halbe Tick-Dauer, gedeckelt', () => {
    expect(prepareBudgetMs(1000 / 30, true)).toBeCloseTo(1000 / 60);
    expect(prepareBudgetMs(100, true)).toBe(PREPARE_BUDGET_MAX_MS);
  });

  it('lässt bei knapper Bühne FRAME_RESERVE_MS des Bildes frei (CHAOS-209)', () => {
    expect(prepareBudgetMs(1000 / 60, true)).toBeCloseTo(1000 / 60 - FRAME_RESERVE_MS);
    expect(prepareBudgetMs(0, true)).toBeCloseTo(1000 / 60 - FRAME_RESERVE_MS);
    expect(prepareBudgetMs(1000 / 60, true)).toBeGreaterThan(prepareBudgetMs(1000 / 60));
    expect(prepareBudgetMs(1000 / 40, true)).toBeCloseTo(1000 / 80);
  });
});
