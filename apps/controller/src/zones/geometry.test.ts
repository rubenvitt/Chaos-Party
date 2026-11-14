import { describe, expect, it } from 'vitest';
import type { Action, SlotNumber } from '@chaos-party/protocol';
import {
  arrangeZones,
  BADGE_STRIP,
  buildZones,
  controlAt,
  deltaToLocal,
  deltaToScreen,
  layoutZoneControls,
  rectCenter,
  rectContains,
  toLocal,
  toScreen,
  ZONE_GUTTER,
  ZONE_PADDING,
  zoneAt,
  type Rect,
  type Rotation,
  type Size,
} from './geometry.ts';

/** iPad Pro 11" in CSS-Pixeln. */
const LANDSCAPE: Size = { width: 1194, height: 834 };
const PORTRAIT: Size = { width: 834, height: 1194 };
/** Kleinstes aktuelles iPad (iPad mini) als Untergrenze. */
const MINI_LANDSCAPE: Size = { width: 1133, height: 744 };
const MINI_PORTRAIT: Size = { width: 744, height: 1133 };
/** Kleinster Viewport aus Playwrights Geräteliste (iPad gen 11 mit Safari-Leisten). */
const SMALL_PORTRAIT: Size = { width: 656, height: 944 };
const SMALL_LANDSCAPE: Size = { width: 944, height: 656 };

const PLAY: Action[] = ['move', 'button-a', 'button-b'];

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function inside(inner: Rect, outer: Rect): boolean {
  return (
    inner.x >= outer.x - 1e-9 &&
    inner.y >= outer.y - 1e-9 &&
    inner.x + inner.width <= outer.x + outer.width + 1e-9 &&
    inner.y + inner.height <= outer.y + outer.height + 1e-9
  );
}

describe('arrangeZones', () => {
  it('zwei Plätze im Querformat: links | rechts, beide aufrecht, Randstreifen dazwischen', () => {
    const [left, right] = arrangeZones([1, 2], LANDSCAPE);
    expect(left).toMatchObject({ slot: 1, index: 0, rotation: 0 });
    expect(right).toMatchObject({ slot: 2, index: 1, rotation: 0 });
    expect(left?.rect).toEqual({ x: 0, y: 0, width: 589, height: 834 });
    expect(right?.rect).toEqual({ x: 589 + ZONE_GUTTER, y: 0, width: 589, height: 834 });
  });

  it('zwei Plätze im Hochformat: unten aufrecht, oben um 180° gedreht', () => {
    const [bottom, top] = arrangeZones([1, 2], PORTRAIT);
    expect(bottom).toMatchObject({ slot: 1, rotation: 0 });
    expect(top).toMatchObject({ slot: 2, rotation: 180 });
    expect(top?.rect).toEqual({ x: 0, y: 0, width: 834, height: 589 });
    expect(bottom?.rect).toEqual({ x: 0, y: 589 + ZONE_GUTTER, width: 834, height: 589 });
  });

  it('vier Plätze: 2×2 im Uhrzeigersinn, obere Reihe gedreht', () => {
    const zones = arrangeZones([1, 2, 3, 4], LANDSCAPE);
    expect(zones.map((z) => [z.slot, z.rotation])).toEqual([
      [1, 0],
      [2, 0],
      [3, 180],
      [4, 180],
    ]);
    const centers = zones.map((z) => rectCenter(z.rect));
    // unten links, unten rechts, oben rechts, oben links
    expect(centers[0]?.x).toBeLessThan(LANDSCAPE.width / 2);
    expect(centers[0]?.y).toBeGreaterThan(LANDSCAPE.height / 2);
    expect(centers[1]?.x).toBeGreaterThan(LANDSCAPE.width / 2);
    expect(centers[1]?.y).toBeGreaterThan(LANDSCAPE.height / 2);
    expect(centers[2]?.x).toBeGreaterThan(LANDSCAPE.width / 2);
    expect(centers[2]?.y).toBeLessThan(LANDSCAPE.height / 2);
    expect(centers[3]?.x).toBeLessThan(LANDSCAPE.width / 2);
    expect(centers[3]?.y).toBeLessThan(LANDSCAPE.height / 2);
  });

  it('drei Plätze: 2×2 mit freiem Feld oben links', () => {
    const zones = arrangeZones([2, 3, 4], PORTRAIT);
    expect(zones.map((z) => z.slot)).toEqual([2, 3, 4]);
    expect(zoneAt(zones, { x: 10, y: 10 })).toBeNull();
  });

  it('Zonen überlappen nie und lassen den Randstreifen frei', () => {
    for (const viewport of [
      LANDSCAPE,
      PORTRAIT,
      MINI_LANDSCAPE,
      MINI_PORTRAIT,
      SMALL_LANDSCAPE,
      SMALL_PORTRAIT,
    ]) {
      for (const slots of [
        [1, 2],
        [1, 2, 3],
        [1, 2, 3, 4],
      ] as SlotNumber[][]) {
        const zones = arrangeZones(slots, viewport);
        expect(zones).toHaveLength(slots.length);
        for (const [i, a] of zones.entries()) {
          expect(inside(a.rect, { x: 0, y: 0, ...viewport })).toBe(true);
          for (const b of zones.slice(i + 1)) expect(overlaps(a.rect, b.rect)).toBe(false);
        }
      }
    }
    const [left] = arrangeZones([1, 2], LANDSCAPE);
    const gutterPoint = { x: (left?.rect.width ?? 0) + ZONE_GUTTER / 2, y: 400 };
    expect(zoneAt(arrangeZones([1, 2], LANDSCAPE), gutterPoint)).toBeNull();
  });

  it('Grenzfälle: keine Plätze, leere Fläche, mehr als vier Plätze', () => {
    expect(arrangeZones([], LANDSCAPE)).toEqual([]);
    expect(arrangeZones([1, 2], { width: 0, height: 0 })).toEqual([]);
    expect(arrangeZones([1, 2, 3, 4, 1] as SlotNumber[], LANDSCAPE)).toHaveLength(4);
    expect(arrangeZones([3], LANDSCAPE)).toEqual([
      { slot: 3, index: 0, rotation: 0, rect: { x: 0, y: 0, ...LANDSCAPE } },
    ]);
  });
});

