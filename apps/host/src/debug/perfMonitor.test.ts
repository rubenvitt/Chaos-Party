import { afterEach, describe, expect, it } from 'vitest';
import { attachPerf, installPerfMonitor } from './perf.ts';
import { createPerfMonitor } from './perfMonitor.ts';
import type { FrameSample, PerfSource, ResourceSample } from './perfTypes.ts';
import { scenePerfLine, scenePerfReport } from './summary.ts';

/** Nachgebaute Szene: `render(sample)` meldet ein Bild an alle Zuhörer. */
function fakeSource(
  resources: ResourceSample = { meshes: 10, materials: 4, textures: 2, textureBytes: 2_097_152 },
) {
  const listeners = new Set<(sample: FrameSample) => void>();
  const source: PerfSource & {
    render(sample?: Partial<FrameSample>): void;
    listeners: number;
    resources: ResourceSample;
  } = {
    resources,
    onFrameRendered(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getResourceStats() {
      return source.resources;
    },
    render(sample = {}) {
      for (const listener of listeners) {
        listener({ drawCalls: 40, activeMeshes: 20, renderMs: 3, ...sample });
      }
    },
    get listeners() {
      return listeners.size;
    },
  };
  return source;
}

function clock(start = 0) {
  const state = { now: start };
  return { now: () => state.now, set: (at: number) => (state.now = at) };
}

describe('createPerfMonitor', () => {
  it('misst je Szene Bildabstand, Draw Calls, aktive Meshes und Render-Zeit', () => {
    const time = clock();
    const monitor = createPerfMonitor({ now: time.now });
    const arena = fakeSource();
    monitor.attach(() => 'arena', arena);
    for (const [at, drawCalls] of [
      [0, 40],
      [16, 42],
      [32, 44],
      [48, 46],
    ] as const) {
      time.set(at);
      arena.render({ drawCalls });
    }
    const [entry] = monitor.report();
    expect(entry?.scene).toBe('arena');
    expect(entry?.frames).toBe(4);
    expect(entry?.frameTime).toMatchObject({ count: 3, median: 16 });
    expect(entry?.fps).toBeCloseTo(62.5);
    expect(entry?.drawCalls).toMatchObject({ median: 43, max: 46 });
    expect(entry?.activeMeshes).toMatchObject({ median: 20 });
    expect(entry?.renderMs).toMatchObject({ median: 3 });
    // Gesamtmessung wird mitgefüttert.
    expect(monitor.meter.snapshot().frames).toBe(4);
  });

  it('der Szenenname wird je Bild gelesen (Brett → Finale)', () => {
    const time = clock();
    const monitor = createPerfMonitor({ now: time.now });
    const board = fakeSource();
    let name = 'brett';
    monitor.attach(() => name, board);
    board.render();
    name = 'finale';
    time.set(16);
    board.render();
    expect(monitor.report().map((e) => [e.scene, e.frames])).toEqual([
      ['brett', 1],
      ['finale', 1],
    ]);
  });

  it('Eingang→Frame getrennt nach Controller-Eingabe und Brett-Stand, im nächsten Bild', () => {
    const time = clock();
    const monitor = createPerfMonitor({ now: time.now });
    const minigame = fakeSource();
    monitor.attach(() => 'minispiel:x', minigame);
    monitor.inputReceived(100, 'input');
    monitor.inputReceived(104, 'input');
    monitor.inputReceived(102, 'board');
    time.set(110);
    minigame.render();
    // Schon gemessen: das nächste Bild zählt sie nicht noch einmal.
    time.set(126);
    minigame.render();
    const [entry] = monitor.report();
    expect(entry?.inputToFrame).toMatchObject({ count: 2, min: 6, max: 10 });
    expect(entry?.boardToFrame).toMatchObject({ count: 1, median: 8 });
    // Gesamtmessung zählt wie bisher nur Controller-Eingaben.
    expect(monitor.meter.snapshot().inputToFrame?.count).toBe(2);
  });

  it('Szenenwechsel verwirft wartende Eingänge (Ladezeit ist keine Latenz)', () => {
    const time = clock();
    const monitor = createPerfMonitor({ now: time.now });
    const board = fakeSource();
    const stopBoard = monitor.attach(() => 'brett', board);
    monitor.inputReceived(0, 'board');
    stopBoard();
    const minigame = fakeSource();
    monitor.attach(() => 'minispiel:x', minigame);
    monitor.inputReceived(1500, 'input');
    time.set(2000);
    minigame.render();
    const byScene = Object.fromEntries(monitor.report().map((e) => [e.scene, e]));
    expect(byScene['minispiel:x']?.boardToFrame).toBeNull();
    expect(byScene['minispiel:x']?.inputToFrame).toMatchObject({ count: 1, median: 500 });
  });

  it('Umgebung: Höchstwerte von Kontexten, Schleifen, Heap und Bestand, Verweildauer', () => {
    const time = clock();
    const monitor = createPerfMonitor({ now: time.now });
    const board = fakeSource();
    const podium = fakeSource({ meshes: 30, materials: 9, textures: 5, textureBytes: 1000 });
    const stopBoard = monitor.attach(() => 'brett', board);
    monitor.sampleEnvironment({ contexts: 1, renderLoops: 1, heapBytes: 50 });
    time.set(500);
    monitor.attach(() => 'podest', podium);
    monitor.sampleEnvironment({ contexts: 2, renderLoops: 2, heapBytes: 80 });
    board.resources = { meshes: 12, materials: 4, textures: 2, textureBytes: 10 };
    stopBoard();
    time.set(1000);
    monitor.sampleEnvironment({ contexts: 1, renderLoops: 1, heapBytes: null });
    const byScene = Object.fromEntries(monitor.report().map((e) => [e.scene, e]));
    expect(byScene.brett).toMatchObject({
      durationMs: 500,
      contextsMax: 2,
      renderLoopsMax: 2,
      heapMaxBytes: 80,
      resources: { meshes: 10, textureBytes: 2_097_152 },
    });
    expect(byScene.podest).toMatchObject({
      durationMs: 1000,
      contextsMax: 2,
      heapMaxBytes: 80,
      resources: { meshes: 30, materials: 9 },
    });
    expect(monitor.activeScenes()).toEqual(['podest']);
  });

  it('Lücken über einer Sekunde zählen als Pause; Abmelden beendet die Beobachtung', () => {
    const time = clock();
    const monitor = createPerfMonitor({ now: time.now });
    const arena = fakeSource();
    const stop = monitor.attach(() => 'arena', arena);
    arena.render();
    time.set(5000);
    arena.render();
    stop();
    expect(arena.listeners).toBe(0);
    arena.render();
    expect(monitor.report()[0]).toMatchObject({ frames: 2, pauses: 1, frameTime: null });
  });

  it('reset beginnt eine neue Messreihe, angemeldete Szenen bleiben', () => {
    const monitor = createPerfMonitor({ now: () => 0 });
    const arena = fakeSource();
    monitor.attach(() => 'lobby', arena);
    arena.render();
    monitor.reset();
    expect(monitor.report()).toMatchObject([{ scene: 'lobby', frames: 0 }]);
  });
});

describe('attachPerf / installPerfMonitor', () => {
  let uninstall: (() => void) | null = null;
  afterEach(() => {
    uninstall?.();
    uninstall = null;
  });

  it('ohne Monitor keine Beobachter; ein später angemeldeter Monitor übernimmt die Szene', () => {
    const source = fakeSource();
    const detach = attachPerf('brett', source);
    expect(source.listeners).toBe(0);
    const monitor = createPerfMonitor({ now: () => 0 });
    uninstall = installPerfMonitor(monitor);
    expect(source.listeners).toBe(1);
    source.render();
    expect(monitor.report()).toMatchObject([{ scene: 'brett', frames: 1 }]);
    detach();
    expect(source.listeners).toBe(0);
  });

  it('Abmelden des Monitors löst alle Beobachter', () => {
    const source = fakeSource();
    uninstall = installPerfMonitor(createPerfMonitor());
    const detach = attachPerf(() => 'arena', source);
    expect(source.listeners).toBe(1);
    uninstall();
    uninstall = null;
    expect(source.listeners).toBe(0);
    detach();
  });
});

describe('scenePerfLine / scenePerfReport', () => {
  it('eine Zeile je Szene mit allen Kennzahlen, Kopf mit Grafik und Gerät', () => {
    const time = clock();
    const monitor = createPerfMonitor({ now: time.now });
    const board = fakeSource();
    monitor.attach(() => 'brett', board);
    board.render({ drawCalls: 85, activeMeshes: 110, renderMs: 4.25 });
    time.set(20);
    board.render({ drawCalls: 85, activeMeshes: 110, renderMs: 4.25 });
    monitor.sampleEnvironment({ contexts: 1, renderLoops: 1, heapBytes: 85 * 1024 * 1024 });
    const [entry] = monitor.report();
    if (!entry) throw new Error('kein Eintrag');
    const line = scenePerfLine(entry);
    expect(line).toContain('Szene brett');
    expect(line).toContain('fps 50.0');
    expect(line).toContain('Bildabstand ms Median 20 p95 20 max 20');
    expect(line).toContain('Render ms Median 4.3');
    expect(line).toContain('Draw Calls Median 85 max 85');
    expect(line).toContain('aktive Meshes Median 110 max 110');
    expect(line).toContain('Eingabe→Frame ms Median – p95 – n=0');
    expect(line).toContain('Kontexte max 1');
    expect(line).toContain('Heap max 85.0 MB');
    expect(line).toContain('Meshes 10 Material 4 Texturen 2 (~2.0 MB)');
    const report = scenePerfReport(monitor.report(), {
      device: 'Chrome 140 / Linux',
      renderer: { webgl: 2, renderer: 'SwiftShader', vendor: 'Google', width: 1280, height: 720 },
      testMode: false,
    });
    expect(report.split('\n')).toEqual([
      'Host – Messung je Szene | WebGL2 SwiftShader 1280×720 | Chrome 140 / Linux',
      line,
    ]);
    expect(scenePerfReport([], { device: 'x', renderer: null, testMode: true })).toContain(
      'noch keine Szene gemessen',
    );
  });
});
