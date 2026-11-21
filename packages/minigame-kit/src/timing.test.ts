import { describe, expect, it } from 'vitest';
import { Cooldown, Countdown, MatchClock } from './clock.ts';
import { Spawner, warningProgress } from './spawner.ts';

const STEP = 1 / 60;

describe('MatchClock', () => {
  it('meldet die Endphase genau einmal und endet nach 30 s fester Schritte', () => {
    const clock = new MatchClock(30_000, 8);
    let finaleAt = -1;
    let steps = 0;
    while (!clock.expired) {
      if (clock.tick(STEP).finaleStarted) {
        expect(finaleAt).toBe(-1);
        finaleAt = clock.time;
      }
      steps++;
    }
    expect(steps).toBe(1800);
    expect(finaleAt).toBeCloseTo(22, 5);
    expect(clock.finale).toBe(true);
    expect(clock.remainingMs).toBe(0);
    expect(clock.progress).toBe(1);
  });

  it('ohne Endphase gibt es kein Finale; Restzeit und Ankunft vor dem Ende', () => {
    const clock = new MatchClock(2000);
    clock.tick(0.5);
    expect(clock.finale).toBe(false);
    expect(clock.remainingMs).toBe(1500);
    expect(clock.fitsBeforeEnd(1.4)).toBe(true);
    expect(clock.fitsBeforeEnd(1.5)).toBe(false);
  });
});

describe('Countdown und Cooldown', () => {
  it('Countdown zeigt 3-2-1 und meldet den Ablauf einmal', () => {
    const countdown = new Countdown();
    expect(countdown.tick(STEP)).toBe(false);
    countdown.start(3);
    expect(countdown.display).toBe(3);
    let fired = 0;
    const shown = new Set<number>();
    for (let i = 0; i < 200; i++) {
      shown.add(countdown.display);
      if (countdown.tick(STEP)) fired++;
    }
    expect(fired).toBe(1);
    expect([...shown].sort()).toEqual([0, 1, 2, 3]);
    expect(countdown.active).toBe(false);
    expect(countdown.progress).toBe(1);
  });

  it('Countdown lässt sich stoppen', () => {
    const countdown = new Countdown();
    countdown.start(1);
    countdown.stop();
    expect(countdown.tick(2)).toBe(false);
  });

  it('Cooldown löst erst nach Ablauf wieder aus', () => {
    const cooldown = new Cooldown(1.6);
    expect(cooldown.trigger(0)).toBe(true);
    expect(cooldown.trigger(1)).toBe(false);
    expect(cooldown.charge(0.8)).toBeCloseTo(0.5);
    expect(cooldown.trigger(1.6)).toBe(true);
  });
});

describe('Spawner mit Vorwarnung', () => {
  it('spawnt im Takt, in der Endphase schneller, nichts was nach dem Ende ankäme', () => {
    const spawner = new Spawner({ firstS: 0.8, everyS: 0.6, finaleEveryS: 0.3, warnS: 1.3 });
    const clock = new MatchClock(10_000, 4);
    const times: number[] = [];
    while (!clock.expired) {
      clock.tick(STEP);
      const count = spawner.poll(clock.time, clock.finale, clock.limitS);
      for (let i = 0; i < count; i++) times.push(clock.time);
    }
    expect(times[0]).toBeGreaterThanOrEqual(0.8);
    expect(times[0]).toBeLessThan(0.8 + STEP + 1e-9);
    expect(Math.max(...times)).toBeLessThan(10 - 1.3);
    const normal = times.filter((t) => t < 6);
    const finale = times.filter((t) => t >= 6);
    expect(normal.length).toBe(9);
    // In der Endphase doppelt so dicht (bis 8,7 s, danach käme nichts mehr rechtzeitig an).
    expect(finale.length).toBeGreaterThanOrEqual(8);
  });

  it('Vorwarnung läuft von 0 bis 1', () => {
    const spawner = new Spawner({ firstS: 0, everyS: 1, warnS: 2 });
    const timing = spawner.timing(5);
    expect(timing).toEqual({ warnAt: 5, arriveAt: 7 });
    expect(warningProgress(timing, 4)).toBe(0);
    expect(warningProgress(timing, 6)).toBe(0.5);
    expect(warningProgress(timing, 9)).toBe(1);
  });
});
