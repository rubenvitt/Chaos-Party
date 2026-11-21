/**
 * Sperrliste und Favoriten der Minispiel-Rotation (v4-Nachtrag CHAOS-85):
 * `configure.minigameBlocklist`/`minigameFavorites` und `lobby.settings.minigames`.
 */
import { describe, expect, it } from 'vitest';
import { createMessage, encode, parseHostMessage, parseServerToHostMessage } from './parse.ts';
import { MAX_ROTATION_MINIGAMES } from './schemas.ts';
import type { LobbyMessage, LobbyMinigame } from './types.ts';
import { PROTOCOL_VERSION } from './version.ts';

const SOCKEN: LobbyMinigame = {
  id: 'sockenregen',
  title: 'Sockenregen',
  blocked: true,
  favorite: false,
};
const TURM: LobbyMinigame = {
  id: 'wackelturm',
  title: 'Wackelturm',
  blocked: false,
  favorite: true,
};

function lobby(minigames: unknown): LobbyMessage {
  return {
    ...createMessage('lobby', {
      joinCode: 'AB12',
      phase: 'lobby',
      players: [],
      settings: { rounds: 10, roundPresets: [10, 16, 20] },
    }),
    settings: { rounds: 10, roundPresets: [10, 16, 20], minigames },
  } as LobbyMessage;
}

describe('configure: Sperrliste und Favoriten (Host → Server)', () => {
  it.each([
    createMessage('configure', { minigameBlocklist: ['sockenregen'] }),
    createMessage('configure', { minigameBlocklist: [] }),
    createMessage('configure', { minigameFavorites: ['wackelturm', 'pudding-gerangel'] }),
    createMessage('configure', { rounds: 6, minigameBlocklist: ['a-b'], minigameFavorites: [] }),
    // Wohlgeformt, aber unbekannt: das Schema lässt es durch, der Server ignoriert es.
    createMessage('configure', { minigameFavorites: ['gibt-es-nicht'] }),
  ])('nimmt %j an', (message) => {
    expect(parseHostMessage(encode(message))).toEqual({ ok: true, message });
  });

  it.each([
    ['Großbuchstaben', ['Sockenregen']],
    ['zu kurz', ['ab']],
    ['doppelt', ['sockenregen', 'sockenregen']],
    ['kein Array', 'sockenregen'],
    ['zu viele', Array.from({ length: MAX_ROTATION_MINIGAMES + 1 }, (_, i) => `mg-${String(i)}`)],
  ])('lehnt Sperrliste ab: %s', (_label, list) => {
    const raw = JSON.stringify({ v: PROTOCOL_VERSION, type: 'configure', minigameBlocklist: list });
    expect(parseHostMessage(raw).ok).toBe(false);
  });
});

describe('lobby.settings.minigames (Server → Host)', () => {
  it('nimmt die Rotation mit Sperr- und Favoriten-Stand an; ohne Feld bleibt alles gültig', () => {
    const message = lobby([SOCKEN, TURM]);
    expect(parseServerToHostMessage(encode(message))).toEqual({ ok: true, message });
    const without = createMessage('lobby', {
      joinCode: 'AB12',
      phase: 'lobby',
      players: [],
      settings: { rounds: 10, roundPresets: [10, 16, 20] },
    });
    expect(parseServerToHostMessage(encode(without)).ok).toBe(true);
  });

  it.each([
    ['doppelt', [SOCKEN, SOCKEN]],
    ['Titel zu lang', [{ ...SOCKEN, title: 'x'.repeat(25) }]],
    ['ohne blocked', [{ id: 'sockenregen', title: 'Sockenregen', favorite: false }]],
    ['fremdes Feld', [{ ...SOCKEN, weight: 2 }]],
  ])('lehnt ab: %s', (_label, minigames) => {
    expect(parseServerToHostMessage(encode(lobby(minigames))).ok).toBe(false);
  });
});