describe('Koordinaten: Bildschirm ↔ Zone', () => {
  it('Versatz: 0° unverändert, 180° gespiegelt, 90°/270° vertauscht', () => {
    expect(deltaToLocal(0, 10, -5)).toEqual({ x: 10, y: -5 });
    expect(deltaToLocal(180, 10, -5)).toEqual({ x: -10, y: 5 });
    // Inhalt 90° im Uhrzeigersinn gedreht: lokales „rechts“ zeigt auf dem Bildschirm nach unten.
    expect(deltaToScreen(90, 1, 0)).toEqual({ x: 0, y: 1 });
    expect(deltaToLocal(90, 0, 1)).toEqual({ x: 1, y: 0 });
    expect(deltaToLocal(270, 0, 1)).toEqual({ x: -1, y: 0 });
  });

  it('toLocal und toScreen sind zueinander invers (alle Drehungen)', () => {
    const rect = { x: 100, y: 50, width: 300, height: 200 };
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const zone = { slot: 1 as const, index: 0, rect, rotation };
      for (const p of [
        { x: 100, y: 50 },
        { x: 250, y: 150 },
        { x: 399, y: 249 },
        { x: 123, y: 222 },
      ]) {
        const back = toScreen(zone, toLocal(zone, p));
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
    }
  });

  it('180°: die Bildschirmecke oben links ist lokal unten rechts', () => {
    const zone = {
      slot: 2 as const,
      index: 1,
      rect: { x: 0, y: 0, width: 834, height: 589 },
      rotation: 180 as const,
    };
    expect(toLocal(zone, { x: 0, y: 0 })).toEqual({ x: 834, y: 589 });
    expect(toLocal(zone, { x: 834, y: 589 })).toEqual({ x: 0, y: 0 });
  });
});

