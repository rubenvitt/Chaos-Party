import { describe, expect, it } from 'vitest';
import type { SlotContext } from '../state/reducer.ts';
import { describeLobby, HINT_PICK, HINT_PICKED, HINT_READY, roundsLabel } from './view.ts';

/** Lobby mit Charakterwahl (CHAOS-36): reine Ableitung für iPhone und iPad-Zone. */

function lobby(extra: Partial<NonNullable<SlotContext['lobby']>> = {}, ready = false): SlotContext {
  return {
    phase: 'lobby',
    layout: ready ? 'wait' : 'lobby',
    actions: ready ? ['pick-character'] : ['ready', 'pick-character'],
    lobby: { character: null, takenCharacters: [], rounds: 5, ...extra },
  };
}

describe('describeLobby', () => {
  it('ohne Charakterwahl im Kontext (älterer Server, andere Phase): null', () => {
    expect(describeLobby(undefined, undefined)).toBeNull();
    expect(describeLobby({ phase: 'lobby', layout: 'lobby', actions: ['ready'] }, undefined)).toBe(
      null,
    );
    expect(describeLobby({ phase: 'board', layout: 'board', actions: [] }, 'robot')).toBeNull();
  });

  it('vier Figuren in fester Reihenfolge mit Namen; alle frei, Hinweis zum Wählen', () => {
    const view = describeLobby(lobby(), undefined);
    expect(view?.cards.map((c) => [c.id, c.name, c.state, c.selectable])).toEqual([
      ['robot', 'Schraubi', 'free', true],
      ['cactus', 'Kalle Kaktus', 'free', true],
      ['raccoon', 'Wusel', 'free', true],
      ['sock', 'Socke Sigi', 'free', true],
    ]);
    expect(view).toMatchObject({
      character: null,
      ready: false,
      canReady: true,
      rounds: 5,
      roundsLabel: '5 Runden',
      boardName: null,
      hint: HINT_PICK,
    });
  });

  it('zeigt das gewählte Brett, wenn der Server es nennt (CHAOS-197)', () => {
    const wald = describeLobby(
      lobby({ board: { id: 'wackelwald', name: 'Wackelwald' } }),
      undefined,
    );
    expect(wald?.boardName).toBe('Wackelwald');
    const zufall = describeLobby(
      lobby({ board: { id: 'zufall', name: 'Zufallsbrett' } }),
      undefined,
    );
    expect(zufall?.boardName).toBe('Zufallsbrett');
  });

  it('eigene Wahl hervorgehoben (nicht wählbar), vergebene ausgegraut', () => {
    const view = describeLobby(
      lobby({ character: 'cactus', takenCharacters: ['sock'] }),
      undefined,
    );
    const state = Object.fromEntries(view?.cards.map((c) => [c.id, c.state]) ?? []);
    expect(state).toEqual({ robot: 'free', cactus: 'mine', raccoon: 'free', sock: 'taken' });
    expect(view?.cards.find((c) => c.id === 'cactus')?.selectable).toBe(false);
    expect(view?.cards.find((c) => c.id === 'sock')?.selectable).toBe(false);
    expect(view?.hint).toBe(HINT_PICKED);
  });

  it('gesendete Wahl leuchtet sofort (vorgemerkt), bis der Server sie bestätigt', () => {
    const view = describeLobby(lobby({ character: 'robot' }), 'raccoon');
    expect(view?.character).toBe('raccoon');
    const raccoon = view?.cards.find((c) => c.id === 'raccoon');
    expect(raccoon).toMatchObject({ state: 'mine', pending: true });
    expect(view?.cards.find((c) => c.id === 'robot')?.state).toBe('free');
    // Bestätigt: nicht mehr vorgemerkt.
    const confirmed = describeLobby(lobby({ character: 'raccoon' }), 'raccoon');
    expect(confirmed?.cards.find((c) => c.id === 'raccoon')?.pending).toBe(false);
  });

  it('vorgemerkte Wahl, die inzwischen vergeben ist, zählt nicht (Wettlauf)', () => {
    const view = describeLobby(
      lobby({ character: 'robot', takenCharacters: ['raccoon'] }),
      'raccoon',
    );
    expect(view?.character).toBe('robot');
    expect(view?.cards.find((c) => c.id === 'raccoon')?.state).toBe('taken');
  });

  it('bereit (Layout `wait`): Umwählen weiter möglich, kein „Bereit!“, Hinweis', () => {
    const view = describeLobby(lobby({ character: 'robot' }, true), undefined);
    expect(view).toMatchObject({ ready: true, canReady: false, hint: HINT_READY });
    expect(view?.cards.filter((c) => c.selectable).map((c) => c.id)).toEqual([
      'cactus',
      'raccoon',
      'sock',
    ]);
  });

  it('geteiltes iPad: vergebene Figur eines Nachbarplatzes trägt dessen Slot', () => {
    const view = describeLobby(lobby({ takenCharacters: ['cactus', 'sock'] }), undefined, [
      { slot: 3, character: 'cactus' },
      { slot: 4, character: null },
    ]);
    expect(view?.cards.find((c) => c.id === 'cactus')?.ownerSlot).toBe(3);
    // Andere Geräte: Besitzer unbekannt (älterer Server ohne `takenBy`).
    expect(view?.cards.find((c) => c.id === 'sock')?.ownerSlot).toBeNull();
  });

  it('takenBy vom Server: Besitzer auch auf anderen Geräten, Vorrang vor Nachbarzonen', () => {
    const view = describeLobby(
      lobby({
        takenCharacters: ['cactus', 'sock'],
        takenBy: [
          { character: 'cactus', slot: 3 },
          { character: 'sock', slot: 2 },
        ],
      }),
      undefined,
      // Veralteter Nachbarstand (Zone 4 hatte kurz die Socke) – der Server hat recht.
      [{ slot: 4, character: 'sock' }],
    );
    expect(view?.cards.find((c) => c.id === 'cactus')?.ownerSlot).toBe(3);
    expect(view?.cards.find((c) => c.id === 'sock')?.ownerSlot).toBe(2);
    expect(view?.cards.find((c) => c.id === 'robot')?.ownerSlot).toBeNull();
  });

  it('ohne `pick-character` (Server erlaubt es nicht mehr) ist nichts wählbar', () => {
    const view = describeLobby({ ...lobby(), actions: ['ready'] }, undefined);
    expect(view?.cards.every((c) => !c.selectable)).toBe(true);
  });

  it('Rundenzahl: Einzahl/Mehrzahl', () => {
    expect(roundsLabel(1)).toBe('1 Runde');
    expect(roundsLabel(8)).toBe('8 Runden');
  });
});
