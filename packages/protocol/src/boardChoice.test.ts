/**
 * Brett-Auswahl in der Lobby (v4-Nachtrag CHAOS-197): `configure.board`,
 * `lobby.settings.board`/`boards` und `ControllerLobbyInfo.board`. Gültige und kaputte Werte.
 */
import { describe, expect, it } from 'vitest';
import {
  createMessage,
  encode,
  parseHostMessage,
  parseServerToControllerMessage,
  parseServerToHostMessage,
} from './parse.ts';
import { MAX_BOARD_NAME_LENGTH, MAX_BOARDS, RANDOM_BOARD } from './schemas.ts';
import type { LobbyBoard, LobbyMessage, LobbySettings } from './types.ts';
import { PROTOCOL_VERSION } from './version.ts';

const WALD: LobbyBoard = {
  id: 'wackelwald',
  name: 'Wackelwald',
  tagline: 'Rundkurs mit Klippenweg, Sumpf und Wackelbrücke',
  spaces: 43,
  recommendedRounds: 10,
};
const GIPFEL: LobbyBoard = {
  id: 'frostgipfel',
  name: 'Frostgipfel',
  tagline: 'Berg mit Rutschbahnen',
  spaces: 80,
  recommendedRounds: 16,
};

function lobby(settings: Partial<LobbySettings>): LobbyMessage {
  return createMessage('lobby', {
    joinCode: 'AB12',
    phase: 'lobby',
    players: [],
    settings: { rounds: 10, roundPresets: [10, 16, 20], ...settings },
  });
}

describe('configure.board (Host → Server)', () => {
  it.each([
    createMessage('configure', { board: 'wackelwald' }),
    createMessage('configure', { board: RANDOM_BOARD }),
    // Wohlgeformt, aber unbekannt: das Schema lässt es durch, der Server lehnt es ab.
    createMessage('configure', { board: 'gibt-es-nicht' }),
    createMessage('configure', { rounds: 16, board: 'frostgipfel', moreReactionTime: true }),
  ])('nimmt %j an', (message) => {
    expect(parseHostMessage(encode(message))).toEqual({ ok: true, message });
  });

  it.each([
    ['leere ID', ''],
    ['Großbuchstaben', 'Wackelwald'],
    ['Leerzeichen', 'wackel wald'],
    ['Pfad', '../brett'],
    ['zu lang', 'a'.repeat(33)],
    ['Zahl', 7],
    ['null', null],
    ['Objekt', { id: 'wackelwald' }],
  ])('lehnt ungültige Brett-ID ab: %s', (_name, board) => {
    const raw = { v: PROTOCOL_VERSION, type: 'configure', board };
    expect(parseHostMessage(JSON.stringify(raw)).ok).toBe(false);
  });

  it('configure ohne jedes Feld bleibt ungültig', () => {
    expect(parseHostMessage(JSON.stringify({ v: PROTOCOL_VERSION, type: 'configure' })).ok).toBe(
      false,
    );
  });
});

describe('lobby.settings.board/boards (Server → Host)', () => {
  it('ohne Brett-Felder gültig (älterer Server)', () => {
    expect(parseServerToHostMessage(encode(lobby({}))).ok).toBe(true);
  });

  it.each([
    ['ein Brett', { board: 'wackelwald', boards: [WALD] }],
    ['zwei Bretter', { board: 'frostgipfel', boards: [WALD, GIPFEL] }],
    ['Zufall', { board: RANDOM_BOARD, boards: [WALD, GIPFEL] }],
    ['nur Wahl ohne Liste', { board: 'wackelwald' }],
  ])('nimmt an: %s', (_name, settings) => {
    const message = lobby(settings);
    expect(parseServerToHostMessage(encode(message))).toEqual({ ok: true, message });
  });

  it.each([
    ['Wahl nicht in der Liste', { board: 'frostgipfel', boards: [WALD] }],
    ['Liste leer', { board: 'wackelwald', boards: [] }],
    ['ID doppelt', { boards: [WALD, WALD] }],
    ['Brett heißt wie Zufall', { boards: [{ ...WALD, id: RANDOM_BOARD }] }],
    ['Name leer', { boards: [{ ...WALD, name: '' }] }],
    ['Name zu lang', { boards: [{ ...WALD, name: 'x'.repeat(MAX_BOARD_NAME_LENGTH + 1) }] }],
    ['Kurztext zu lang', { boards: [{ ...WALD, tagline: 'x'.repeat(81) }] }],
    ['Felder 0', { boards: [{ ...WALD, spaces: 0 }] }],
    ['Empfehlung 21 Runden', { boards: [{ ...WALD, recommendedRounds: 21 }] }],
    ['Zusatzfeld', { boards: [{ ...WALD, theme: 'wald' }] }],
    [
      'zu viele Bretter',
      {
        boards: Array.from({ length: MAX_BOARDS + 1 }, (_, i) => ({
          ...WALD,
          id: `b${String(i)}`,
        })),
      },
    ],
    ['Wahl ungültig', { board: 'Wald!' }],
  ])('lehnt ab: %s', (_name, settings) => {
    const raw = JSON.parse(encode(lobby({}))) as { settings: object };
    const broken = { ...raw, settings: { ...raw.settings, ...settings } };
    expect(parseServerToHostMessage(JSON.stringify(broken)).ok).toBe(false);
  });
});

describe('ControllerLobbyInfo.board (Server → Controller)', () => {
  const context = (board: unknown) => ({
    v: PROTOCOL_VERSION,
    type: 'context',
    slot: 1,
    phase: 'lobby',
    layout: 'lobby',
    actions: ['ready', 'pick-character'],
    lobby: { character: null, takenCharacters: [], rounds: 10, board },
  });

  it.each([
    { id: 'wackelwald', name: 'Wackelwald' },
    { id: RANDOM_BOARD, name: 'Zufallsbrett' },
  ])('nimmt %j an', (board) => {
    expect(parseServerToControllerMessage(JSON.stringify(context(board))).ok).toBe(true);
  });

  it.each([
    ['ohne Namen', { id: 'wackelwald' }],
    ['Name leer', { id: 'wackelwald', name: '' }],
    ['ID kaputt', { id: 'Wald', name: 'Wald' }],
    ['nur Text', 'wackelwald'],
    ['Zusatzfeld', { id: 'wackelwald', name: 'Wackelwald', spaces: 43 }],
  ])('lehnt ab: %s', (_name, board) => {
    expect(parseServerToControllerMessage(JSON.stringify(context(board))).ok).toBe(false);
  });
});
