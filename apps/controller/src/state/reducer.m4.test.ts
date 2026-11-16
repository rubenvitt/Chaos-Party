import { describe, expect, it } from 'vitest';
import {
  createError,
  createMessage,
  type ControllerBoardInfo,
  type ControllerLobbyInfo,
  type ControllerMinigameInfo,
  type PromptInfo,
  type ServerToControllerMessage,
  type SlotNumber,
} from '@chaos-party/protocol';
import { describeLobby } from '../lobby/view.ts';
import {
  createInitialState,
  PICK_SEQ_MEMORY,
  reduce,
  selectLink,
  selectScreen,
  type ControllerEvent,
  type ControllerState,
} from './reducer.ts';
import { describeSlotScreen, type SlotScreen } from './screen.ts';

/**
 * M4 im Reducer (CHAOS-36/37/38): Lobby-Kontext mit Figuren, vorgemerkte Figurenwahl,
 * Bildschirmwahl je Phase und Wiederherstellen nach Verbindungsverlust oder Neuladen.
 */

const TOKEN = 'tok_ABCDEFGHIJKLMNOP';
const PLAYERS = [
  { slot: 1 as const, color: '#0072B2', label: 'Blau' },
  { slot: 2 as const, color: '#E69F00', label: 'Orange' },
];

function server(message: ServerToControllerMessage, receivedAt = 0): ControllerEvent {
  return { type: 'server', message, receivedAt };
}

function run(events: ControllerEvent[], start: ControllerState = createInitialState()) {
  return events.reduce(reduce, start);
}

const welcome = (players = PLAYERS) =>
  server(createMessage('welcome', { sessionToken: TOKEN, players }));

function joined(players = PLAYERS): ControllerState {
  return run([{ type: 'connect', joinCode: 'ABCD' }, { type: 'socket-open' }, welcome(players)]);
}

function lobbyMessage(
  slot: SlotNumber,
  lobby: Partial<ControllerLobbyInfo> = {},
  ready = false,
): ServerToControllerMessage {
  return createMessage('context', {
    slot,
    phase: 'lobby',
    layout: ready ? 'wait' : 'lobby',
    actions: ready ? ['pick-character'] : ['ready', 'pick-character'],
    lobby: { character: null, takenCharacters: [], rounds: 5, ...lobby },
  });
}

function board(extra: Partial<ControllerBoardInfo> = {}): ControllerBoardInfo {
  return {
    gamePhase: 'roll',
    round: 2,
    rounds: 5,
    coins: 12,
    trophies: 1,
    items: [],
    activeSlot: 1,
    paused: false,
    character: 'robot',
    minigameWins: 0,
    ...extra,
  };
}

const ROLL: PromptInfo = {
  id: 7,
  slot: 1,
  kind: 'roll',
  title: 'Du bist dran!',
  options: [{ id: 'roll', label: 'Würfeln!' }],
  remainingMs: null,
};

const REACTION: PromptInfo = {
  id: 9,
  slot: 1,
  kind: 'reaction',
  title: 'Münzklau! Schnell!',
  options: [{ id: 'shield', label: 'Schild!' }],
  remainingMs: 2400,
};

const MINIGAME: ControllerMinigameInfo = {
  id: 'pump-parade',
  title: 'Pump-Parade',
  tagline: 'Pump um die Wette!',
  instructions: ['Drück A so schnell du kannst.'],
  controls: { joystick: null, a: 'Pumpen', b: null },
  stage: 'intro',
  scoreUnit: 'Pumpstöße',
  tied: false,
  aborted: false,
};

