import { describe, expect, it } from 'vitest';
import { createLatencyMeter, MAX_PENDING_PROBES } from './latencyMeter.ts';
import { controllerSummaryLine } from './summary.ts';

describe('createLatencyMeter', () => {
  it('ohne Messung: keine Kennzahlen, null Eingaben', () => {
    const meter = createLatencyMeter();
    expect(meter.snapshot(0)).toEqual({
      rtt: null,
      lastRtt: null,
      pending: 0,
      lost: 0,
      inputsPerSecond: 0,
    });
  });

  it('RTT = Empfangszeit − eigene Sendezeit, nur für offene Proben', () => {
    const meter = createLatencyMeter();
    meter.probeSent(1000);
    meter.probeSent(2000);
    expect(meter.snapshot(2000).pending).toBe(2);
    expect(meter.ackReceived(1000, 1012)).toBe(12);
    expect(meter.ackReceived(2000, 2030)).toBe(30);
    // Doppelte Antwort und unbekanntes `t` zählen nicht.
    expect(meter.ackReceived(2000, 2040)).toBeNull();
    expect(meter.ackReceived(1234, 2050)).toBeNull();
    const snap = meter.snapshot(2100);
    expect(snap.rtt).toMatchObject({ count: 2, median: 21, p95: 30, min: 12, max: 30 });
    expect(snap.lastRtt).toBe(30);
    expect(snap.pending).toBe(0);
  });

  it('nutzt nur die letzten n Werte (Ringpuffer)', () => {
    const meter = createLatencyMeter(3);
    for (const [t, rtt] of [
      [0, 100],
      [1000, 10],
      [2000, 20],
      [3000, 30],
    ] as const) {
      meter.probeSent(t);
      meter.ackReceived(t, t + rtt);
    }
    expect(meter.snapshot(4000).rtt).toMatchObject({ count: 3, median: 20, max: 30 });
  });

  it('verwirft negative RTTs (Uhr sprang) ohne Messwert', () => {
    const meter = createLatencyMeter();
    meter.probeSent(500);
    expect(meter.ackReceived(500, 400)).toBeNull();
    expect(meter.snapshot(600).rtt).toBeNull();
  });

  it('zählt unbeantwortete Proben bei Verbindungsverlust und beim Überlauf', () => {
    const meter = createLatencyMeter();
    meter.probeSent(1);
    meter.probeSent(2);
    meter.connectionLost();
    expect(meter.snapshot(3)).toMatchObject({ pending: 0, lost: 2 });
    // Antwort einer alten Verbindung zählt nicht mehr.
    expect(meter.ackReceived(1, 10)).toBeNull();

    for (let t = 10; t < 10 + MAX_PENDING_PROBES + 3; t++) meter.probeSent(t);
    expect(meter.snapshot(100)).toMatchObject({ pending: MAX_PENDING_PROBES, lost: 5 });
  });

  it('zählt gesendete Eingaben im letzten Sekundenfenster', () => {
    const meter = createLatencyMeter();
    for (let t = 0; t <= 2000; t += 50) meter.inputSent(t);
    // Fenster (1000, 2000]: 1050 … 2000 = 20 Eingaben.
    expect(meter.snapshot(2000).inputsPerSecond).toBe(20);
    expect(meter.snapshot(5000).inputsPerSecond).toBe(0);
  });
});

describe('controllerSummaryLine', () => {
  it('fasst die Messwerte in einer Zeile zusammen', () => {
    const meter = createLatencyMeter();
    for (const [t, rtt] of [
      [0, 8],
      [1000, 12],
      [2000, 40],
    ] as const) {
      meter.probeSent(t);
      meter.ackReceived(t, t + rtt);
    }
    meter.inputSent(2500);
    expect(
      controllerSummaryLine(meter.snapshot(2600), {
        seats: 1,
        device: 'Safari 18.2 / iOS 18.2',
        heartbeatMs: 1000,
      }),
    ).toBe(
      'Controller iPhone | RTT ms Median 12 p95 40 max 40 letzte 40 n=3 | ohne Antwort 0 | Eingaben/s 1 | Herzschlag 1000 ms | Safari 18.2 / iOS 18.2',
    );
  });

  it('zeigt „–“ ohne Messung und den iPad-Modus', () => {
    const line = controllerSummaryLine(createLatencyMeter().snapshot(0), {
      seats: 2,
      device: 'X',
      heartbeatMs: 1000,
    });
    expect(line).toContain('Controller iPad(2)');
    expect(line).toContain('RTT ms Median – p95 – max – letzte – n=0');
  });
});
