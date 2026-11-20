import { describe, expect, it } from 'vitest';
import type { Bounds } from './geometry.ts';
import {
  aheadOf,
  carryAlong,
  clampHorizontalSpeed,
  clampStick,
  createWalker,
  grabNearest,
  isDashing,
  isMoving,
  isStunned,
  letGo,
  resolveBumps,
  setWalkerStick,
  steeringDeltaV,
  stepWalker,
  stunWalker,
  tryDash,
  walkerFigureState,
  type Carryable,
} from './movement.ts';

const RULES = { speed: 5, dashFactor: 2, dashS: 0.2, dashCooldownS: 1 };
const ARENA: Bounds = { kind: 'circle', radius: 6 };
const STEP = 1 / 60;

function walker(slot: 1 | 2 | 3 | 4, x: number, z: number) {
  return { slot, ...createWalker(x, z) };
}

describe('Laufen und Hechten', () => {
  it('läuft mit dem Stick, dreht sich mit und bleibt in der Arena', () => {
    const w = createWalker(0, 0);
    setWalkerStick(w, 3, 4);
    expect(Math.hypot(w.stickX, w.stickY)).toBeCloseTo(1);
    expect(isMoving(w)).toBe(true);
    for (let i = 0; i < 60; i++) stepWalker(w, STEP, i * STEP, RULES, ARENA);
    expect(Math.hypot(w.x, w.z)).toBeCloseTo(5, 5);
    expect(w.heading).toBeCloseTo(Math.atan2(0.6, 0.8));
    for (let i = 0; i < 120; i++) stepWalker(w, STEP, 1, RULES, ARENA);
    expect(Math.hypot(w.x, w.z)).toBeCloseTo(6, 5);
  });

  it('Hechten: schneller geradeaus, dann Abklingzeit', () => {
    const w = createWalker(0, 0);
    setWalkerStick(w, 1, 0);
    expect(tryDash(w, 0, RULES)).toBe(true);
    expect(w.heading).toBeCloseTo(Math.PI / 2);
    setWalkerStick(w, 0, 0);
    expect(isDashing(w, 0.1)).toBe(true);
    stepWalker(w, 0.1, 0.1, RULES, ARENA);
    expect(w.x).toBeCloseTo(1);
    expect(tryDash(w, 0.5, RULES)).toBe(false);
    expect(tryDash(w, 1, RULES)).toBe(true);
    expect(w.dashes).toBe(2);
  });

  it('benommen: keine Bewegung, kein Hechten, laufendes Hechten endet', () => {
    const w = createWalker(1, 1);
    tryDash(w, 0, RULES);
    stunWalker(w, 0, 1);
    expect(isStunned(w, 0.5)).toBe(true);
    expect(isDashing(w, 0.1)).toBe(false);
    setWalkerStick(w, 1, 0);
    stepWalker(w, 0.5, 0.5, RULES, ARENA);
    expect(w.x).toBe(1);
    expect(walkerFigureState(w, 0.5)).toEqual({ stunned: true, dashing: false, moving: true });
    expect(tryDash(w, 2, RULES)).toBe(true);
    expect(walkerFigureState(w, 2.1)).toEqual({ stunned: false, dashing: true, moving: true });
    expect(tryDash(createWalker(0, 0), 0, RULES)).toBe(true);
  });
});