/** Kontext-Nachrichten je Phase für Slot 1, wie der Server sie nach `welcome` schickt. */
const PHASES: [string, ServerToControllerMessage, SlotScreen][] = [
  [
    'Lobby mit Figur',
    lobbyMessage(1, { character: 'cactus', takenCharacters: ['robot'] }),
    'lobby',
  ],
  ['Lobby bereit', lobbyMessage(1, { character: 'cactus' }, true), 'lobby'],
  [
    'eigener Zug',
    createMessage('context', {
      slot: 1,
      phase: 'board',
      layout: 'board',
      actions: ['choose'],
      board: board(),
      prompt: ROLL,
    }),
    'board',
  ],
  [
    'Reaktionsfenster',
    createMessage('context', {
      slot: 1,
      phase: 'board',
      layout: 'board',
      actions: ['choose'],
      board: board({ gamePhase: 'reaction-window', activeSlot: 2 }),
      prompt: REACTION,
    }),
    'board',
  ],
  [
    'Minispiel-Anleitung',
    createMessage('context', {
      slot: 1,
      phase: 'board',
      layout: 'board',
      actions: [],
      board: board({ gamePhase: 'minigame-intro', activeSlot: null }),
      minigame: MINIGAME,
    }),
    'minigame',
  ],
  [
    'Minispiel läuft',
    createMessage('context', {
      slot: 1,
      phase: 'board',
      layout: 'joystick-buttons',
      actions: ['button-a'],
      board: board({ gamePhase: 'minigame-play', activeSlot: null }),
      minigame: { ...MINIGAME, stage: 'play' },
    }),
    'play',
  ],
  [
    'Minispiel-Ergebnis',
    createMessage('context', {
      slot: 1,
      phase: 'board',
      layout: 'board',
      actions: [],
      board: board({ gamePhase: 'minigame-results', activeSlot: null }),
      minigame: { ...MINIGAME, stage: 'results', place: 1, tied: true, reward: 5 },
    }),
    'minigame',
  ],
  [
    'Pause im Minispiel',
    createMessage('context', {
      slot: 1,
      phase: 'board',
      layout: 'board',
      actions: [],
      board: board({ gamePhase: 'minigame-play', activeSlot: null, paused: true }),
      minigame: { ...MINIGAME, stage: 'play' },
    }),
    'pause',
  ],
  [
    'Pause im Zug',
    createMessage('context', {
      slot: 1,
      phase: 'board',
      layout: 'board',
      actions: [],
      board: board({ paused: true }),
    }),
    'pause',
  ],
  [
    'Endstand',
    createMessage('context', {
      slot: 1,
      phase: 'board',
      layout: 'board',
      actions: [],
      board: board({
        gamePhase: 'game-results',
        activeSlot: null,
        place: 2,
        tied: true,
        endedEarly: true,
      }),
    }),
    'final',
  ],
];

describe('Lobby-Kontext mit Charakterwahl', () => {
  it('übernimmt `lobby` in den Slot-Kontext', () => {
    const state = run([server(lobbyMessage(1, { character: 'sock', rounds: 8 }))], joined());
    expect(state.contexts[1]?.lobby).toEqual({ character: 'sock', takenCharacters: [], rounds: 8 });
    expect(describeSlotScreen(state.contexts[1])).toBe('lobby');
  });

  it('ein Kontext ohne `lobby` ersetzt den alten vollständig (keine alte Figur)', () => {
    const state = run(
      [
        server(lobbyMessage(1, { character: 'sock' })),
        server(
          createMessage('context', {
            slot: 1,
            phase: 'lobby',
            layout: 'lobby',
            actions: ['ready'],
          }),
        ),
      ],
      joined(),
    );
    expect(state.contexts[1]?.lobby).toBeUndefined();
    expect(describeSlotScreen(state.contexts[1])).toBe('lobby-basic');
  });
});

