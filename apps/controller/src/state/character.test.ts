import { describe, expect, it } from 'vitest';
import { defaultCharacterFor, type ControllerBoardInfo } from '@chaos-party/protocol';
import { ownCharacter } from './character.ts';
import type { SlotContext } from './reducer.ts';

/** Figur in der Plakette (CHAOS-61 + CHAOS-36): Wahl laut Server, sonst Vorschlag des Slots. */

const BOARD: ControllerBoardInfo = {
  gamePhase: 'roll',
  round: 1,
  rounds: 10,
  coins: 0,
  trophies: 0,
  items: [],
  activeSlot: 1,
  paused: false,
  character: 'sock',
  minigameWins: 0,
};

describe('ownCharacter', () => {
  it('ohne Kontext oder ohne Wahl: Vorschlag des Slots', () => {
    expect(ownCharacter(2, undefined)).toBe(defaultCharacterFor(2));
    const lobby: SlotContext = {
      phase: 'lobby',
      layout: 'lobby',
      actions: ['ready', 'pick-character'],
      lobby: { character: null, takenCharacters: [], rounds: 10 },
    };
    expect(ownCharacter(3, lobby)).toBe(defaultCharacterFor(3));
  });

  it('Lobby: bestätigte Wahl', () => {
    const lobby: SlotContext = {
      phase: 'lobby',
      layout: 'lobby',
      actions: ['ready', 'pick-character'],
      lobby: { character: 'raccoon', takenCharacters: [], rounds: 10 },
    };
    expect(ownCharacter(1, lobby)).toBe('raccoon');
  });

  it('im Spiel: Figur aus dem eigenen Stand, auch im Minispiel', () => {
    const play: SlotContext = {
      phase: 'board',
      layout: 'joystick-buttons',
      actions: ['move'],
      board: BOARD,
    };
    expect(ownCharacter(1, play)).toBe('sock');
  });
});
