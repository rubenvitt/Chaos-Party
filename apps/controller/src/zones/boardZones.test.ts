import { describe, expect, it } from 'vitest';
import type { SlotNumber } from '@chaos-party/protocol';
import {
  boardZoneFrames,
  buildZones,
  choiceControl,
  choiceGrid,
  MIN_CHOICE_SIZE,
  parseChoiceControl,
  rectCenter,
  toScreen,
  type ControlKind,
  type Point,
  type Size,
  type ZoneChoicesInput,
  type ZoneControlsInput,
  type ZoneGeometry,
} from './geometry.ts';
import type { SlotContext } from '../state/reducer.ts';
import { zoneChoicesInput } from './zoneInput.ts';
import { createZoneTracker } from './zoneTracker.ts';

/** Wahlknöpfe der Brettphase im iPad-Modus (CHAOS-22): Geometrie und Zonen-Tracker. */

const LANDSCAPE: Size = { width: 1194, height: 834 };
const PORTRAIT: Size = { width: 834, height: 1194 };

function choices(promptId: number, extra: Partial<ZoneChoicesInput> = {}): ZoneChoicesInput {
  return {
    promptId,
    main: ['s12', 's20'],
    extra: [],
    instant: false,
    locked: false,
    ...extra,
  };
}

function boardInput(c: ZoneChoicesInput | undefined): ZoneControlsInput {
  return { layout: 'board', actions: c ? ['choose'] : [], ...(c && { choices: c }) };
}

function zonesFor(
  viewport: Size,
  inputs: Partial<Record<SlotNumber, ZoneChoicesInput>>,
  slots: SlotNumber[] = [1, 2],
): ZoneGeometry[] {
  return buildZones(slots, viewport, (slot) => boardInput(inputs[slot]));
}

function at(zones: readonly ZoneGeometry[], slot: SlotNumber, kind: ControlKind): Point {
  const zone = zones.find((z) => z.slot === slot);
  const control = zone?.controls.find((c) => c.kind === kind);
  if (!zone || !control) throw new Error(`${kind} fehlt in Zone ${String(slot)}`);
  return toScreen(zone, rectCenter(control.rect));
}