describe('vorgemerkte Figurenwahl', () => {
  const lobbyState = run([server(lobbyMessage(1)), server(lobbyMessage(2))], joined());

  it('pick-sent merkt vor; Bestätigung durch den Kontext löst sie', () => {
    const sent = reduce(lobbyState, { type: 'pick-sent', slot: 1, character: 'raccoon' });
    expect(sent.picks).toEqual({ 1: 'raccoon' });
    expect(describeLobby(sent.contexts[1], sent.picks[1])?.character).toBe('raccoon');
    // Ein Kontext für einen anderen Slot ändert nichts.
    const other = reduce(sent, server(lobbyMessage(2, { takenCharacters: ['raccoon'] })));
    expect(other.picks).toEqual({ 1: 'raccoon' });
    const confirmed = reduce(other, server(lobbyMessage(1, { character: 'raccoon' })));
    expect(confirmed.picks).toEqual({});
  });

  it('überholt: Figur ist inzwischen vergeben → Vormerkung weg', () => {
    const sent = reduce(lobbyState, { type: 'pick-sent', slot: 1, character: 'raccoon' });
    const lost = reduce(sent, server(lobbyMessage(1, { takenCharacters: ['raccoon'] })));
    expect(lost.picks).toEqual({});
  });

  it('ein unbeteiligter Lobby-Kontext (jemand anderes wählt) lässt die Vormerkung stehen', () => {
    const sent = reduce(lobbyState, { type: 'pick-sent', slot: 1, character: 'raccoon' });
    const unrelated = reduce(sent, server(lobbyMessage(1, { takenCharacters: ['sock'] })));
    expect(unrelated.picks).toEqual({ 1: 'raccoon' });
  });

  it('`character-taken` (Toast) und stille Fehler lösen jede Vormerkung', () => {
    const sent = reduce(lobbyState, { type: 'pick-sent', slot: 1, character: 'raccoon' });
    const taken = reduce(sent, server(createError('character-taken', 'vergeben', 4)));
    expect(taken.picks).toEqual({});
    expect(taken.notice?.code).toBe('character-taken');
    const stale = reduce(sent, server(createError('stale-seq', 'alt', 4)));
    expect(stale.picks).toEqual({});
    expect(stale.notice).toBeNull();
  });

  it('`character-taken` nennt die Zone der einzigen Vormerkung (iPad-Hinweis, CHAOS-40)', () => {
    const one = reduce(lobbyState, { type: 'pick-sent', slot: 2, character: 'sock' });
    expect(reduce(one, server(createError('character-taken', 'vergeben', 4))).notice).toEqual({
      code: 'character-taken',
      id: expect.any(Number) as number,
      slot: 2,
    });
    // Zwei Zonen wählen gleichzeitig, ohne bekannte `seq`: unklar → Hinweis ohne Zone (mittig).
    const two = reduce(one, { type: 'pick-sent', slot: 1, character: 'robot' });
    const notice = reduce(two, server(createError('character-taken', 'vergeben', 5))).notice;
    expect(notice?.code).toBe('character-taken');
    expect(notice?.slot).toBeUndefined();
  });

  it('`character-taken` findet die Zone über die `seq`, auch wenn der Kontext schon kam', () => {
    let state = reduce(lobbyState, { type: 'pick-sent', slot: 1, character: 'robot', seq: 7 });
    state = reduce(state, { type: 'pick-sent', slot: 2, character: 'sock', seq: 8 });
    // Kontext überholt Zone 1 (Schraubi vergeben) noch vor der Ablehnung.
    state = reduce(state, server(lobbyMessage(1, { takenCharacters: ['robot'] })));
    expect(state.picks).toEqual({ 2: 'sock' });
    const taken = reduce(state, server(createError('character-taken', 'vergeben', 7)));
    expect(taken.notice?.slot).toBe(1);
    // Speicher ist begrenzt und wird bei neuer Verbindung geleert.
    for (let seq = 10; seq < 30; seq++) {
      state = reduce(state, { type: 'pick-sent', slot: 2, character: 'sock', seq });
    }
    expect(state.pickSeqs).toHaveLength(PICK_SEQ_MEMORY);
    expect(reduce(state, welcome()).pickSeqs).toEqual([]);
  });

  it('Verbindungsverlust und neues `welcome` lösen die Vormerkung', () => {
    const sent = reduce(lobbyState, { type: 'pick-sent', slot: 2, character: 'sock' });
    expect(reduce(sent, { type: 'socket-closed' }).picks).toEqual({});
    expect(reduce(sent, welcome()).picks).toEqual({});
  });

  it('außerhalb der Lobby oder für die schon eigene Figur: nichts vormerken', () => {
    const own = run([server(lobbyMessage(1, { character: 'robot' }))], joined());
    expect(reduce(own, { type: 'pick-sent', slot: 1, character: 'robot' }).picks).toEqual({});
    const inBoard = run(
      [
        server(
          createMessage('context', {
            slot: 1,
            phase: 'board',
            layout: 'board',
            actions: [],
            board: board(),
          }),
        ),
      ],
      joined(),
    );
    expect(reduce(inBoard, { type: 'pick-sent', slot: 1, character: 'sock' }).picks).toEqual({});
  });

  it('Spielstart (Brett-Kontext) löst eine offene Vormerkung', () => {
    const sent = reduce(lobbyState, { type: 'pick-sent', slot: 1, character: 'raccoon' });
    const started = reduce(
      sent,
      server(
        createMessage('context', {
          slot: 1,
          phase: 'board',
          layout: 'board',
          actions: [],
          board: board({ character: 'robot' }),
        }),
      ),
    );
    expect(started.picks).toEqual({});
  });
});

