import { describe, expect, it } from 'vitest';
import {
  approachAngle,
  clampStick,
  MOVEMENT,
  steeringDeltaV,
  wrapAngle,
  yawForDirection,
} from './movement.ts';

describe('clampStick', () => {
  it('lässt Vektoren mit Länge ≤ 1 unverändert', () => {
    expect(clampStick(0.3, -0.4)).toEqual({ x: 0.3, y: -0.4 });
  });

  it('kürzt zu lange Vektoren auf Länge 1', () => {
    const v = clampStick(3, 4);
    expect(v.x).toBeCloseTo(0.6);
    expect(v.y).toBeCloseTo(0.8);
  });

  it('ersetzt NaN und Unendlich durch 0', () => {
    expect(clampStick(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({ x: 0, y: 0 });
  });
});

describe('steeringDeltaV', () => {
  const dt = 1 / 60;

  it('beschleunigt aus dem Stand in Stick-Richtung (y = vorn = +z)', () => {
    const dv = steeringDeltaV({ x: 0, z: 0 }, { x: 0, y: 1 }, dt);
    expect(dv.x).toBeCloseTo(0);
    expect(dv.z).toBeGreaterThan(0);
  });

  it('begrenzt die Beschleunigung pro Schritt', () => {
    const dv = steeringDeltaV({ x: -20, z: 0 }, { x: 1, y: 0 }, dt);
    expect(Math.hypot(dv.x, dv.z)).toBeCloseTo(MOVEMENT.maxAcceleration * dt);
  });

  it('bremst ohne Stick-Eingabe', () => {
    const dv = steeringDeltaV({ x: 3, z: -2 }, { x: 0, y: 0 }, dt);
    expect(dv.x).toBeLessThan(0);
    expect(dv.z).toBeGreaterThan(0);
  });

  it('erreicht nach genügend Schritten die Höchstgeschwindigkeit, ohne sie zu überschreiten', () => {
    let v = { x: 0, z: 0 };
    for (let i = 0; i < 240; i++) {
      const dv = steeringDeltaV(v, { x: 1, y: 0 }, dt);
      v = { x: v.x + dv.x, z: v.z + dv.z };
      expect(v.x).toBeLessThanOrEqual(MOVEMENT.maxSpeed + 1e-9);
    }
    expect(v.x).toBeCloseTo(MOVEMENT.maxSpeed, 2);
  });
});

describe('Winkel', () => {
  it('normiert auf (−π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(0.5)).toBeCloseTo(0.5);
  });

  it('dreht auf kürzestem Weg und höchstens maxDelta', () => {
    expect(approachAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.05)).toBeCloseTo(Math.PI - 0.05);
    expect(approachAngle(0, 1, 2)).toBeCloseTo(1);
  });

  it('Gesicht schaut ohne Drehung zur Kamera (−z)', () => {
    expect(yawForDirection(0, -1)).toBeCloseTo(0);
    // Bewegung nach rechts (+x): lokales −z muss auf +x zeigen.
    const yaw = yawForDirection(1, 0);
    expect(-Math.sin(yaw)).toBeCloseTo(1);
    expect(-Math.cos(yaw)).toBeCloseTo(0);
  });
});