describe('Geometrie der Wahlknöpfe', () => {
  it('Kennung enthält Prompt-ID und Option (auch mit Doppelpunkt)', () => {
    expect(choiceControl(4, 'item:trap')).toBe('choice:4:item:trap');
    expect(parseChoiceControl('choice:4:item:trap')).toEqual({ promptId: 4, option: 'item:trap' });
    expect(parseChoiceControl('button-a')).toBeNull();
    expect(parseChoiceControl(null)).toBeNull();
  });

  it('Raster: wenige Knöpfe breit nebeneinander oder untereinander, je nach Fläche', () => {
    expect(choiceGrid({ width: 549, height: 600 }, 2)).toEqual({ columns: 1, rows: 2 });
    expect(choiceGrid({ width: 800, height: 150 }, 2)).toEqual({ columns: 2, rows: 1 });
    expect(choiceGrid({ width: 280, height: 260 }, 4).columns).toBeLessThanOrEqual(2);
  });

  it('Bereiche liegen untereinander unter der Plakette', () => {
    const f = boardZoneFrames({ width: 589, height: 834 });
    expect(f.title.y).toBeGreaterThanOrEqual(f.status.y + f.status.height);
    expect(f.timer.y).toBe(f.title.y + f.title.height);
    expect(f.body.y).toBeGreaterThan(f.timer.y);
    expect(f.body.y + f.body.height).toBe(834 - 20);
  });

  // Zonengrößen: 2 Plätze quer/hoch, 4 Plätze, kleinstes geprüftes iPad (656 × 944).
  const sizes: [string, Size, SlotNumber[]][] = [
    ['2 quer', LANDSCAPE, [1, 2]],
    ['2 hoch', PORTRAIT, [1, 2]],
    ['4 quer', LANDSCAPE, [1, 2, 3, 4]],
    ['4 hoch', PORTRAIT, [1, 2, 3, 4]],
    ['4 klein', { width: 656, height: 944 }, [1, 2, 3, 4]],
  ];
  const variants: [string, ZoneChoicesInput][] = [
    ['Würfeln + 3 Items', choices(1, { main: ['roll'], extra: ['item:a', 'item:b', 'item:c'] })],
    [
      '3 Ziele + Abbrechen',
      choices(1, { main: ['slot:2', 'slot:3', 'slot:4'], extra: ['cancel'] }),
    ],
    ['4 Wege', choices(1, { main: ['a', 'b', 'c', 'd'] })],
    ['Reaktion', choices(1, { main: ['shield', 'brace'], instant: true })],
  ];
  for (const [name, viewport, slots] of sizes) {
    for (const [variant, input] of variants) {
      it(`${name}, ${variant}: Knöpfe ≥ ${String(MIN_CHOICE_SIZE)} px, in der Zone, ohne Überlappung`, () => {
        const zones = buildZones(slots, viewport, () => boardInput(input));
        for (const zone of zones) {
          const rects = zone.controls.map((c) => c.rect);
          expect(rects).toHaveLength(input.main.length + input.extra.length);
          for (const r of rects) {
            expect(r.width).toBeGreaterThanOrEqual(MIN_CHOICE_SIZE);
            expect(r.height).toBeGreaterThanOrEqual(MIN_CHOICE_SIZE);
            expect(r.x).toBeGreaterThanOrEqual(20);
            expect(r.y).toBeGreaterThanOrEqual(boardZoneFrames(zone.local).body.y - 0.01);
            expect(r.x + r.width).toBeLessThanOrEqual(zone.local.width - 20 + 0.01);
            expect(r.y + r.height).toBeLessThanOrEqual(zone.local.height - 20 + 0.01);
          }
          for (let i = 0; i < rects.length; i++) {
            for (let j = i + 1; j < rects.length; j++) {
              const a = rects[i];
              const b = rects[j];
              if (!a || !b) continue;
              const overlap =
                a.x < b.x + b.width &&
                b.x < a.x + a.width &&
                a.y < b.y + b.height &&
                b.y < a.y + a.height;
              expect(overlap).toBe(false);
            }
          }
        }
      });
    }
  }

  it('gesperrt: gleiche Rechtecke, aber ohne Wirkung; Reaktion löst beim Aufsetzen aus', () => {
    const open = zonesFor(LANDSCAPE, { 1: choices(3, { instant: true }) });
    const locked = zonesFor(LANDSCAPE, { 1: choices(3, { instant: true, locked: true }) });
    expect(locked[0]?.controls.map((c) => c.rect)).toEqual(open[0]?.controls.map((c) => c.rect));
    expect(open[0]?.controls.every((c) => c.instant === true && c.inert === undefined)).toBe(true);
    expect(locked[0]?.controls.every((c) => c.inert === true)).toBe(true);
  });

  it('zoneChoicesInput: Haupt- und Zusatzknöpfe aus dem Prompt, Sperre aus der gesendeten Wahl', () => {
    const context: SlotContext = {
      phase: 'board',
      layout: 'board',
      actions: ['choose'],
      prompt: {
        info: {
          id: 6,
          slot: 2,
          kind: 'target',
          title: 'Wen?',
          options: [
            { id: 'slot:1', label: 'Blau', slot: 1 },
            { id: 'cancel', label: 'Abbrechen' },
          ],
          remainingMs: null,
        },
        deadlineAt: null,
        totalMs: null,
      },
    };
    expect(zoneChoicesInput(2, context, undefined)).toEqual({
      promptId: 6,
      main: ['slot:1'],
      extra: ['cancel'],
      instant: false,
      locked: false,
    });
    expect(zoneChoicesInput(2, context, { promptId: 6, option: 'cancel' })?.locked).toBe(true);
    expect(zoneChoicesInput(1, context, undefined)).toBeUndefined();
  });
});

