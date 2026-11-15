import { PLAYER_SLOTS } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, parseHostConfig, serverWebSocketUrl } from './config.ts';
import { createLocalPlayers, playersFromLobby } from './players.ts';

describe('parseHostConfig', () => {
  it('nutzt Standardwerte ohne Parameter (Server-Modus)', () => {
    expect(parseHostConfig('')).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.local).toBe(false);
  });

  it('liest die Minispiel-Vorschau nur mit gültiger Kennung (M3)', () => {
    expect(parseHostConfig('?local=1&minigame=pump-parade').minigame).toBe('pump-parade');
    expect(parseHostConfig('?minigame=../x').minigame).toBeNull();
  });

  it('liest local, players, seed, test, joinHint und debug', () => {
    expect(parseHostConfig('?local=1&players=4&seed=7&test=1&joinHint=5&debug=1')).toEqual({
      local: true,
      players: 4,
      seed: 7,
      test: true,
      joinHintSeconds: 5,
      debug: true,
      arena: false,
      rounds: null,
      board: false,
      demo: false,
      minigame: null,
    });
    expect(DEFAULT_CONFIG.debug).toBe(false);
    expect(parseHostConfig('?debug=true').debug).toBe(true);
    expect(parseHostConfig('?debug=0').debug).toBe(false);
  });

  it('begrenzt players auf 1–4 und ignoriert Unsinn', () => {
    expect(parseHostConfig('?players=9').players).toBe(4);
    expect(parseHostConfig('?players=0').players).toBe(1);
    expect(parseHostConfig('?players=abc&seed=x').players).toBe(DEFAULT_CONFIG.players);
    expect(parseHostConfig('?seed=x').seed).toBe(DEFAULT_CONFIG.seed);
    expect(parseHostConfig('?test=nein').test).toBe(false);
    expect(parseHostConfig('?local=ja').local).toBe(false);
    expect(parseHostConfig('?joinHint=-3').joinHintSeconds).toBe(30);
    expect(parseHostConfig('?joinHint=99999').joinHintSeconds).toBe(3600);
  });

  it('liest arena, rounds, board und demo (M2)', () => {
    expect(parseHostConfig('?arena=1&rounds=7&local=1&board=1&demo=1')).toMatchObject({
      arena: true,
      rounds: 7,
      local: true,
      board: true,
      demo: true,
    });
    expect(DEFAULT_CONFIG).toMatchObject({ arena: false, rounds: null, board: false, demo: false });
    expect(parseHostConfig('?rounds=0').rounds).toBe(1);
    expect(parseHostConfig('?rounds=99').rounds).toBe(20);
    expect(parseHostConfig('?rounds=viele').rounds).toBeNull();
    expect(parseHostConfig('?arena=ja').arena).toBe(false);
  });
});

describe('serverWebSocketUrl', () => {
  it('nutzt denselben Ursprung mit /ws', () => {
    expect(serverWebSocketUrl({ protocol: 'http:', host: 'localhost:8787' })).toBe(
      'ws://localhost:8787/ws',
    );
    expect(serverWebSocketUrl({ protocol: 'https:', host: 'pc.local' })).toBe('wss://pc.local/ws');
  });
});

describe('createLocalPlayers', () => {
  it('legt die ersten n Slots mit Farbe, Bezeichnung und Symbol aus dem Protokoll an', () => {
    const players = createLocalPlayers(3);
    expect(players.map((p) => p.slot)).toEqual([1, 2, 3]);
    expect(players.every((p) => p.connected)).toBe(true);
    expect(players[0]).toMatchObject({
      color: PLAYER_SLOTS[1].color,
      label: PLAYER_SLOTS[1].label,
      symbol: PLAYER_SLOTS[1].symbol,
    });
    expect(new Set(players.map((p) => p.color)).size).toBe(3);
  });
});

describe('playersFromLobby', () => {
  it('übernimmt nur beigetretene Slots, sortiert, mit Server-Farbe und -Bezeichnung', () => {
    const players = playersFromLobby([
      { slot: 3, color: '#009E73', label: 'Mia', connected: false, ready: true },
      { slot: 1, color: '#0072B2', label: 'Blau', connected: true, ready: false },
    ]);
    expect(players).toEqual([
      {
        slot: 1,
        color: '#0072B2',
        label: 'Blau',
        symbol: PLAYER_SLOTS[1].symbol,
        connected: true,
        ready: false,
      },
      {
        slot: 3,
        color: '#009E73',
        label: 'Mia',
        symbol: PLAYER_SLOTS[3].symbol,
        connected: false,
        ready: true,
      },
    ]);
  });
});
