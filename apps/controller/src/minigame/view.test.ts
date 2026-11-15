import { describe, expect, it } from 'vitest';
import type { Action, ControllerMinigameInfo } from '@chaos-party/protocol';
import {
  ABORTED_HEADLINE,
  controlLegend,
  DEFAULT_STICK_HINT,
  describePlay,
  describeResult,
  formatScore,
  minigameIn,
  offeredActions,
  rewardText,
} from './view.ts';
import type { SlotContext } from '../state/reducer.ts';

/** Minispiele am Controller (CHAOS-33): reine Ableitungen für Intro, Spiel, Ergebnis. */

function info(extra: Partial<ControllerMinigameInfo> = {}): ControllerMinigameInfo {
  return {
    id: 'kartoffel-hupf',
    title: 'Kartoffel-Hüpfen',
    tagline: 'Hüpf über die rollenden Kartoffeln!',
    instructions: ['Lauf hin und her.', 'Spring mit A.'],
    controls: { joystick: 'Laufen', a: 'Springen', b: null },
    stage: 'play',
    scoreUnit: 'Sekunden',
    tied: false,
    aborted: false,
    ...extra,
  };
}

function play(actions: Action[], minigame?: ControllerMinigameInfo): SlotContext {
  return {
    phase: 'board',
    layout: 'joystick-buttons',
    actions,
    ...(minigame && { minigame }),
  };
}

describe('minigameIn', () => {
  it('liefert das Minispiel (optional nur in einer Stage)', () => {
    const ctx = play(['move'], info({ stage: 'intro' }));
    expect(minigameIn(ctx)?.id).toBe('kartoffel-hupf');
    expect(minigameIn(ctx, 'intro')?.stage).toBe('intro');
    expect(minigameIn(ctx, 'play')).toBeUndefined();
    expect(minigameIn(undefined)).toBeUndefined();
    expect(minigameIn(play(['move']))).toBeUndefined();
  });
});

describe('controlLegend', () => {
  it('nur angebotene Elemente, Reihenfolge Joystick, A, B', () => {
    expect(controlLegend({ joystick: 'Laufen', a: 'Springen', b: null })).toEqual([
      { kind: 'stick', label: 'Laufen' },
      { kind: 'a', label: 'Springen' },
    ]);
    expect(controlLegend({ joystick: null, a: 'Pumpen', b: null })).toEqual([
      { kind: 'a', label: 'Pumpen' },
    ]);
    expect(controlLegend({ joystick: 'Lenken', a: 'Schubsen', b: 'Bremsen' })).toHaveLength(3);
    expect(controlLegend({ joystick: null, a: null, b: null })).toEqual([]);
  });
});

describe('describePlay', () => {
  it('M1-Arena ohne Minispiel: wie bisher, nur Buchstaben', () => {
    expect(describePlay(play(['move', 'button-a', 'button-b']))).toEqual({
      stick: true,
      stickHint: DEFAULT_STICK_HINT,
      buttons: [
        { button: 'a', label: null },
        { button: 'b', label: null },
      ],
      title: null,
    });
  });

  it('Minispiel: Beschriftung aus dem Steckbrief, Kopf mit Titel', () => {
    const view = describePlay(play(['move', 'button-a'], info()));
    expect(view).toEqual({
      stick: true,
      stickHint: 'Ziehen: Laufen',
      buttons: [{ button: 'a', label: 'Springen' }],
      title: 'Kartoffel-Hüpfen',
    });
  });

  it('Joystick null: kein Joystick, auch wenn der Server move anbietet', () => {
    const minigame = info({ controls: { joystick: null, a: 'Pumpen', b: null } });
    const view = describePlay(play(['move', 'button-a'], minigame));
    expect(view.stick).toBe(false);
    expect(view.buttons).toEqual([{ button: 'a', label: 'Pumpen' }]);
    expect(offeredActions(play(['move', 'button-a'], minigame))).toEqual(['button-a']);
  });

  it('B null: kein B; ohne Aktion des Servers auch kein beschriftetes Element', () => {
    const minigame = info({ controls: { joystick: 'Laufen', a: 'Springen', b: 'Ducken' } });
    expect(describePlay(play(['move', 'button-a'], minigame)).buttons).toEqual([
      { button: 'a', label: 'Springen' },
    ]);
    expect(describePlay(play(['button-a', 'button-b'], minigame)).stick).toBe(false);
    expect(offeredActions(play(['move', 'button-a', 'button-b'], info()))).toEqual([
      'move',
      'button-a',
    ]);
  });

  it('Kontext außerhalb von play (Intro/Ergebnis) liefert keine Beschriftung', () => {
    const view = describePlay(play(['move', 'button-a'], info({ stage: 'results' })));
    expect(view.title).toBeNull();
    expect(view.buttons).toEqual([{ button: 'a', label: null }]);
  });
});

describe('describeResult', () => {
  it('Platz und Punkte mit Einheit', () => {
    expect(describeResult(info({ stage: 'results', place: 1, score: 42 }))).toEqual({
      kind: 'placed',
      place: 1,
      tied: false,
      headline: 'Platz 1!',
      cheer: 'Gewonnen!',
      score: '42 Sekunden',
      reward: null,
    });
    const fourth = describeResult(info({ stage: 'results', place: 4, score: 0 }));
    expect(fourth).toMatchObject({ headline: 'Platz 4!', score: '0 Sekunden' });
  });

  it('Gleichstand (CHAOS-55): ausdrücklich „Geteilter Platz“, auf Platz 1 gemeinsam gewonnen', () => {
    expect(describeResult(info({ stage: 'results', place: 1, tied: true }))).toMatchObject({
      kind: 'placed',
      tied: true,
      headline: 'Geteilter Platz 1!',
      cheer: 'Gemeinsam gewonnen!',
    });
    expect(describeResult(info({ stage: 'results', place: 3, tied: true }))).toMatchObject({
      headline: 'Geteilter Platz 3!',
      cheer: 'Gut gemacht!',
    });
  });

  it('Münzen aus `reward`: „+5 Münzen“, Einzahl, „Keine Münzen“', () => {
    expect(describeResult(info({ stage: 'results', place: 1, reward: 5 }))).toMatchObject({
      reward: '+5 Münzen',
    });
    expect(rewardText(1)).toBe('+1 Münze');
    expect(rewardText(0)).toBe('Keine Münzen');
    expect(rewardText(undefined)).toBeNull();
  });

  it('Platz ohne Punkte: keine Punktzeile', () => {
    expect(describeResult(info({ stage: 'results', place: 2 }))).toMatchObject({
      kind: 'placed',
      score: null,
    });
  });

  it('Abbruch (kein Platz): Hinweis statt Wertung', () => {
    expect(describeResult(info({ stage: 'results' }))).toMatchObject({
      kind: 'aborted',
      headline: ABORTED_HEADLINE,
    });
  });

  it('Abbruch (`aborted`, CHAOS-55) schlägt einen mitgeschickten Platz', () => {
    expect(
      describeResult(info({ stage: 'results', place: 1, aborted: true, reward: 3 })),
    ).toMatchObject({ kind: 'aborted', headline: 'Minispiel abgebrochen' });
  });
});

describe('formatScore', () => {
  it('deutsche Tausenderpunkte, negative Werte', () => {
    expect(formatScore(1234, 'Pumpstöße')).toBe('1.234 Pumpstöße');
    expect(formatScore(-3, 'Punkte')).toBe('-3 Punkte');
    expect(formatScore(1_000_000, 'Meter')).toBe('1.000.000 Meter');
  });
});
