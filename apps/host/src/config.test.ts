import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseHostConfig } from './config.ts';
import { createLocalPlayers, PLAYER_COLORS } from './players.ts';

describe('parseHostConfig', () => {
  it('nutzt Standardwerte ohne Parameter', () => {
    expect(parseHostConfig('')).toEqual(DEFAULT_CONFIG);
  });

  it('liest players, seed und test', () => {
    expect(parseHostConfig('?players=4&seed=7&test=1')).toEqual({
      players: 4,
      seed: 7,
      test: true,
    });
  });

  it('begrenzt players auf 1–4 und ignoriert Unsinn', () => {
    expect(parseHostConfig('?players=9').players).toBe(4);
    expect(parseHostConfig('?players=0').players).toBe(1);
    expect(parseHostConfig('?players=abc&seed=x').players).toBe(DEFAULT_CONFIG.players);
    expect(parseHostConfig('?seed=x').seed).toBe(DEFAULT_CONFIG.seed);
    expect(parseHostConfig('?test=nein').test).toBe(false);
  });
});

describe('createLocalPlayers', () => {
  it('legt die ersten n Slots mit eigener Farbe an', () => {
    const players = createLocalPlayers(3);
    expect(players.map((p) => p.slot)).toEqual([1, 2, 3]);
    expect(players.every((p) => p.connected)).toBe(true);
    expect(new Set(players.map((p) => p.color)).size).toBe(3);
    expect(players[0]?.color).toBe(PLAYER_COLORS[1]);
  });
});