describe('Zonen-Tracker mit Wahlknöpfen', () => {
  const both = { 1: choices(21), 2: choices(22, { main: ['roll'], extra: ['item:trap'] }) };

  it('gleichzeitige Finger in zwei Zonen: je eine Wahl für den eigenen Slot beim Abheben', () => {
    for (const viewport of [LANDSCAPE, PORTRAIT]) {
      const zones = zonesFor(viewport, both);
      const t = createZoneTracker(zones);
      expect(t.start(1, at(zones, 1, 'choice:21:s20'))).toEqual([]);
      expect(t.start(2, at(zones, 2, 'choice:22:roll'))).toEqual([]);
      expect(t.view(1).choicesHeld).toEqual(['choice:21:s20']);
      expect(t.view(2).choicesHeld).toEqual(['choice:22:roll']);
      expect(t.end(2)).toEqual([{ type: 'choose', slot: 2, promptId: 22, option: 'roll' }]);
      expect(t.end(1)).toEqual([{ type: 'choose', slot: 1, promptId: 21, option: 's20' }]);
    }
  });

  it('Finger aus Zone 1 über einen Knopf in Zone 2 gezogen: keine Wahl, nirgends', () => {
    const zones = zonesFor(LANDSCAPE, both);
    const t = createZoneTracker(zones);
    const roll2 = at(zones, 2, 'choice:22:roll');
    t.start(1, at(zones, 1, 'choice:21:s12'));
    expect(t.move(1, roll2)).toEqual([]);
    expect(t.view(2).choicesHeld).toEqual([]);
    expect(t.end(1, roll2)).toEqual([]);
    // Neben allen Knöpfen in Zone 1 aufgesetzt, auf Zone 2 abgehoben: ebenfalls nichts.
    const zone1 = zones.find((z) => z.slot === 1);
    if (!zone1) throw new Error('Zone 1 fehlt');
    const status = toScreen(zone1, { x: 100, y: 100 });
    t.start(2, status);
    expect(t.end(2, roll2)).toEqual([]);
  });

  it('Wegrutschen vom Knopf oder Abbruch: keine Wahl; zweiter Finger auf demselben Knopf wirkt nicht', () => {
    const zones = zonesFor(LANDSCAPE, both);
    const t = createZoneTracker(zones);
    const s12 = at(zones, 1, 'choice:21:s12');
    const s20 = at(zones, 1, 'choice:21:s20');
    t.start(1, s12);
    expect(t.end(1, s20)).toEqual([]);
    t.start(2, s12);
    t.start(3, s12);
    expect(t.end(3)).toEqual([]);
    expect(t.cancel(2)).toEqual([]);
  });

  it('Reaktion (instant): Wahl schon beim Aufsetzen, Abheben wählt nicht erneut', () => {
    const zones = zonesFor(LANDSCAPE, {
      1: choices(21),
      2: choices(23, { main: ['shield', 'brace'], instant: true }),
    });
    const t = createZoneTracker(zones);
    t.start(1, at(zones, 1, 'choice:21:s12'));
    expect(t.start(2, at(zones, 2, 'choice:23:brace'))).toEqual([
      { type: 'choose', slot: 2, promptId: 23, option: 'brace' },
    ]);
    expect(t.end(2)).toEqual([]);
    expect(t.end(1)).toEqual([{ type: 'choose', slot: 1, promptId: 21, option: 's12' }]);
  });

  it('Sperre oder neuer Prompt während der Finger liegt: stillgelegt, keine Wahl', () => {
    const zones = zonesFor(LANDSCAPE, both);
    const t = createZoneTracker(zones);
    const s12 = at(zones, 1, 'choice:21:s12');
    t.start(1, s12);
    // Andere Zone wählt; Zone 1 bekommt einen neuen Prompt mit gleicher Option.
    t.setZones(zonesFor(LANDSCAPE, { ...both, 1: choices(30) }));
    expect(t.owner(1)).toEqual({ slot: 1, control: null });
    expect(t.end(1, s12)).toEqual([]);

    // Gesperrte Knöpfe treffen nie.
    const locked = zonesFor(LANDSCAPE, { ...both, 1: choices(30, { locked: true }) });
    t.setZones(locked);
    t.start(2, s12);
    expect(t.owner(2)).toEqual({ slot: 1, control: null });
    expect(t.end(2, s12)).toEqual([]);
  });
});