describe('Rempeln', () => {
  it('Hechtender stößt Stehenden weg und betäubt ihn', () => {
    const a = walker(1, 0, 0);
    const b = walker(2, 0, 0.6);
    a.heading = 0;
    tryDash(a, 0, RULES);
    const events = resolveBumps(
      [a, b],
      0.05,
      { bodyRadius: 0.5, knockback: 1.5, stunS: 0.8 },
      ARENA,
    );
    expect(events).toEqual([{ attacker: 1, victim: 2 }]);
    expect(b.z).toBeCloseTo(2.1);
    expect(isStunned(b, 0.5)).toBe(true);
    expect(isDashing(a, 0.06)).toBe(false);
  });

  it('ohne Hechten schieben sich Figuren nur auseinander (auch genau übereinander)', () => {
    const a = walker(1, 0, 0);
    const b = walker(2, 0.4, 0);
    const c = walker(3, 3, 3);
    const d = walker(4, 3, 3);
    const events = resolveBumps(
      [a, b, c, d],
      0,
      { bodyRadius: 0.5, knockback: 1, stunS: 0 },
      ARENA,
    );
    expect(events).toEqual([]);
    expect(b.x - a.x).toBeCloseTo(1);
    expect(Math.hypot(c.x - d.x, c.z - d.z)).toBeCloseTo(1);
  });

  it('Hechtender von rechts trifft den Linken', () => {
    const a = walker(1, 0, 0);
    const b = walker(2, 0.5, 0);
    tryDash(b, 0, RULES);
    const events = resolveBumps([a, b], 0, { bodyRadius: 0.5, knockback: 1, stunS: 0 }, ARENA);
    expect(events).toEqual([{ attacker: 2, victim: 1 }]);
    expect(a.x).toBeCloseTo(-1);
    expect(isStunned(a, 0)).toBe(false);
  });
});

describe('Greifen, Tragen, Werfen', () => {
  it('greift das nächste freie Ding, trägt es vor sich und wirft es', () => {
    const w = walker(1, 0, 0);
    const items: Carryable[] = [
      { x: 1, z: 0, carrier: null },
      { x: 0.5, z: 0, carrier: null },
      { x: 0.2, z: 0, carrier: 2 },
    ];
    const grabbed = grabNearest(w, items, 1.2, 0);
    expect(grabbed).toBe(items[1]);
    expect(grabNearest(w, items, 1.2, 0)).toBeNull();
    w.heading = Math.PI / 2;
    carryAlong(items, [w], 0.7);
    expect(items[1]?.x).toBeCloseTo(0.7);
    expect(items[2]?.carrier).toBeNull();
    if (!grabbed) throw new Error('nichts gegriffen');
    const target = letGo(grabbed, w, 10, ARENA);
    expect(target.x).toBeCloseTo(6);
    expect(items[1]?.carrier).toBeNull();
    expect(aheadOf(w, 2).x).toBeCloseTo(2);
  });

  it('benommen greift man nichts', () => {
    const w = walker(1, 0, 0);
    stunWalker(w, 0, 1);
    expect(grabNearest(w, [{ x: 0, z: 0, carrier: null }], 1, 0.5)).toBeNull();
  });
});

describe('Physik-Lenkung', () => {
  const steering = { maxSpeed: 5.5, responsiveness: 9, maxAcceleration: 30 };

  it('zieht zur Stick-Geschwindigkeit, begrenzt durch die Beschleunigung', () => {
    const small = steeringDeltaV({ x: 5, z: 0 }, { x: 1, y: 0 }, STEP, steering);
    expect(small.x).toBeCloseTo((5.5 - 5) * 9 * STEP);
    const big = steeringDeltaV({ x: -5, z: 0 }, { x: 1, y: 0 }, STEP, steering);
    expect(big.x).toBeCloseTo(30 * STEP);
    expect(steeringDeltaV({ x: 0, z: 0 }, { x: 0, y: 0 }, STEP, steering)).toEqual({ x: 0, z: 0 });
  });

  it('Stick und Höchsttempo werden begrenzt', () => {
    expect(clampStick(Number.NaN, 2)).toEqual({ x: 0, y: 1 });
    expect(clampStick(0.3, 0.4)).toEqual({ x: 0.3, y: 0.4 });
    const limited = clampHorizontalSpeed({ x: 6, y: -3, z: 8 }, 5);
    expect(limited).toEqual({ x: 3, y: -3, z: 4 });
    expect(clampHorizontalSpeed({ x: 1, y: 2, z: 0 }, 5)).toEqual({ x: 1, y: 2, z: 0 });
  });
});
