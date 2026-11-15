import { describe, expect, it } from 'vitest';
import { cardCharacter, roundOptions, roundsDuration, startState } from './lobbyState.ts';

function at<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`Index ${String(index)} fehlt`);
  return item;
}

const p = (label: string, connected: boolean, ready: boolean) => ({ label, connected, ready });

describe('startState', () => {
  it('ohne Verbindung oder ohne verbundenen Spieler: Knopf aus', () => {
    expect(startState([], 'connected')).toMatchObject({ readiness: 'blocked', enabled: false });
    expect(startState([p('Blau', false, true)], 'connected').enabled).toBe(false);
    expect(startState([p('Blau', true, true)], 'disconnected').enabled).toBe(false);
  });

  it('ein Spieler: Start bleibt möglich (Probelauf), Knopf leuchtet nicht', () => {
    const state = startState([p('Blau', true, true), p('Rosa', false, false)], 'connected');
    expect(state).toMatchObject({ readiness: 'solo', enabled: true, highlighted: false });
    expect(state.hint).toContain('ab 2 Spielern');
  });

  it('zwei verbunden, nicht alle bereit: erlaubt, nennt die Wartenden', () => {
    const state = startState(
      [p('Blau', true, true), p('Mia', true, false), p('Grün', true, false)],
      'connected',
    );
    expect(state).toMatchObject({ readiness: 'waiting', enabled: true, highlighted: false });
    expect(state.hint).toBe('Mia und Grün sind noch nicht bereit – starten geht trotzdem.');
    expect(startState([p('Blau', true, true), p('Mia', true, false)], 'connected').hint).toBe(
      'Mia ist noch nicht bereit – starten geht trotzdem.',
    );
  });

  it('ab zwei verbundenen, bereiten Spielern leuchtet der Knopf; Getrennte zählen nicht', () => {
    const state = startState(
      [p('Blau', true, true), p('Orange', true, true), p('Grün', false, false)],
      'connected',
    );
    expect(state).toMatchObject({ readiness: 'ready', enabled: true, highlighted: true });
  });
});

describe('roundOptions', () => {
  it('zeigt die Vorschläge und markiert die Einstellung', () => {
    expect(roundOptions({ rounds: 5, roundPresets: [3, 5, 8] })).toEqual([
      { rounds: 3, selected: false, custom: false },
      { rounds: 5, selected: true, custom: false },
      { rounds: 8, selected: false, custom: false },
    ]);
  });

  it('nimmt eine abweichende Einstellung (z. B. ?rounds=2) sortiert dazu', () => {
    expect(roundOptions({ rounds: 2, roundPresets: [3, 5, 8] }).map((o) => o.rounds)).toEqual([
      2, 3, 5, 8,
    ]);
    expect(roundOptions({ rounds: 2, roundPresets: [3, 5, 8] })[0]).toEqual({
      rounds: 2,
      selected: true,
      custom: true,
    });
  });

  it('Spieldauer als grober Richtwert', () => {
    expect(roundsDuration(3)).toBe('≈ 10 Min.');
    expect(roundsDuration(5)).toBe('≈ 15 Min.');
    expect(roundsDuration(8)).toBe('≈ 25 Min.');
    expect(roundsDuration(1)).toBe('≈ 5 Min.');
  });
});

describe('cardCharacter', () => {
  it('zeigt die gewählte Figur mit Namen', () => {
    const players = [{ slot: 1 as const, character: 'sock' as const }];
    expect(cardCharacter(at(players, 0), players)).toEqual({
      character: 'sock',
      chosen: true,
      text: 'Socke Sigi',
    });
  });

  it('ohne Wahl: „wählt noch …“ mit der Figur, die der Server zuweisen würde', () => {
    const players = [
      { slot: 1 as const, character: 'cactus' as const },
      { slot: 2 as const, character: null },
      { slot: 3 as const, character: null },
    ];
    // Slot 2 hätte Kaktus (vergeben) → erste freie: Roboter; Slot 3 behält Waschbär.
    expect(cardCharacter(at(players, 1), players)).toEqual({
      character: 'robot',
      chosen: false,
      text: 'wählt noch …',
    });
    expect(cardCharacter(at(players, 2), players).character).toBe('raccoon');
  });

  it('Vorschläge kollidieren nicht untereinander', () => {
    const players = [
      { slot: 1 as const, character: null },
      { slot: 2 as const, character: 'robot' as const },
      { slot: 4 as const, character: null },
    ];
    const one = cardCharacter(at(players, 0), players).character;
    const four = cardCharacter(at(players, 2), players).character;
    expect(one).toBe('cactus');
    expect(four).toBe('sock');
  });
});
