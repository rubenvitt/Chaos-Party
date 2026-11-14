import { describe, expect, it } from 'vitest';
import { buildZones, rectCenter, toScreen, type Point, type ZoneGeometry } from './geometry.ts';
import { routeTouchEvent, type TouchPointLike } from './touchRouter.ts';
import { createZoneTracker } from './zoneTracker.ts';

const zones = buildZones([1, 2], { width: 1194, height: 834 }, () => ({
  layout: 'joystick-buttons',
  actions: ['move', 'button-a', 'button-b'],
}));

function center(slot: 1 | 2, kind: string): Point {
  const zone: ZoneGeometry | undefined = zones.find((z) => z.slot === slot);
  const control = zone?.controls.find((c) => c.kind === kind);
  if (!zone) throw new Error(String(slot));
  if (!control) throw new Error(kind);
  return toScreen(zone, rectCenter(control.rect));
}

/** Touch an Client-Position; die Spielfläche liegt bei (100, 50). */
const ORIGIN = { x: 100, y: 50 };
function touch(identifier: number, p: Point): TouchPointLike {
  return { identifier, clientX: p.x + ORIGIN.x, clientY: p.y + ORIGIN.y };
}

describe('routeTouchEvent', () => {
  it('verteilt mehrere geänderte Finger eines Ereignisses und rechnet den Ursprung heraus', () => {
    const tracker = createZoneTracker(zones);
    const stick = touch(11, center(1, 'stick'));
    const a = touch(12, center(2, 'button-a'));
    const effects = routeTouchEvent(
      tracker,
      { type: 'touchstart', changedTouches: [stick, a], touches: [stick, a] },
      ORIGIN,
    );
    expect(effects).toEqual([{ type: 'press', slot: 2, button: 'a' }]);
    expect(tracker.owner(11)).toEqual({ slot: 1, control: 'stick' });

    const moved = touch(11, { x: center(1, 'stick').x + 200, y: center(1, 'stick').y });
    expect(
      routeTouchEvent(
        tracker,
        { type: 'touchmove', changedTouches: [moved], touches: [moved, a] },
        ORIGIN,
      ),
    ).toEqual([{ type: 'stick', slot: 1, stick: { x: 1, y: 0 } }]);

    // Nur A hebt ab; der Joystick-Finger liegt weiter.
    expect(
      routeTouchEvent(tracker, { type: 'touchend', changedTouches: [a], touches: [moved] }, ORIGIN),
    ).toEqual([{ type: 'release', slot: 2, button: 'a' }]);
    expect(tracker.owner(11)).not.toBeNull();

    expect(
      routeTouchEvent(
        tracker,
        { type: 'touchcancel', changedTouches: [moved], touches: [] },
        ORIGIN,
      ),
    ).toEqual([{ type: 'stick', slot: 1, stick: { x: 0, y: 0 } }]);
    expect(tracker.size).toBe(0);
  });

  it('gleicht mit touches ab: verlorenes touchend wird beim nächsten Ereignis nachgeholt', () => {
    const tracker = createZoneTracker(zones);
    const b = touch(1, center(1, 'button-b'));
    routeTouchEvent(tracker, { type: 'touchstart', changedTouches: [b], touches: [b] }, ORIGIN);
    // Neuer Finger, aber b fehlt in `touches` (Ende ging verloren).
    const other = touch(2, center(2, 'stick'));
    expect(
      routeTouchEvent(
        tracker,
        { type: 'touchstart', changedTouches: [other], touches: [other] },
        ORIGIN,
      ),
    ).toEqual([{ type: 'release', slot: 1, button: 'b' }]);
  });

  it('ignoriert fremde Ereignistypen', () => {
    const tracker = createZoneTracker(zones);
    const p = touch(1, center(1, 'button-a'));
    expect(
      routeTouchEvent(tracker, { type: 'pointerdown', changedTouches: [p], touches: [p] }, ORIGIN),
    ).toEqual([]);
  });
});
