import { describe, expect, it } from 'vitest';
import { CHARACTER_IDS, type CharacterId, type SlotNumber } from '@chaos-party/protocol';
import type { SlotContext } from '../state/reducer.ts';
import {
  buildZones,
  characterGrid,
  HIT_SLOP,
  lobbyZoneFrames,
  parsePickControl,
  pickControl,
  rectCenter,
  toScreen,
  ZONE_PADDING,
  type ControlKind,
  type Point,
  type Rect,
  type Size,
  type ZoneGeometry,
} from './geometry.ts';
import { zoneControlsInput } from './zoneInput.ts';
import { createZoneTracker } from './zoneTracker.ts';

/**
 * Lobby mit Charakterwahl im iPad-Modus (CHAOS-36/38): Geometrie für 2, 3 und 4 Zonen auf
 * mehreren iPad-Größen, Touch-Besitz und Wahl beim Abheben im Zonen-Tracker.
 */

const IPAD_PRO_11_QUER: Size = { width: 1194, height: 834 };
const IPAD_PRO_11_HOCH: Size = { width: 834, height: 1194 };
const IPAD_MINI_QUER: Size = { width: 1133, height: 744 };
const IPAD_MINI_HOCH: Size = { width: 744, height: 1133 };
/** Kleinste geprüfte Fläche (Safari-Leisten, Split View; ADR-008). */
const SMALLEST: Size = { width: 656, height: 944 };

/** Kleinstes Touch-Ziel (44 pt, Apple HIG); wir wollen deutlich mehr. */
const MIN_TOUCH = 44;

function lobbyContext(extra: Partial<NonNullable<SlotContext['lobby']>> = {}, ready = false) {
  return {
    phase: 'lobby',
    layout: ready ? 'wait' : 'lobby',
    actions: ready ? ['pick-character'] : ['ready', 'pick-character'],
    lobby: { character: null, takenCharacters: [], rounds: 5, ...extra },
  } satisfies SlotContext;
}

function zonesFor(
  viewport: Size,
  slots: SlotNumber[],
  contextFor: (slot: SlotNumber) => SlotContext = () => lobbyContext(),
): ZoneGeometry[] {
  return buildZones(slots, viewport, (slot) =>
    zoneControlsInput(contextFor(slot), undefined, slot),
  );
}

function controlRect(zone: ZoneGeometry, kind: ControlKind): Rect {
  const control = zone.controls.find((c) => c.kind === kind);
  if (!control) throw new Error(`${kind} fehlt in Zone ${String(zone.slot)}`);
  return control.rect;
}

