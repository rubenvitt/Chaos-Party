import { describe, expect, it } from 'vitest';
import type { ControllerBoardInfo } from '@chaos-party/protocol';
import { countLabel, describeFinal, finalHeadline, placeLabel } from './final.ts';

/** Endstand am Controller (CHAOS-37): Platz, Gleichstand, vorzeitiges Ende, Stand. */

function board(extra: Partial<ControllerBoardInfo> = {}): ControllerBoardInfo {
  return {
    gamePhase: 'game-results',
    round: 5,
    rounds: 5,
    coins: 23,
    trophies: 2,
    items: [],
    activeSlot: null,
    paused: false,
    character: 'raccoon',
    minigameWins: 3,
    place: 1,
    tied: false,
    endedEarly: false,
    ...extra,
  };
}

describe('describeFinal', () => {
  it('Sieg allein', () => {
    expect(describeFinal(board())).toEqual({
      place: 1,
      tied: false,
      placeLabel: 'Platz 1',
      headline: 'Du hast gewonnen!',
      endedEarly: false,
      character: 'raccoon',
      trophies: 2,
      coins: 23,
      minigameWins: 3,
    });
  });

  it('geteilter Platz: ausdrücklich benannt, auf Platz 1 gemeinsam gewonnen', () => {
    expect(describeFinal(board({ tied: true }))).toMatchObject({
      tied: true,
      placeLabel: 'Geteilter Platz 1',
      headline: 'Gemeinsam gewonnen!',
    });
    expect(describeFinal(board({ place: 2, tied: true }))).toMatchObject({
      placeLabel: 'Geteilter Platz 2',
      headline: 'Gut gespielt!',
    });
  });

  it('vorzeitig beendet; ohne Platz (älterer Server) kein Platzschild', () => {
    expect(describeFinal(board({ endedEarly: true, place: 3 }))).toMatchObject({
      endedEarly: true,
      placeLabel: 'Platz 3',
    });
    const withoutPlace = board();
    delete withoutPlace.place;
    expect(describeFinal(withoutPlace)).toMatchObject({
      place: null,
      tied: false,
      placeLabel: null,
      headline: 'Spiel vorbei!',
    });
  });

  it('Hilfstexte', () => {
    expect(finalHeadline(4, false)).toBe('Gut gespielt!');
    expect(placeLabel(null, true)).toBeNull();
    expect(countLabel(1, 'Trophäe', 'Trophäen')).toBe('1 Trophäe');
    expect(countLabel(0, 'Münze', 'Münzen')).toBe('0 Münzen');
  });
});
