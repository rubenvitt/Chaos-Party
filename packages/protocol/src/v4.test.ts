/**
 * Protokoll v4 (M4, ADR-015): Charakterwahl, Lobby-Einstellungen, Pause/Ende, Revanche,
 * erweiterte Wertung und Minispiel-Bestätigung. Gültige und kaputte Nachrichten je Feld.
 */
import { describe, expect, it } from 'vitest';
import {
  CHARACTER_IDS,
  CHARACTER_NAMES,
  defaultCharacterFor,
  isCharacterId,
  pickFreeCharacter,
} from './characters.ts';
import {
  createMessage,
  encode,
  parseClientMessage,
  parseControllerMessage,
  parseHostMessage,
  parseServerToControllerMessage,
  parseServerToHostMessage,
} from './parse.ts';
import { isIntentAllowed } from './phase.ts';
import type { BoardView, ControllerLobbyInfo, LobbyMessage } from './types.ts';
import { PROTOCOL_VERSION } from './version.ts';

const SETTINGS = { rounds: 5, roundPresets: [3, 5, 8] };

/** Kopie ohne ein Feld (für „Pflichtfeld fehlt“). */
function without(value: object, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

function lobby(patch: Partial<LobbyMessage> = {}): LobbyMessage {
  return createMessage('lobby', {
    joinCode: 'AB12',
    phase: 'lobby',
    players: [
      {
        slot: 1,
        color: '#0072B2',
        label: 'Blau',
        connected: true,
        ready: false,
        character: 'sock',
      },
      { slot: 2, color: '#E69F00', label: 'Ole', connected: false, ready: true, character: null },
    ],
    settings: SETTINGS,
    ...patch,
  });
}

function view(patch: Partial<BoardView> = {}): BoardView {
  return {
    boardId: 'wackelwald',
    gamePhase: 'game-results',
    round: 3,
    rounds: 3,
    turnOrder: [2, 1],
    activeSlot: null,
    players: [1, 2].map((slot) => ({
      slot: slot as 1 | 2,
      name: slot === 1 ? 'Blau' : 'Orange',
      spaceId: 's01',
      coins: 12,
      trophies: 1,
      items: [],
      connected: true,
      character: slot === 1 ? 'cactus' : 'robot',
      minigameWins: slot === 1 ? 2 : 1,
      stats: { coinsEarned: 30, coinsLost: 18, spacesMoved: 40, itemsUsed: 2 },
    })),
    trophySpaces: ['s10'],
    trophyPrice: 15,
    traps: [],
    prompt: null,
    remainingMs: null,
    stepMs: 350,
    ranking: [
      { slot: 1, place: 1, trophies: 1, coins: 12, minigameWins: 2, decidedBy: 'minigame-wins' },
      { slot: 2, place: 2, trophies: 1, coins: 12, minigameWins: 1, decidedBy: 'minigame-wins' },
    ],
    minigame: null,
    paused: false,
    endedEarly: true,
    ...patch,
  };
}

describe('Figuren (characters.ts)', () => {
  it('liefert vier Figuren mit Namen, Standard je Slot und Prüfung', () => {
    expect(CHARACTER_IDS).toEqual(['robot', 'cactus', 'raccoon', 'sock']);
    for (const id of CHARACTER_IDS) expect(CHARACTER_NAMES[id].name.length).toBeGreaterThan(0);
    expect([1, 2, 3, 4].map((slot) => defaultCharacterFor(slot as 1 | 2 | 3 | 4))).toEqual([
      ...CHARACTER_IDS,
    ]);
    expect(isCharacterId('sock')).toBe(true);
    expect(isCharacterId('dragon')).toBe(false);
    expect(isCharacterId(1)).toBe(false);
  });

  it('pickFreeCharacter bevorzugt die Standardfigur, sonst die erste freie', () => {
    expect(pickFreeCharacter(3, [])).toBe('raccoon');
    expect(pickFreeCharacter(3, ['raccoon'])).toBe('robot');
    expect(pickFreeCharacter(1, ['robot', 'cactus'])).toBe('raccoon');
    expect(pickFreeCharacter(2, CHARACTER_IDS)).toBeNull();
  });
});

describe('Controller → Server (v4)', () => {
  it('nimmt pick-character an und lehnt kaputte Varianten ab', () => {
    const message = createMessage('pick-character', { slot: 2, seq: 3, character: 'raccoon' });
    expect(parseControllerMessage(encode(message))).toEqual({ ok: true, message });
    expect(message.v).toBe(PROTOCOL_VERSION);
    for (const patch of [
      { character: 'dragon' },
      { character: null },
      { slot: 5 },
      { seq: -1 },
      { cheat: true },
    ]) {
      expect(parseControllerMessage(encode({ ...message, ...patch } as never)).ok).toBe(false);
    }
    expect(parseControllerMessage(JSON.stringify(without(message, 'character'))).ok).toBe(false);
  });

  it('pick-character ist eine Controller-Nachricht, keine Host-Nachricht', () => {
    const message = createMessage('pick-character', { slot: 1, seq: 1, character: 'robot' });
    expect(parseHostMessage(encode(message)).ok).toBe(false);
    expect(parseClientMessage(encode(message)).ok).toBe(true);
  });
});

describe('Host → Server (v4)', () => {
  it.each([
    createMessage('configure', { rounds: 8 }),
    createMessage('pause', {}),
    createMessage('resume', {}),
    createMessage('end-game', {}),
    createMessage('rematch', {}),
    createMessage('start', { rounds: 3 }),
    createMessage('host-ready', {}),
  ])('nimmt %j an', (message) => {
    expect(parseHostMessage(encode(message))).toEqual({ ok: true, message });
    expect(parseClientMessage(encode(message)).ok).toBe(true);
    expect(parseControllerMessage(encode(message)).ok).toBe(false);
  });

  it.each([
    ['configure ohne Runden', { v: PROTOCOL_VERSION, type: 'configure' }],
    ['configure mit 0 Runden', { v: PROTOCOL_VERSION, type: 'configure', rounds: 0 }],
    ['configure mit 21 Runden', { v: PROTOCOL_VERSION, type: 'configure', rounds: 21 }],
    ['configure mit Kommazahl', { v: PROTOCOL_VERSION, type: 'configure', rounds: 2.5 }],
    ['pause mit Zusatzfeld', { v: PROTOCOL_VERSION, type: 'pause', ms: 1000 }],
    ['resume mit Zusatzfeld', { v: PROTOCOL_VERSION, type: 'resume', slot: 1 }],
    ['end-game mit Zusatzfeld', { v: PROTOCOL_VERSION, type: 'end-game', winner: 1 }],
    ['rematch mit Seed', { v: PROTOCOL_VERSION, type: 'rematch', seed: 7 }],
    ['host-ready mit Zusatzfeld', { v: PROTOCOL_VERSION, type: 'host-ready', scene: 'board' }],
  ])('lehnt ab: %s', (_name, raw) => {
    expect(parseHostMessage(JSON.stringify(raw)).ok).toBe(false);
  });

  it('Phasen: Lobby für Figur/Einstellungen, Brett für Pause/Ende/Revanche', () => {
    expect(isIntentAllowed('lobby', 'pick-character')).toBe(true);
    expect(isIntentAllowed('lobby', 'configure')).toBe(true);
    expect(isIntentAllowed('board', 'pick-character')).toBe(false);
    expect(isIntentAllowed('board', 'configure')).toBe(false);
    for (const type of ['pause', 'resume', 'end-game', 'rematch'] as const) {
      expect(isIntentAllowed('board', type)).toBe(true);
      expect(isIntentAllowed('lobby', type)).toBe(false);
      expect(isIntentAllowed('play', type)).toBe(false);
    }
  });
});

describe('Server → Host (v4)', () => {
  it('lobby trägt Figuren und Einstellungen', () => {
    expect(parseServerToHostMessage(encode(lobby())).ok).toBe(true);
  });

  it.each([
    ['Figur doppelt', { players: lobby().players.map((p) => ({ ...p, character: 'sock' })) }],
    ['unbekannte Figur', { players: [{ ...lobby().players[0], character: 'dragon' }] }],
    [
      'Figur fehlt',
      { players: [{ slot: 1, color: '#0072B2', label: 'Blau', connected: true, ready: false }] },
    ],
    ['Einstellungen fehlen', { settings: undefined }],
    ['Vorschläge absteigend', { settings: { rounds: 5, roundPresets: [8, 5] } }],
    ['Vorschläge doppelt', { settings: { rounds: 5, roundPresets: [5, 5] } }],
    ['Vorschläge leer', { settings: { rounds: 5, roundPresets: [] } }],
    ['Runden 0', { settings: { rounds: 0, roundPresets: [3] } }],
  ])('lehnt kaputte Lobby ab: %s', (_name, patch) => {
    const raw = JSON.parse(encode(lobby())) as Record<string, unknown>;
    expect(parseServerToHostMessage(JSON.stringify({ ...raw, ...patch })).ok).toBe(false);
  });

  it('board trägt Pause, vorzeitiges Ende, Wertung mit Minispiel-Siegen und Belohnungen', () => {
    const message = createMessage('board', {
      view: view({
        gamePhase: 'minigame-results',
        ranking: null,
        endedEarly: false,
        paused: true,
        minigame: {
          id: 'wackel-floss',
          round: 3,
          seed: 1,
          playMs: 30_000,
          elapsedMs: 30_100,
          placements: [
            { slot: 1, place: 1, score: 5 },
            { slot: 2, place: 1, score: 5 },
          ],
          highlights: [],
          aborted: false,
          rewards: [
            { slot: 1, coins: 10 },
            { slot: 2, coins: 10 },
          ],
        },
      }),
      events: [
        {
          type: 'game-ended',
          ranking: view().ranking ?? [],
          endedEarly: true,
        },
      ],
      eventSeq: 0,
    });
    expect(parseServerToHostMessage(encode(message)).ok).toBe(true);
    expect(parseServerToHostMessage(encode({ ...message, view: view() })).ok).toBe(true);
  });

  it.each([
    ['paused fehlt', { paused: undefined }],
    ['endedEarly fehlt', { endedEarly: undefined }],
    ['decidedBy unbekannt', { ranking: [{ ...view().ranking?.[0], decidedBy: 'luck' }] }],
    [
      'minigameWins fehlt im Ranking',
      { ranking: [{ slot: 1, place: 1, trophies: 0, coins: 0, decidedBy: 'shared' }] },
    ],
    ['Spieler ohne Figur', { players: [{ ...view().players[0], character: undefined }] }],
    [
      'Statistik negativ',
      {
        players: [
          {
            ...view().players[0],
            stats: { coinsEarned: -1, coinsLost: 0, spacesMoved: 0, itemsUsed: 0 },
          },
        ],
      },
    ],
  ])('lehnt kaputten Brett-Stand ab: %s', (_name, patch) => {
    const message = createMessage('board', { view: view(), events: [], eventSeq: 0 });
    const raw = JSON.parse(encode(message)) as { view: Record<string, unknown> };
    expect(
      parseServerToHostMessage(JSON.stringify({ ...raw, view: { ...raw.view, ...patch } })).ok,
    ).toBe(false);
  });

  it('game-ended ohne endedEarly ist ungültig', () => {
    const message = createMessage('board', { view: view(), events: [], eventSeq: 0 });
    const raw = JSON.parse(encode(message)) as Record<string, unknown>;
    const events = [{ type: 'game-ended', ranking: view().ranking }];
    expect(parseServerToHostMessage(JSON.stringify({ ...raw, events })).ok).toBe(false);
  });

  it('minigame-result-ack: angenommen und abgelehnt mit Code', () => {
    const accepted = createMessage('minigame-result-ack', {
      minigameId: 'wackel-floss',
      round: 2,
      accepted: true,
    });
    const rejected = createMessage('minigame-result-ack', {
      minigameId: 'wackel-floss',
      round: 2,
      accepted: false,
      code: 'invalid-result',
    });
    expect(parseServerToHostMessage(encode(accepted)).ok).toBe(true);
    expect(parseServerToHostMessage(encode(rejected)).ok).toBe(true);
    expect(parseServerToControllerMessage(encode(accepted)).ok).toBe(false);
    expect(parseServerToHostMessage(encode({ ...rejected, code: 'whatever' } as never)).ok).toBe(
      false,
    );
    expect(parseServerToHostMessage(encode({ ...accepted, accepted: 'yes' } as never)).ok).toBe(
      false,
    );
  });
});

describe('Server → Controller (v4)', () => {
  it('Lobby-Kontext mit Figurenwahl', () => {
    const message = createMessage('context', {
      slot: 1,
      phase: 'lobby',
      layout: 'lobby',
      actions: ['ready', 'pick-character'],
      lobby: { character: null, takenCharacters: ['sock'], rounds: 5 },
    });
    expect(parseServerToControllerMessage(encode(message)).ok).toBe(true);
    const bad = { ...message, lobby: { character: 'dragon', takenCharacters: [], rounds: 5 } };
    expect(parseServerToControllerMessage(encode(bad as never)).ok).toBe(false);
  });

  it('Lobby-Kontext mit Besitzer-Slot vergebener Figuren (takenBy, optional)', () => {
    const lobby: ControllerLobbyInfo = {
      character: null,
      takenCharacters: ['robot', 'sock'],
      takenBy: [
        { character: 'robot', slot: 3 },
        { character: 'sock', slot: 2 },
      ],
      rounds: 10,
    };
    const message = createMessage('context', {
      slot: 1,
      phase: 'lobby',
      layout: 'lobby',
      actions: ['ready', 'pick-character'],
      lobby,
    });
    expect(parseServerToControllerMessage(encode(message)).ok).toBe(true);
    for (const takenBy of [
      [{ character: 'robot', slot: 5 }],
      [{ character: 'dragon', slot: 2 }],
      [{ character: 'robot', slot: 2, extra: true }],
    ]) {
      const bad = { ...message, lobby: { ...lobby, takenBy } };
      expect(parseServerToControllerMessage(encode(bad as never)).ok).toBe(false);
    }
  });

  it('Brett-Kontext mit Pause und Endstand (Platz, geteilt, vorzeitig)', () => {
    const message = createMessage('context', {
      slot: 2,
      phase: 'board',
      layout: 'board',
      actions: [],
      board: {
        gamePhase: 'game-results',
        round: 2,
        rounds: 5,
        coins: 7,
        trophies: 1,
        items: [],
        activeSlot: null,
        place: 1,
        paused: false,
        character: 'raccoon',
        minigameWins: 1,
        tied: true,
        endedEarly: true,
      },
    });
    expect(parseServerToControllerMessage(encode(message)).ok).toBe(true);
    const board = without(message.board ?? {}, 'paused');
    expect(parseServerToControllerMessage(encode({ ...message, board } as never)).ok).toBe(false);
  });

  it('Minispiel-Kontext verlangt tied und aborted', () => {
    const minigame = {
      id: 'wackel-floss',
      title: 'Wackel-Floß',
      tagline: 'Bleib oben!',
      instructions: ['Halte dich fest.'],
      controls: { joystick: 'Laufen', a: null, b: null },
      stage: 'results' as const,
      scoreUnit: 'Punkte',
      place: 1,
      score: 4,
      tied: true,
      aborted: false,
      reward: 10,
    };
    const message = createMessage('context', {
      slot: 1,
      phase: 'board',
      layout: 'board',
      actions: [],
      minigame,
    });
    expect(parseServerToControllerMessage(encode(message)).ok).toBe(true);
    const withoutTied = without(minigame, 'tied');
    expect(
      parseServerToControllerMessage(encode({ ...message, minigame: withoutTied } as never)).ok,
    ).toBe(false);
  });
});