function at(zones: readonly ZoneGeometry[], slot: SlotNumber, kind: ControlKind): Point {
  const zone = zones.find((z) => z.slot === slot);
  if (!zone) throw new Error(`Zone ${String(slot)} fehlt`);
  return toScreen(zone, rectCenter(controlRect(zone, kind)));
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

const SIZES: [string, Size][] = [
  ['iPad Pro 11" quer', IPAD_PRO_11_QUER],
  ['iPad Pro 11" hoch', IPAD_PRO_11_HOCH],
  ['iPad mini quer', IPAD_MINI_QUER],
  ['iPad mini hoch', IPAD_MINI_HOCH],
  ['kleinste Fläche', SMALLEST],
];

describe('Lobby-Geometrie je Zone', () => {
  it('Kennung der Figurenkarten', () => {
    expect(pickControl('raccoon')).toBe('pick:raccoon');
    expect(parsePickControl('pick:raccoon')).toBe('raccoon');
    expect(parsePickControl('ready')).toBeNull();
    expect(parsePickControl(null)).toBeNull();
  });

  it('Raster: breite Fläche 4 nebeneinander, hohe Fläche 2×2', () => {
    expect(characterGrid({ width: 549, height: 180 }, 4)).toEqual({ columns: 4, rows: 1 });
    expect(characterGrid({ width: 369, height: 360 }, 4)).toEqual({ columns: 2, rows: 2 });
    expect(characterGrid({ width: 549, height: 560 }, 4)).toEqual({ columns: 2, rows: 2 });
  });

  it('Kopf, Karten und Fuß liegen untereinander unter der Plakette', () => {
    const f = lobbyZoneFrames({ width: 589, height: 409 });
    expect(f.grid.y).toBeGreaterThanOrEqual(f.head.y + f.head.height);
    expect(f.foot.y).toBeGreaterThan(f.grid.y + f.grid.height);
    expect(f.foot.y + f.foot.height).toBe(409 - ZONE_PADDING);
  });

  for (const seats of [2, 3, 4] as const) {
    for (const [name, viewport] of SIZES) {
      it(`${String(seats)} Zonen, ${name}: vier Karten und „Bereit!“ groß genug, ohne Überlappen, innerhalb der Zone`, () => {
        const slots = ([1, 2, 3, 4] as const).slice(0, seats);
        const zones = zonesFor(viewport, [...slots]);
        expect(zones).toHaveLength(seats);
        for (const zone of zones) {
          const cards = CHARACTER_IDS.map((id) => controlRect(zone, pickControl(id)));
          const ready = zone.controls.find((c) => c.kind === 'ready');
          if (!ready) throw new Error('Bereit fehlt');
          for (const rect of [...cards, ready.rect]) {
            expect(rect.width).toBeGreaterThanOrEqual(MIN_TOUCH * 2);
            expect(rect.height).toBeGreaterThanOrEqual(MIN_TOUCH * 1.5);
            // Abstand zum Zonenrand (Systemgesten, A3).
            expect(rect.x).toBeGreaterThanOrEqual(ZONE_PADDING);
            expect(rect.y).toBeGreaterThanOrEqual(ZONE_PADDING);
            expect(rect.x + rect.width).toBeLessThanOrEqual(zone.local.width - ZONE_PADDING);
            expect(rect.y + rect.height).toBeLessThanOrEqual(zone.local.height - ZONE_PADDING);
          }
          // Trefferflächen überlappen nicht (Karten ohne Zugabe, Bereit mit Zugabe).
          const hits = zone.controls.map((c) => c.hit);
          for (let i = 0; i < hits.length; i++) {
            for (let j = i + 1; j < hits.length; j++) {
              const [a, b] = [hits[i], hits[j]];
              if (a && b) expect(overlaps(a, b)).toBe(false);
            }
          }
          expect(ready.hit.width).toBe(ready.rect.width + 2 * HIT_SLOP);
        }
      });
    }
  }

  it('4 Zonen quer (iPad Pro 11"): Karten nebeneinander, obere Reihe gedreht', () => {
    const zones = zonesFor(IPAD_PRO_11_QUER, [1, 2, 3, 4]);
    expect(zones.map((z) => z.rotation)).toEqual([0, 0, 180, 180]);
    const [first] = zones;
    if (!first) throw new Error('Zone fehlt');
    const [robot, cactus] = [controlRect(first, 'pick:robot'), controlRect(first, 'pick:cactus')];
    expect(cactus.y).toBe(robot.y);
    expect(cactus.x).toBeGreaterThan(robot.x);
  });

  it('vergebene und eigene Figur sind sichtbar, aber ohne Wirkung; nach „bereit“ kein Bereit-Knopf', () => {
    const [zone] = zonesFor(IPAD_PRO_11_QUER, [1, 2], () =>
      lobbyContext({ character: 'robot', takenCharacters: ['cactus'] }, true),
    );
    if (!zone) throw new Error('Zone fehlt');
    const inert = (id: CharacterId) =>
      zone.controls.find((c) => c.kind === pickControl(id))?.inert === true;
    expect(inert('robot')).toBe(true);
    expect(inert('cactus')).toBe(true);
    expect(inert('raccoon')).toBe(false);
    expect(zone.controls.some((c) => c.kind === 'ready')).toBe(false);
  });

  it('„Bereit!“ gesendet: Knopf verschwindet bis zum nächsten Kontext', () => {
    const context = lobbyContext();
    const sent = zoneControlsInput(context, 'lobby:lobby:ready,pick-character', 1);
    expect(sent.lobby?.showReady).toBe(false);
    const other = zoneControlsInput(context, 'lobby:wait:pick-character', 1);
    expect(other.lobby?.showReady).toBe(true);
  });

  it('ohne Charakterwahl (älterer Server) bleibt der große Bereit-Knopf in der Mitte', () => {
    const [zone] = buildZones([1, 2], IPAD_PRO_11_QUER, () => ({
      layout: 'lobby',
      actions: ['ready'],
    }));
    expect(zone?.controls.map((c) => c.kind)).toEqual(['ready']);
  });
});

describe('Zonen-Tracker: Figurenwahl', () => {
  it('wählt beim Abheben auf einer freien Karte, je Zone für den eigenen Slot', () => {
    const zones = zonesFor(IPAD_PRO_11_QUER, [1, 2, 3, 4]);
    const t = createZoneTracker(zones);
    expect(t.start(1, at(zones, 1, 'pick:raccoon'))).toEqual([]);
    expect(t.start(2, at(zones, 3, 'pick:sock'))).toEqual([]);
    expect(t.view(1).picksHeld).toEqual(['pick:raccoon']);
    expect(t.end(1)).toEqual([{ type: 'pick', slot: 1, character: 'raccoon' }]);
    // Gedrehte Zone 3: Trefferprüfung in Zonen-Koordinaten.
    expect(t.end(2)).toEqual([{ type: 'pick', slot: 3, character: 'sock' }]);
  });

  it('Wegrutschen oder Abbrechen wählt nichts; Finger aus Zone 1 wählt nie für Zone 2', () => {
    const zones = zonesFor(IPAD_PRO_11_QUER, [1, 2]);
    const t = createZoneTracker(zones);
    t.start(1, at(zones, 1, 'pick:robot'));
    t.move(1, at(zones, 2, 'pick:robot'));
    expect(t.end(1)).toEqual([]);
    t.start(2, at(zones, 2, 'pick:cactus'));
    expect(t.cancel(2)).toEqual([]);
  });

  it('Karte wird vergeben, während ein Finger darauf liegt: stillgelegt, keine Wahl', () => {
    const free = zonesFor(IPAD_PRO_11_QUER, [1, 2]);
    const t = createZoneTracker(free);
    const point = at(free, 1, 'pick:cactus');
    t.start(1, point);
    const taken = zonesFor(IPAD_PRO_11_QUER, [1, 2], (slot) =>
      slot === 1 ? lobbyContext({ takenCharacters: ['cactus'] }) : lobbyContext(),
    );
    expect(t.setZones(taken)).toEqual([]);
    expect(t.owner(1)).toEqual({ slot: 1, control: null });
    expect(t.end(1, point)).toEqual([]);
  });

  it('Bereit-Knopf der Lobby-Zone sendet `ready` beim Abheben', () => {
    const zones = zonesFor(IPAD_PRO_11_HOCH, [1, 2]);
    const t = createZoneTracker(zones);
    t.start(5, at(zones, 2, 'ready'));
    expect(t.view(2).readyHeld).toBe(true);
    expect(t.end(5)).toEqual([{ type: 'ready', slot: 2 }]);
  });
});
