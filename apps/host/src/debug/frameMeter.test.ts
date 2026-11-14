import { describe, expect, it } from 'vitest';
import { createFrameMeter, MAX_WAITING_INPUTS, PAUSE_MS } from './frameMeter.ts';
import { hostSummaryLine, rendererLine } from './summary.ts';

describe('createFrameMeter', () => {
  it('ohne Frames: keine Kennzahlen', () => {
    expect(createFrameMeter().snapshot()).toEqual({
      fps: null,
      frameTime: null,
      inputToFrame: null,
      frames: 0,
      inputs: 0,
      pauses: 0,
    });
  });

  it('misst den Bildabstand und leitet die Bildrate aus dem Mittelwert ab', () => {
    const meter = createFrameMeter();
    // 60 Hz mit einem Ruckler: Abstände 16, 16, 16, 52.
    for (const at of [1000, 1016, 1032, 1048, 1100]) meter.frameEnded(at);
    const snap = meter.snapshot();
    expect(snap.frames).toBe(5);
    expect(snap.frameTime).toMatchObject({ count: 4, median: 16, p95: 52, max: 52, mean: 25 });
    expect(snap.fps).toBe(40);
  });

  it('zählt lange Lücken als Pause, nicht als Bildabstand', () => {
    const meter = createFrameMeter();
    meter.frameEnded(0);
    meter.frameEnded(16);
    meter.frameEnded(16 + PAUSE_MS + 1);
    meter.frameEnded(32 + PAUSE_MS + 1);
    const snap = meter.snapshot();
    expect(snap.pauses).toBe(1);
    expect(snap.frameTime).toMatchObject({ count: 2, median: 16 });
  });

  it('Eingabe→Frame: vom Eingang bis zum Ende des nächsten Frames, je Eingabe', () => {
    const meter = createFrameMeter();
    meter.frameEnded(1000);
    meter.inputReceived(1004);
    meter.inputReceived(1010);
    meter.frameEnded(1016); // 12 und 6 ms
    meter.inputReceived(1020);
    meter.frameEnded(1032); // 12 ms
    meter.frameEnded(1048); // keine wartende Eingabe
    const snap = meter.snapshot();
    expect(snap.inputs).toBe(3);
    expect(snap.inputToFrame).toMatchObject({ count: 3, median: 12, p95: 12, min: 6 });
  });

  it('nutzt nur die letzten n Werte (Ringpuffer)', () => {
    const meter = createFrameMeter(2, 2);
    for (const at of [0, 100, 110, 120]) meter.frameEnded(at);
    expect(meter.snapshot().frameTime).toMatchObject({ count: 2, max: 10 });
  });

  it('begrenzt wartende Eingaben, wenn lange kein Frame kommt (Testmodus)', () => {
    const meter = createFrameMeter(10, 1000);
    for (let i = 0; i < MAX_WAITING_INPUTS + 10; i++) meter.inputReceived(i);
    meter.frameEnded(10_000);
    expect(meter.snapshot().inputs).toBe(MAX_WAITING_INPUTS);
  });
});

describe('hostSummaryLine', () => {
  it('fasst die Messwerte in einer Zeile zusammen', () => {
    const meter = createFrameMeter();
    meter.frameEnded(0);
    meter.inputReceived(5);
    meter.frameEnded(20);
    meter.frameEnded(40);
    expect(
      hostSummaryLine(meter.snapshot(), {
        device: 'Chrome 139 / Windows',
        renderer: {
          webgl: 2,
          renderer: 'ANGLE (NVIDIA)',
          vendor: 'Google Inc.',
          width: 1920,
          height: 1080,
        },
        testMode: false,
      }),
    ).toBe(
      'Host | fps 50.0 | Bildabstand ms Median 20 p95 20 max 20 | Eingabe→Frame ms Median 15 p95 15 n=1 | Pausen 0 | WebGL2 ANGLE (NVIDIA) 1920×1080 | Chrome 139 / Windows',
    );
  });

  it('zeigt „–“ ohne Messung, Testmodus und fehlende Szene', () => {
    const line = hostSummaryLine(createFrameMeter().snapshot(), {
      device: 'X',
      renderer: null,
      testMode: true,
    });
    expect(line).toContain('Host (Testmodus) | fps –');
    expect(line).toContain('Eingabe→Frame ms Median – p95 – n=0');
    expect(rendererLine(null)).toBe('WebGL ?');
  });
});
