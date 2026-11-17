import { WACKELWALD } from '@chaos-party/game-core';
import { describe, expect, it } from 'vitest';
import {
  FALLBACK_STEP_MS,
  FLIGHT_EVENT_MS,
  GUST_FLIGHT_MS,
  hopAt,
  moveDuration,
  planEvent,
  SWAP_FLIGHT_MS,
} from './animation.ts';
import {
  approach,
  billboardsOverlap,
  boardBounds,
  boardCamera,
  cameraFocus,
  easeFlight,
  flightPoint,
  GUST_FLIGHT,
  HOP_HEIGHT,
  hopPoint,
  PAWN_SPREAD,
  pawnOffsets,
  projectToView,
  signpostClearOfArrow,
  signpostPosition,
  spreadPawns,
  SWAP_FLIGHT,
  type Point2,
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

describe('Flug bei Windstoß und Platztausch (CHAOS-52)', () => {
  const a = { x: 0, z: 0 };
  const b = { x: 4, z: 0 };

  it('plant feste Flugzeiten und eine kurze Ansage', () => {
    expect(moveDuration(2, 320, 'gust')).toBe(GUST_FLIGHT_MS);
    expect(moveDuration(1, 320, 'swap')).toBe(SWAP_FLIGHT_MS);
    expect(moveDuration(0, 320, 'gust')).toBe(0);
    expect(planEvent({ type: 'moved', slot: 1, path: ['s08'] }, 320, 'swap').durationMs).toBe(
      SWAP_FLIGHT_MS,
    );
    for (const event of ['gust', 'swap'] as const) {
      const plan = planEvent({ type: 'board-event', slot: 1, event }, 320);
      expect(plan.durationMs).toBe(FLIGHT_EVENT_MS);
      // Ansage plus Flug passen in die Server-Pause nach dem Feld (spaceEventMs = 1,5 s).
      expect(FLIGHT_EVENT_MS + Math.max(GUST_FLIGHT_MS, SWAP_FLIGHT_MS)).toBeLessThanOrEqual(1500);
    }
    expect(planEvent({ type: 'board-event', slot: 1, event: 'coin-rain' }, 320).durationMs).toBe(
      1000,
    );
  });

  it('startet und landet auf den Feldern, Scheitel in der Mitte des Wegs', () => {
    for (const shape of [GUST_FLIGHT, SWAP_FLIGHT]) {
      expect(flightPoint(a, b, 0, shape)).toEqual({ x: 0, y: 0, z: 0 });
      const end = flightPoint(a, b, 1, shape);
      expect(end.x).toBeCloseTo(4);
      expect(end.y).toBeCloseTo(0);
      expect(end.z).toBeCloseTo(0);
      expect(flightPoint(a, b, 2, shape)).toEqual(end);
    }
    // Windstoß: schnell weg (nach 30 % der Zeit schon mehr als die Hälfte des Wegs).
    expect(easeFlight(0.3, 'out')).toBeGreaterThan(0.5);
    expect(easeFlight(0.5, 'in-out')).toBeCloseTo(0.5);
    const top = flightPoint(a, b, 0.5, SWAP_FLIGHT);
    expect(top.y).toBeCloseTo(SWAP_FLIGHT.height);
    expect(top.y).toBeGreaterThan(HOP_HEIGHT);
  });

  it('lässt beim Tausch beide Figuren zu verschiedenen Seiten ausweichen', () => {
    const there = flightPoint(a, b, 0.5, SWAP_FLIGHT);
    const back = flightPoint(b, a, 0.5, SWAP_FLIGHT);
    expect(there.x).toBeCloseTo(back.x);
    expect(Math.abs(there.z - back.z)).toBeCloseTo(2 * SWAP_FLIGHT.bulge);
    // Gleiches Feld: kein Ausweichen, keine Division durch null.
    expect(flightPoint(a, a, 0.5, SWAP_FLIGHT)).toEqual({ x: 0, y: SWAP_FLIGHT.height, z: 0 });
  });
});

describe('Wegweiser und Zug-Pfeil (CHAOS-52)', () => {
  // Werte wie in der Szene: Kamera (0, 28, −17,5) mit Vorhalt −1,6, Pfeil 1,5 groß über dem Kopf.
  const OFFSET = { x: 0, y: 28, z: -17.5 };
  const AIM_Z = -1.6;
  const bounds = boardBounds(WACKELWALD);
  const cameraAt = (fork: Point2) => boardCamera(cameraFocus(bounds, fork), OFFSET, AIM_Z);
  const arrowAt = (fork: Point2) => ({
    center: { x: fork.x, y: 0.3 + 2.4 + 1.0, z: fork.z },
    halfWidth: 0.75,
    halfHeight: 0.75 + 0.15,
  });
  // Schildgröße grob wie `createLabel` (0,62 hohe Schrift ≈ 0,4 je Zeichen plus Rand).
  const sign = (text: string) => ({
    y: 1.75,
    halfWidth: (text.length * 0.4 + 0.8) / 2,
    halfHeight: 0.55,
  });

  it('projiziert perspektivisch: Blickpunkt in der Mitte, rechts ist +x, oben ist +y', () => {
    const camera = boardCamera({ x: 0, z: 0 }, OFFSET, AIM_Z);
    const center = projectToView(camera, camera.target);
    expect(center.x).toBeCloseTo(0);
    expect(center.y).toBeCloseTo(0);
    expect(center.depth).toBeCloseTo(Math.hypot(28, 17.5));
    expect(projectToView(camera, { x: 1, y: 0, z: AIM_Z }).x).toBeGreaterThan(0);
    expect(projectToView(camera, { x: 0, y: 1, z: AIM_Z }).y).toBeGreaterThan(0);
    // Weiter hinten (größeres z) liegt im Bild höher und näher an der Mitte.
    const near = projectToView(camera, { x: 4, y: 0, z: -4 });
    const far = projectToView(camera, { x: 4, y: 0, z: 8 });
    expect(far.y).toBeGreaterThan(near.y);
    expect(far.x).toBeLessThan(near.x);
  });

  it('erkennt Überdeckung im Bild', () => {
    const camera = boardCamera({ x: 0, z: 0 }, OFFSET, AIM_Z);
    const box = (x: number, y: number, z: number) => ({
      center: { x, y, z },
      halfWidth: 0.5,
      halfHeight: 0.5,
    });
    expect(billboardsOverlap(camera, box(0, 1, 0), box(0.5, 1, 0))).toBe(true);
    expect(billboardsOverlap(camera, box(0, 1, 0), box(3, 1, 0))).toBe(false);
    expect(billboardsOverlap(camera, box(0, 1, 0), box(1.05, 1, 0))).toBe(false);
    expect(billboardsOverlap(camera, box(0, 1, 0), box(1.05, 1, 0), 0.2)).toBe(true);
  });

  it('lässt freie Schilder stehen und schiebt verdeckende vom Pfeil weg', () => {
    const fork = { x: 0, z: 0 };
    const camera = cameraAt(fork);
    const box = sign('Klippenweg');
    expect(signpostClearOfArrow({ x: -7, z: 2 }, box, arrowAt(fork), camera)).toEqual({
      x: -7,
      z: 2,
    });
    const right = signpostClearOfArrow({ x: 1, z: 1.4 }, box, arrowAt(fork), camera);
    expect(right.z).toBe(1.4);
    expect(right.x).toBeGreaterThan(1);
    const left = signpostClearOfArrow({ x: -0.5, z: 1.4 }, box, arrowAt(fork), camera);
    expect(left.x).toBeLessThan(-0.5);
    for (const p of [right, left]) {
      expect(
        billboardsOverlap(camera, { ...box, center: { x: p.x, y: box.y, z: p.z } }, arrowAt(fork)),
      ).toBe(false);
    }
  });

  it('kein Wegweiser auf dem Wackelwald liegt unter dem Pfeil seiner Gabel', () => {
    const position = (id: string): Point2 | undefined =>
      WACKELWALD.spaces.find((s) => s.id === id)?.position;
    let checked = 0;
    let moved = 0;
    for (const fork of WACKELWALD.spaces) {
      if (fork.next.length < 2) continue;
      const camera = cameraAt(fork.position);
      for (const targetId of fork.next) {
        const target = WACKELWALD.spaces.find((s) => s.id === targetId);
        if (!target?.label) continue;
        const sibling = position(fork.next.find((id) => id !== targetId) ?? '') ?? null;
        const box = sign(target.label);
        const start = signpostPosition(target.position, sibling, 1.6);
        const p = signpostClearOfArrow(start, box, arrowAt(fork.position), camera);
        if (p.x !== start.x) moved++;
        const overlap = billboardsOverlap(
          camera,
          { ...box, center: { x: p.x, y: box.y, z: p.z } },
          arrowAt(fork.position),
        );
        expect(overlap, `${target.label} an ${fork.id}`).toBe(false);
        // Nicht weit weg vom Zielfeld geschoben.
        expect(Math.abs(p.x - start.x), target.label).toBeLessThan(3);
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(4);
    // Der Klippenweg an Gabel A (s07) lag unter dem Pfeil und rückt zur Seite.
    expect(moved).toBeGreaterThanOrEqual(1);
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
