import { describe, expect, it } from 'vitest';
import { MoveMessageSchema, PROTOCOL_VERSION } from '@chaos-party/protocol';
import { DEAD_ZONE, isZeroStick, knobOffset, quantize, stickFromOffset } from './joystick.ts';

describe('stickFromOffset', () => {
  it('liefert {0,0} in der Totzone und ohne Versatz', () => {
    expect(stickFromOffset(0, 0, 60)).toEqual({ x: 0, y: 0 });
    expect(stickFromOffset(60 * DEAD_ZONE * 0.9, 0, 60)).toEqual({ x: 0, y: 0 });
    expect(stickFromOffset(-3, 4, 60)).toEqual({ x: 0, y: 0 });
  });

  it('nach oben auf dem Bildschirm ist vorn (positives y)', () => {
    const up = stickFromOffset(0, -60, 60);
    expect(up).toEqual({ x: 0, y: 1 });
    const down = stickFromOffset(0, 60, 60);
    expect(down).toEqual({ x: 0, y: -1 });
  });

  it('nach rechts ist positives x', () => {
    expect(stickFromOffset(60, 0, 60)).toEqual({ x: 1, y: 0 });
    expect(stickFromOffset(-60, 0, 60)).toEqual({ x: -1, y: 0 });
  });

  it('begrenzt die Länge auf 1, auch weit außerhalb des Rings', () => {
    const far = stickFromOffset(500, -500, 60);
    expect(Math.hypot(far.x, far.y)).toBeLessThanOrEqual(1);
    expect(far.x).toBeCloseTo(0.7, 1);
    expect(far.y).toBeCloseTo(0.7, 1);
  });

  it('skaliert stetig hinter der Totzone (kein Sprung)', () => {
    const justOutside = stickFromOffset(60 * (DEAD_ZONE + 0.02), 0, 60);
    expect(justOutside.x).toBeGreaterThan(0);
    expect(justOutside.x).toBeLessThan(0.05);
    const half = stickFromOffset(30, 0, 60);
    expect(half.x).toBeGreaterThan(0.35);
    expect(half.x).toBeLessThan(0.5);
  });

  it('jeder Vektor über viele Winkel und Längen besteht das Protokollschema', () => {
    for (let angle = 0; angle < 360; angle += 7) {
      for (const distance of [5, 20, 47, 59.99, 60, 61, 300]) {
        const rad = (angle * Math.PI) / 180;
        const stick = stickFromOffset(Math.cos(rad) * distance, Math.sin(rad) * distance, 60);
        expect(Math.hypot(stick.x, stick.y)).toBeLessThanOrEqual(1);
        const parsed = MoveMessageSchema.safeParse({
          v: PROTOCOL_VERSION,
          type: 'move',
          slot: 1,
          seq: 1,
          ...stick,
        });
        expect(parsed.success).toBe(true);
      }
    }
  });

  it('weist kaputte Eingaben ab', () => {
    expect(stickFromOffset(Number.NaN, 0, 60)).toEqual({ x: 0, y: 0 });
    expect(stickFromOffset(10, Number.POSITIVE_INFINITY, 60)).toEqual({ x: 0, y: 0 });
    expect(stickFromOffset(10, 10, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('quantize', () => {
  it('schneidet zur Null hin ab und vermeidet -0', () => {
    expect(quantize(0.709)).toBe(0.7);
    expect(quantize(-0.709)).toBe(-0.7);
    expect(quantize(0.3)).toBe(0.3);
    expect(Object.is(quantize(-0.004), 0)).toBe(true);
    expect(quantize(1)).toBe(1);
  });
});

describe('knobOffset / isZeroStick', () => {
  it('hält den Knopf im Ring', () => {
    expect(knobOffset(10, 0, 60)).toEqual({ dx: 10, dy: 0 });
    const clamped = knobOffset(120, 0, 60);
    expect(clamped.dx).toBeCloseTo(60);
    expect(clamped.dy).toBeCloseTo(0);
  });

  it('erkennt die Ruhestellung', () => {
    expect(isZeroStick({ x: 0, y: 0 })).toBe(true);
    expect(isZeroStick({ x: 0.01, y: 0 })).toBe(false);
  });
});