describe('layoutZoneControls', () => {
  it('Lobby: großer Bereit-Knopf; nach dem Senden und in „wait“ keine Bedienelemente', () => {
    const local = { width: 589, height: 834 };
    const [ready, ...rest] = layoutZoneControls(local, { layout: 'lobby', actions: ['ready'] });
    expect(rest).toEqual([]);
    expect(ready?.kind).toBe('ready');
    expect(ready?.rect.height).toBeGreaterThanOrEqual(96);
    expect(ready?.rect.width).toBeGreaterThanOrEqual(220);
    expect(
      layoutZoneControls(local, { layout: 'lobby', actions: ['ready'], readySent: true }),
    ).toEqual([]);
    expect(layoutZoneControls(local, { layout: 'lobby', actions: [] })).toEqual([]);
    expect(layoutZoneControls(local, { layout: 'wait', actions: PLAY })).toEqual([]);
  });

  it('breite Zone wie ein Gamepad: Joystick links, Knöpfe rechts', () => {
    const controls = layoutZoneControls(
      { width: 834, height: 589 },
      {
        layout: 'joystick-buttons',
        actions: PLAY,
      },
    );
    expect(controls.map((c) => c.kind)).toEqual(['button-a', 'button-b', 'stick']);
    const stick = controls.find((c) => c.kind === 'stick');
    const a = controls.find((c) => c.kind === 'button-a');
    if (!stick || !a) throw new Error('fehlt');
    expect(stick.rect.x + stick.rect.width).toBeLessThanOrEqual(a.rect.x);
  });

  it('hohe Zone wie das iPhone im Hochformat: Knöpfe oben, Joystick unten', () => {
    const controls = layoutZoneControls(
      { width: 589, height: 834 },
      {
        layout: 'joystick-buttons',
        actions: PLAY,
      },
    );
    const stick = controls.find((c) => c.kind === 'stick');
    const b = controls.find((c) => c.kind === 'button-b');
    if (!stick || !b) throw new Error('fehlt');
    expect(b.rect.y + b.rect.height).toBeLessThanOrEqual(stick.rect.y);
  });

  it('nur angebotene Aktionen erscheinen', () => {
    const local = { width: 589, height: 834 };
    expect(
      layoutZoneControls(local, { layout: 'joystick-buttons', actions: ['button-a'] }).map(
        (c) => c.kind,
      ),
    ).toEqual(['button-a']);
    expect(
      layoutZoneControls(local, { layout: 'joystick-buttons', actions: ['move'] }).map(
        (c) => c.kind,
      ),
    ).toEqual(['stick']);
  });

  it('für 2–4 Zonen auf iPad mini und iPad Pro: groß genug, mit Randabstand, ohne Überlappung', () => {
    for (const viewport of [
      LANDSCAPE,
      PORTRAIT,
      MINI_LANDSCAPE,
      MINI_PORTRAIT,
      SMALL_LANDSCAPE,
      SMALL_PORTRAIT,
    ]) {
      for (const slots of [
        [1, 2],
        [1, 2, 3],
        [1, 2, 3, 4],
      ] as SlotNumber[][]) {
        const zones = buildZones(slots, viewport, () => ({
          layout: 'joystick-buttons',
          actions: PLAY,
        }));
        for (const zone of zones) {
          const usable = {
            x: ZONE_PADDING,
            y: BADGE_STRIP,
            width: zone.local.width - 2 * ZONE_PADDING,
            height: zone.local.height - BADGE_STRIP - ZONE_PADDING,
          };
          const label = `${String(slots.length)} Zonen ${String(viewport.width)}×${String(viewport.height)}`;
          for (const [i, c] of zone.controls.entries()) {
            expect(inside(c.rect, usable), `${label}: ${c.kind} im Randabstand`).toBe(true);
            if (c.kind === 'button-a') expect(c.rect.width).toBeGreaterThanOrEqual(88);
            if (c.kind === 'button-b') expect(c.rect.width).toBeGreaterThanOrEqual(76);
            if (c.kind === 'stick') {
              expect(c.rect.width).toBeGreaterThanOrEqual(2 * zone.stickRadius);
              expect(c.rect.height).toBeGreaterThanOrEqual(2 * zone.stickRadius);
            }
            for (const other of zone.controls.slice(i + 1)) {
              expect(overlaps(c.hit, other.hit), `${label}: ${c.kind}/${other.kind}`).toBe(false);
            }
          }
        }
      }
    }
  });
});

describe('Trefferprüfung', () => {
  it('findet Zone und Bedienelement, Knöpfe vor dem Joystick-Feld', () => {
    const zones = buildZones([1, 2], LANDSCAPE, () => ({
      layout: 'joystick-buttons',
      actions: PLAY,
    }));
    const right = zones[1];
    if (!right) throw new Error('fehlt');
    const a = right.controls.find((c) => c.kind === 'button-a');
    if (!a) throw new Error('fehlt');
    const screen = toScreen(right, rectCenter(a.rect));
    expect(zoneAt(zones, screen)?.slot).toBe(2);
    expect(controlAt(right, toLocal(right, screen))?.kind).toBe('button-a');
    // Plakettenstreifen ist kein Bedienelement.
    expect(controlAt(right, { x: right.local.width / 2, y: 10 })).toBeNull();
    expect(rectContains(a.hit, rectCenter(a.rect))).toBe(true);
  });
});