describe('Bildschirm je Phase und Wiederherstellen (ADR-009, CHAOS-38)', () => {
  for (const [name, message, screen] of PHASES) {
    it(`${name}: Kontext → ${screen}; nach Verbindungsverlust bleibt er, nach Neuladen kommt er zurück`, () => {
      const live = run([server(message, 1000)], joined());
      expect(describeSlotScreen(live.contexts[1])).toBe(screen);

      // Verbindung weg: Bild bleibt stehen, darüber die Wiederverbinden-Anzeige.
      const lost = reduce(live, { type: 'socket-closed' });
      expect(selectScreen(lost)).toBe('controller');
      expect(selectLink(lost).kind).toBe('reconnecting');
      expect(describeSlotScreen(lost.contexts[1])).toBe(screen);

      // Automatisch wieder verbunden: `welcome` behält den Kontext bis zum neuen.
      const back = run(
        [{ type: 'connect', joinCode: 'ABCD' }, { type: 'socket-open' }, welcome()],
        lost,
      );
      expect(describeSlotScreen(back.contexts[1])).toBe(screen);

      // Neuladen: frischer Zustand, der Server schickt `welcome` + Kontext erneut.
      const reloaded = run(
        [
          { type: 'connect', joinCode: 'ABCD' },
          { type: 'socket-open' },
          welcome(),
          server(message, 50),
        ],
        createInitialState('ABCD'),
      );
      expect(selectScreen(reloaded)).toBe('controller');
      expect(describeSlotScreen(reloaded.contexts[1])).toBe(screen);
      expect(reloaded.contexts[1]).toEqual(
        // Gleicher Inhalt wie vorher; nur die lokale Frist rechnet ab dem neuen Empfang.
        expect.objectContaining({
          phase: live.contexts[1]?.phase,
          layout: live.contexts[1]?.layout,
        }),
      );
    });
  }

  it('Reaktionsfenster nach Neuladen: Restzeit läuft ab dem neuen Empfang (`remainingMs`)', () => {
    const [, reaction] = PHASES.find(([name]) => name === 'Reaktionsfenster') ?? [];
    if (!reaction) throw new Error('Phase fehlt');
    const reloaded = run(
      [
        { type: 'connect', joinCode: 'ABCD' },
        { type: 'socket-open' },
        welcome(),
        server(reaction, 5000),
      ],
      createInitialState('ABCD'),
    );
    expect(reloaded.contexts[1]?.prompt?.deadlineAt).toBe(5000 + 2400);
  });

  it('Endstand nach Neuladen: geteilter Platz und vorzeitiges Ende bleiben', () => {
    const [, final] = PHASES.find(([name]) => name === 'Endstand') ?? [];
    if (!final) throw new Error('Phase fehlt');
    const reloaded = run([welcome(), server(final)], createInitialState('ABCD'));
    expect(reloaded.contexts[1]?.board).toMatchObject({ place: 2, tied: true, endedEarly: true });
  });

  it('Revanche: vom Endstand zurück in die Lobby, Figur bleibt, „bereit“ zurückgesetzt', () => {
    const [, final] = PHASES.find(([name]) => name === 'Endstand') ?? [];
    if (!final) throw new Error('Phase fehlt');
    const state = run(
      [server(final), server(lobbyMessage(1, { character: 'robot', takenCharacters: ['cactus'] }))],
      joined(),
    );
    const view = describeLobby(state.contexts[1], state.picks[1]);
    expect(describeSlotScreen(state.contexts[1])).toBe('lobby');
    expect(view).toMatchObject({ character: 'robot', ready: false, canReady: true });
  });

  it('geteiltes iPad: jede Zone bekommt ihren eigenen Bildschirm zurück', () => {
    const [, final] = PHASES.find(([name]) => name === 'Endstand') ?? [];
    const [, pause] = PHASES.find(([name]) => name === 'Pause im Zug') ?? [];
    if (!final || !pause || final.type !== 'context' || pause.type !== 'context') {
      throw new Error('Phase fehlt');
    }
    const reloaded = run(
      [welcome(), server({ ...pause, slot: 1 }), server({ ...final, slot: 2 })],
      createInitialState('ABCD'),
    );
    expect(describeSlotScreen(reloaded.contexts[1])).toBe('pause');
    expect(describeSlotScreen(reloaded.contexts[2])).toBe('final');
  });
});

describe('describeSlotScreen: Vorrang', () => {
  it('ohne Kontext warten; Lobby ohne Charakterwahl = nur Bereit; M1-Arena = Spiel', () => {
    expect(describeSlotScreen(undefined)).toBe('wait');
    expect(describeSlotScreen({ phase: 'lobby', layout: 'wait', actions: [] })).toBe('wait');
    expect(
      describeSlotScreen({ phase: 'play', layout: 'joystick-buttons', actions: ['move'] }),
    ).toBe('play');
    expect(describeSlotScreen({ phase: 'board', layout: 'wait', actions: [] })).toBe('wait');
  });

  it('Pause schlägt Minispiel und Endstand; Endstand schlägt Warten', () => {
    expect(
      describeSlotScreen({
        phase: 'board',
        layout: 'board',
        actions: [],
        board: board({ gamePhase: 'game-results', paused: true }),
      }),
    ).toBe('pause');
    expect(
      describeSlotScreen({
        phase: 'board',
        layout: 'board',
        actions: [],
        board: board({ gamePhase: 'game-results', activeSlot: null }),
      }),
    ).toBe('final');
  });
});
