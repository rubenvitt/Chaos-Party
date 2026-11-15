import { describe, expect, it } from 'vitest';
import type { Action, ControllerMinigameInfo, SlotNumber } from '@chaos-party/protocol';
import {
  buildZones,
  HIT_SLOP,
  inflate,
  MAX_BIG_BUTTON,
  rectCenter,
  toScreen,
  type ControlKind,
  type Point,
  type Rect,
  type Size,
  type ZoneGeometry,
} from './geometry.ts';
import { zoneControlsInput } from './zoneInput.ts';
import { createZoneTracker } from './zoneTracker.ts';
import type { SlotContext } from '../state/reducer.ts';

/** Minispiel in iPad-Zonen (CHAOS-33): Bedienelemente laut Steckbrief, Loslassen beim Wechsel. */

const LANDSCAPE: Size = { width: 1194, height: 834 };
const PORTRAIT: Size = { width: 834, height: 1194 };
const MINI_LANDSCAPE: Size = { width: 1133, height: 744 };

function minigame(
  stage: ControllerMinigameInfo['stage'],
  controls: ControllerMinigameInfo['controls'],
): ControllerMinigameInfo {
  return {
    id: 'test-spiel',
    title: 'Testspiel',
    tagline: 'Nur ein Test.',
    instructions: ['Drück A.'],
    controls,
    stage,
    scoreUnit: 'Punkte',
    tied: false,
    aborted: false,
  };
}

const ALL = { joystick: 'Lenken', a: 'Schubsen', b: 'Bremsen' };
const ONLY_A = { joystick: null, a: 'Pumpen', b: null };
const A_AND_B = { joystick: null, a: 'Links', b: 'Rechts' };

function playContext(controls: ControllerMinigameInfo['controls'], actions: Action[]): SlotContext {
  return {
    phase: 'board',
    layout: 'joystick-buttons',
    actions,
    minigame: minigame('play', controls),
  };
}

function resultsContext(controls: ControllerMinigameInfo['controls']): SlotContext {
  return {
    phase: 'board',
    layout: 'board',
    actions: [],
    minigame: { ...minigame('results', controls), place: 1, score: 3 },
  };
}

function zones(
  viewport: Size,
  contextFor: (slot: SlotNumber) => SlotContext,
  slots: SlotNumber[] = [1, 2, 3, 4],
): ZoneGeometry[] {
  return buildZones(slots, viewport, (slot) =>
    zoneControlsInput(contextFor(slot), undefined, slot),
  );
}

function kinds(zone: ZoneGeometry | undefined): ControlKind[] {
  return zone?.controls.map((c) => c.kind) ?? [];
}

function at(list: readonly ZoneGeometry[], slot: SlotNumber, kind: ControlKind): Point {
  const zone = list.find((z) => z.slot === slot);
  const control = zone?.controls.find((c) => c.kind === kind);
  if (!zone || !control) throw new Error(`${kind} fehlt in Zone ${String(slot)}`);
  return toScreen(zone, rectCenter(control.rect));
}

function inside(inner: Rect, outer: Size): boolean {
  return (
    inner.x >= 0 &&
    inner.y >= 0 &&
    inner.x + inner.width <= outer.width &&
    inner.y + inner.height <= outer.height
  );
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('Minispiel-Bedienelemente in Zonen', () => {
  it('nur Elemente, die Server und Steckbrief anbieten', () => {
    const all = zones(LANDSCAPE, () => playContext(ALL, ['move', 'button-a', 'button-b']));
    expect(kinds(all[0]).sort()).toEqual(['button-a', 'button-b', 'stick']);
    // Steckbrief blendet den Joystick aus, auch wenn `move` (fälschlich) angeboten wird.
    const pump = zones(LANDSCAPE, () => playContext(ONLY_A, ['move', 'button-a']));
    expect(kinds(pump[0])).toEqual(['button-a']);
    // Intro/Ergebnis: keine Bedienelemente.
    const results = zones(LANDSCAPE, () => resultsContext(ALL));
    for (const zone of results) expect(zone.controls).toEqual([]);
  });

  it('ohne Joystick: Knöpfe größer und mittig, ganz in der Zone, ohne Überlappung', () => {
    for (const viewport of [LANDSCAPE, PORTRAIT, MINI_LANDSCAPE]) {
      for (const seats of [2, 4] as const) {
        const slots = ([1, 2, 3, 4] as const).slice(0, seats);
        const single = zones(viewport, () => playContext(ONLY_A, ['button-a']), slots);
        for (const zone of single) {
          const [a] = zone.controls;
          if (!a) throw new Error('A fehlt');
          expect(a.rect.width).toBeGreaterThanOrEqual(140);
          expect(a.rect.width).toBeLessThanOrEqual(MAX_BIG_BUTTON);
          expect(inside(a.rect, zone.local)).toBe(true);
          const center = rectCenter(a.rect);
          expect(Math.abs(center.x - zone.local.width / 2)).toBeLessThan(1);
        }
        const pair = zones(viewport, () => playContext(A_AND_B, ['button-a', 'button-b']), slots);
        for (const zone of pair) {
          const a = zone.controls.find((c) => c.kind === 'button-a');
          const b = zone.controls.find((c) => c.kind === 'button-b');
          if (!a || !b) throw new Error('Knopf fehlt');
          expect(a.rect.width).toBe(b.rect.width);
          expect(a.rect.width).toBeGreaterThanOrEqual(100);
          expect(inside(a.rect, zone.local)).toBe(true);
          expect(inside(b.rect, zone.local)).toBe(true);
          expect(overlaps(a.hit, b.hit)).toBe(false);
          expect(inflate(a.rect, HIT_SLOP)).toEqual(a.hit);
        }
      }
    }
  });
});

describe('Wechsel Spiel → Ergebnis im Zonen-Tracker', () => {
  it('gehaltene Knöpfe und Joysticks mehrerer Zonen werden losgelassen', () => {
    const playing = zones(LANDSCAPE, () => playContext(ALL, ['move', 'button-a', 'button-b']));
    const tracker = createZoneTracker(playing);

    expect(tracker.start(1, at(playing, 1, 'button-a'))).toEqual([
      { type: 'press', slot: 1, button: 'a' },
    ]);
    expect(tracker.start(2, at(playing, 2, 'button-b'))).toEqual([
      { type: 'press', slot: 2, button: 'b' },
    ]);
    const stick = at(playing, 3, 'stick');
    tracker.start(3, stick);
    const moved = tracker.move(3, { x: stick.x + 60, y: stick.y });
    expect(moved).toEqual([expect.objectContaining({ type: 'stick', slot: 3 })]);

    const effects = tracker.setZones(zones(LANDSCAPE, () => resultsContext(ALL)));
    expect(effects).toEqual(
      expect.arrayContaining([
        { type: 'release', slot: 1, button: 'a' },
        { type: 'release', slot: 2, button: 'b' },
        { type: 'stick', slot: 3, stick: { x: 0, y: 0 } },
      ]),
    );
    expect(effects).toHaveLength(3);
    // Die Finger bleiben stillgelegt: Bewegen und Abheben lösen nichts mehr aus.
    expect(tracker.move(3, { x: stick.x - 40, y: stick.y })).toEqual([]);
    expect(tracker.end(1)).toEqual([]);
    expect(tracker.view(1).pressed).toEqual([]);
    expect(tracker.view(3).stick).toBeNull();
  });
});
