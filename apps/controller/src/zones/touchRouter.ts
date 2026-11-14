/**
 * Übersetzt Touch-Ereignisse (`touchstart/move/end/cancel`) in Aufrufe des
 * Zonen-Trackers (ADR-008). Ohne DOM-Abhängigkeit: Es genügen Objekte mit der
 * Form von `TouchEvent`/`Touch`, damit die Logik ohne Browser testbar bleibt.
 *
 * - Jede Berührung in `changedTouches` wird einzeln anhand ihres `identifier`
 *   behandelt (mehrere Finger können in einem Ereignis stecken).
 * - Danach gleicht `reconcile` mit `touches` ab: Was der Browser nicht mehr als
 *   liegend meldet, wird abgebrochen (verlorenes `touchend`, z. B. wenn iOS eine
 *   Systemgeste übernimmt oder ein Element verschwindet).
 */
import type { Point } from './geometry.ts';
import type { ZoneEffect, ZoneTracker } from './zoneTracker.ts';

export interface TouchPointLike {
  readonly identifier: number;
  readonly clientX: number;
  readonly clientY: number;
}

export interface TouchEventLike {
  readonly type: string;
  readonly changedTouches: ArrayLike<TouchPointLike>;
  readonly touches: ArrayLike<TouchPointLike>;
}

export const TOUCH_EVENT_TYPES = ['touchstart', 'touchmove', 'touchend', 'touchcancel'] as const;

function list<T>(items: ArrayLike<T>): T[] {
  return Array.from({ length: items.length }, (_, i) => items[i]).filter(
    (item): item is T => item !== undefined,
  );
}

/**
 * Ein Touch-Ereignis an den Tracker weitergeben.
 * `origin` = linke obere Ecke der Spielfläche in Client-Koordinaten.
 */
export function routeTouchEvent(
  tracker: ZoneTracker,
  event: TouchEventLike,
  origin: Point = { x: 0, y: 0 },
): ZoneEffect[] {
  const effects: ZoneEffect[] = [];
  for (const touch of list(event.changedTouches)) {
    const point = { x: touch.clientX - origin.x, y: touch.clientY - origin.y };
    switch (event.type) {
      case 'touchstart':
        effects.push(...tracker.start(touch.identifier, point));
        break;
      case 'touchmove':
        effects.push(...tracker.move(touch.identifier, point));
        break;
      case 'touchend':
        effects.push(...tracker.end(touch.identifier, point));
        break;
      case 'touchcancel':
        effects.push(...tracker.cancel(touch.identifier));
        break;
      default:
        break;
    }
  }
  effects.push(...tracker.reconcile(list(event.touches).map((t) => t.identifier)));
  return effects;
}
