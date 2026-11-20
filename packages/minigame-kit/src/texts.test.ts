import type { Slot } from '@chaos-party/minigame-sdk';
import { describe, expect, it } from 'vitest';
import { EventTally, buildHighlights, fitLine, nameOf, tallyFacts } from './highlights.ts';
import {
  STECKBRIEF_MERKMALE,
  bedienungOf,
  differences,
  mostSimilar,
  type Steckbrief,
} from './steckbrief.ts';

const NAMES = new Map<Slot, string>([
  [1, 'Blau'],
  [2, 'Orange'],
]);

describe('Höhepunkte per Vorlage', () => {
  it('wählt Spitzenreiter, Letzten und eigene Zeilen in Regel-Reihenfolge', () => {
    const tally = new EventTally<'treffer' | 'fang'>();
    tally.count(1, 'treffer', 3);
    tally.count(2, 'treffer');
    tally.count(2, 'fang');
    const lines = buildHighlights(
      [
        {
          kind: 'top',
          stat: 'treffer',
          min: 2,
          text: (name, n) => `${name} wurde ${n}× geplättet.`,
        },
        { kind: 'top', stat: 'punkte', text: (name) => `${name} gewinnt.` },
        { kind: 'last', stat: 'fang', text: (name) => `${name} fängt das Letzte.` },
        { kind: 'custom', line: () => null },
        { kind: 'custom', line: (facts) => `${facts.slots.length} Leute dabei.` },
      ],
      tallyFacts([1, 2], NAMES, tally, { punkte: (slot) => (slot === 1 ? 4 : 4) }),
    );
    expect(lines).toEqual([
      'Blau wurde 3× geplättet.',
      'Orange fängt das Letzte.',
      '2 Leute dabei.',
    ]);
  });

  it('höchstens vier Zeilen, lange Zeilen gekürzt, Rückfallname', () => {
    const facts = tallyFacts([1, 3], NAMES, new EventTally<'x'>());
    const many = Array.from({ length: 6 }, () => ({
      kind: 'custom' as const,
      line: () => 'x'.repeat(80),
    }));
    const lines = buildHighlights(many, facts);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toHaveLength(64);
    expect(lines[0]?.endsWith('…')).toBe(true);
    expect(fitLine('kurz')).toBe('kurz');
    expect(nameOf(NAMES, 3)).toBe('Spieler 3');
    expect(buildHighlights([{ kind: 'last', stat: 'x', text: () => 'nie' }], facts)).toEqual([]);
  });
});

describe('Vielfalts-Steckbrief', () => {
  const sock: Steckbrief = {
    kernverb: 'fangen',
    ziel: 'meiste',
    arena: 'rund',
    kamera: 'schraeg',
    bedienung: 'SA',
    spielform: 'FFA',
    tempo: 'hektisch',
    ort: 'bad',
  };

  it('zählt Unterschiede ohne den Ort und findet das ähnlichste Spiel', () => {
    expect(STECKBRIEF_MERKMALE).toHaveLength(7);
    expect(differences(sock, { ...sock, ort: 'wald' })).toEqual([]);
    const tower: Steckbrief = { ...sock, kernverb: 'stapeln', kamera: 'seite', tempo: 'ruhig' };
    const near: Steckbrief = { ...sock, tempo: 'wechselnd' };
    expect(differences(sock, tower)).toEqual(['kernverb', 'kamera', 'tempo']);
    expect(
      mostSimilar(sock, [
        { id: 'turm', steckbrief: tower },
        { id: 'nah', steckbrief: near },
      ]),
    ).toEqual({ id: 'nah', differences: ['tempo'] });
    expect(mostSimilar(sock, [])).toBeNull();
  });

  it('leitet die Bedienung aus den Controller-Elementen ab', () => {
    expect(bedienungOf({ joystick: 'Laufen', a: 'Hechten', b: null })).toBe('SA');
    expect(bedienungOf({ joystick: null, a: 'Klatschen', b: 'Ducken' })).toBe('AB');
    expect(bedienungOf({ joystick: null, a: null, b: 'Nur B' })).toBeNull();
  });
});
