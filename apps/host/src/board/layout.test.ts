import { WACKELWALD } from '@chaos-party/game-core';
import { describe, expect, it } from 'vitest';
import { FALLBACK_STEP_MS, hopAt, moveDuration, planEvent } from './animation.ts';
import {
  approach,
  boardBounds,
  cameraFocus,
  HOP_HEIGHT,
  hopPoint,
  PAWN_SPREAD,
  pawnOffsets,
  signpostPosition,
  spreadPawns,
} from './layout.ts';

describe('Figur-Versatz', () => {
  it('stellt eine Figur in die Mitte und mehrere versetzt, ohne Überlappung der Mittelpunkte', () => {
    expect(pawnOffsets(0)).toEqual([]);
    expect(pawnOffsets(1)).toEqual([{ x: 0, z: 0 }]);
    for (const count of [2, 3, 4]) {
      const offsets = pawnOffsets(count);
      expect(offsets).toHaveLength(count);
      const keys = new Set(offsets.map((o) => `${o.x}|${o.z}`));
      expect(keys.size).toBe(count);
      for (const o of offsets) expect(Math.hypot(o.x, o.z)).toBeLessThanOrEqual(PAWN_SPREAD * 1.5);
    }
    expect(pawnOffsets(5)).toHaveLength(5);
  });

  it('versetzt nur Figuren, die sich ein Feld teilen, in Slot-Reihenfolge', () => {
    const result = spreadPawns([
      { slot: 3, spaceId: 's05' },
      { slot: 1, spaceId: 's05' },
      { slot: 2, spaceId: 's09' },
    ]);
    expect(result.get(2)).toEqual({ x: 0, z: 0 });
    expect(result.get(1)).toEqual(pawnOffsets(2)[0]);
    expect(result.get(3)).toEqual(pawnOffsets(2)[1]);
  });
});

describe('Hüpfen', () => {
  it('fliegt auf einer Parabel von Feld zu Feld', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 2, z: 1 };
    expect(hopPoint(a, b, 0)).toEqual({ x: 0, y: 0, z: 0 });
    expect(hopPoint(a, b, 1)).toEqual({ x: 2, y: 0, z: 1 });
    expect(hopPoint(a, b, 0.5)).toEqual({ x: 1, y: HOP_HEIGHT, z: 0.5 });
    expect(hopPoint(a, b, 2)).toEqual(hopPoint(a, b, 1));
  });

  it('bestimmt den aktuellen Sprung eines Bewegungsabschnitts', () => {
    const path = ['s08', 's09', 's10'];
    expect(hopAt('s07', path, 300, 0)).toEqual({ from: 's07', to: 's08', t: 0 });
    expect(hopAt('s07', path, 300, 400)).toMatchObject({ from: 's08', to: 's09' });
    expect(hopAt('s07', path, 300, 300 * 0.85 + 1)?.t).toBe(1);
    expect(hopAt('s07', path, 300, 99_999)).toEqual({ from: 's09', to: 's10', t: 1 });
    expect(hopAt('s07', [], 300, 0)).toBeNull();
    expect(hopAt('s07', path, 0, FALLBACK_STEP_MS + 1)?.from).toBe('s08');
  });

  it('plant Dauer je Feld und kurze Effekte', () => {
    expect(moveDuration(3, 320)).toBe(960);
    expect(moveDuration(2, 0)).toBe(2 * FALLBACK_STEP_MS);
    expect(planEvent({ type: 'moved', slot: 1, path: ['a', 'b'] }, 250)).toEqual({
      durationMs: 500,
      popup: null,
    });
    expect(planEvent({ type: 'turn-ended', slot: 1 }, 250).durationMs).toBe(0);
    expect(
      planEvent({ type: 'coins-changed', slot: 2, delta: -5, balance: 0, reason: 'space' }, 250)
        .popup,
    ).toEqual({
      kind: 'coins',
      slot: 2,
      spaceId: null,
      text: '−5',
      tone: 'bad',
    });
    expect(planEvent({ type: 'trophy-moved', from: 's24', to: 's12' }, 250).popup).toMatchObject({
      slot: null,
      spaceId: 's12',
    });
  });
});

describe('Kamera', () => {
  const bounds = boardBounds(WACKELWALD);

  it('kennt die Brettgrenzen', () => {
    expect(bounds.minX).toBeLessThan(-15);
    expect(bounds.maxX).toBeGreaterThan(15);
    expect(bounds.center.x).toBeCloseTo(0, 0);
    expect(boardBounds({ ...WACKELWALD, spaces: [] }).center).toEqual({ x: 0, z: 0 });
  });

  it('rückt nur ein Stück zum aktiven Spieler, seitlich mehr als in der Tiefe', () => {
    expect(cameraFocus(bounds, null)).toEqual(bounds.center);
    const focus = cameraFocus(bounds, { x: bounds.center.x + 10, z: bounds.center.z + 10 });
    expect(focus.x - bounds.center.x).toBeCloseTo(1.2);
    expect(focus.z - bounds.center.z).toBeCloseTo(0.4);
    expect(cameraFocus(bounds, { x: 10, z: 0 }, { x: 1, z: 1 }).x).toBe(10);
  });

  it('zieht bildratenunabhängig nach', () => {
    expect(approach(0, 10, 500, 500)).toBeCloseTo(5);
    expect(approach(0, 10, 250, 500)).toBeCloseTo(
      approach(approach(0, 10, 125, 500), 10, 125, 500),
    );
    expect(approach(3, 10, 0, 500)).toBe(3);
    expect(approach(3, 10, 16, 0)).toBe(10);
  });

  it('stellt Wegweiser vom Nachbarweg weg', () => {
    expect(signpostPosition({ x: 2, z: 0 }, { x: 0, z: 0 }, 1)).toEqual({ x: 3, z: 0 });
    expect(signpostPosition({ x: 2, z: 0 }, null, 1)).toEqual({ x: 2, z: 1 });
    expect(signpostPosition({ x: 2, z: 0 }, { x: 2, z: 0 }, 1)).toEqual({ x: 2, z: 1 });
  });
});
