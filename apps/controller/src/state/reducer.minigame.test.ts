import { describe, expect, it } from 'vitest';
import {
  createMessage,
  type Action,
  type ControllerBoardInfo,
  type ControllerMinigameInfo,
  type ServerToControllerMessage,
} from '@chaos-party/protocol';
import {
  createInitialState,
  reduce,
  selectLink,
  selectScreen,
  type ControllerEvent,
  type ControllerState,
} from './reducer.ts';

/** Minispiel-Kontexte im Reducer (CHAOS-33): Stages, fehlende Elemente, Wiederverbinden. */

const TOKEN = 'tok_ABCDEFGHIJKLMNOP';

function server(message: ServerToControllerMessage, receivedAt = 0): ControllerEvent {
  return { type: 'server', message, receivedAt };
}

const welcome = createMessage('welcome', {
  sessionToken: TOKEN,
  players: [{ slot: 1, color: '#0072B2', label: 'Blau' }],
});

const joined = [
  { type: 'connect', joinCode: 'ABCD' } as const,
  { type: 'socket-open' } as const,
  server(welcome),
].reduce<ControllerState>(reduce, createInitialState());

const board: ControllerBoardInfo = {
  gamePhase: 'minigame-intro',
  round: 2,
  rounds: 5,
  coins: 4,
  trophies: 0,
  items: [],
  activeSlot: null,
  paused: false,
  character: 'robot',
  minigameWins: 0,
};

const PUMP: Omit<ControllerMinigameInfo, 'stage'> = {
  id: 'pump-parade',
  title: 'Pump-Parade',
  tagline: 'Pumpt euren Ballon am schnellsten auf!',
  instructions: ['Tippe A so oft du kannst.', 'Größter Ballon gewinnt.'],
  controls: { joystick: null, a: 'Pumpen', b: null },
  scoreUnit: 'Pumpstöße',
  tied: false,
  aborted: false,
};

/** Kontext wie `Session.boardContextFor` im Minispiel. */
function minigameContext(
  stage: ControllerMinigameInfo['stage'],
  extra: Partial<ControllerMinigameInfo> = {},
  actions: Action[] = ['button-a'],
) {
  return createMessage('context', {
    slot: 1,
    phase: 'board',
    layout: stage === 'play' ? 'joystick-buttons' : 'board',
    actions: stage === 'play' ? actions : [],
    board: { ...board, gamePhase: `minigame-${stage}` },
    minigame: { ...PUMP, stage, ...extra },
  });
}

describe('reduce – Minispiel', () => {
  it('übernimmt minigame je Stage samt Layout und Aktionen', () => {
    const intro = reduce(joined, server(minigameContext('intro')));
    expect(intro.contexts[1]).toMatchObject({
      phase: 'board',
      layout: 'board',
      actions: [],
      minigame: { id: 'pump-parade', stage: 'intro' },
    });
    const play = reduce(intro, server(minigameContext('play')));
    expect(play.contexts[1]).toMatchObject({
      layout: 'joystick-buttons',
      actions: ['button-a'],
      minigame: { stage: 'play', controls: { joystick: null, a: 'Pumpen', b: null } },
    });
    const results = reduce(play, server(minigameContext('results', { place: 2, score: 17 })));
    expect(results.contexts[1]).toMatchObject({
      layout: 'board',
      actions: [],
      minigame: { stage: 'results', place: 2, score: 17 },
    });
  });

  it('Abbruch: Ergebnis ohne place/score bleibt ohne diese Felder', () => {
    const state = reduce(joined, server(minigameContext('results')));
    const minigame = state.contexts[1]?.minigame;
    expect(minigame?.stage).toBe('results');
    expect(minigame && 'place' in minigame).toBe(false);
    expect(minigame && 'score' in minigame).toBe(false);
  });

  it('Kontext ohne minigame (Brett danach, Platzhalter) entfernt das Minispiel', () => {
    const results = reduce(joined, server(minigameContext('results', { place: 1, score: 3 })));
    const after = reduce(
      results,
      server(
        createMessage('context', {
          slot: 1,
          phase: 'board',
          layout: 'board',
          actions: [],
          board: { ...board, gamePhase: 'turn-start', activeSlot: 1 },
        }),
      ),
    );
    expect(after.contexts[1]?.minigame).toBeUndefined();
    expect(after.contexts[1]?.board?.gamePhase).toBe('turn-start');
  });

  it('Wiederverbinden mitten im Minispiel: altes Bild bleibt, neuer Kontext ersetzt es', () => {
    const playing = reduce(joined, server(minigameContext('play')));
    const lost = reduce(playing, { type: 'socket-closed' });
    // Controller bleibt sichtbar (mit Wiederverbinden-Anzeige), Minispiel-Kontext bleibt erhalten.
    expect(selectScreen(lost)).toBe('controller');
    expect(selectLink(lost).kind).toBe('reconnecting');
    expect(lost.contexts[1]?.minigame?.stage).toBe('play');

    const back = [
      { type: 'connect', joinCode: 'ABCD' } as const,
      { type: 'socket-open' } as const,
      server(welcome),
    ].reduce<ControllerState>(reduce, lost);
    expect(back.contexts[1]?.minigame?.stage).toBe('play');
    expect(selectLink(back).kind).toBe('online');

    // Inzwischen ist das Minispiel vorbei: Der Server schickt sofort das Ergebnis.
    const results = reduce(back, server(minigameContext('results', { place: 1, score: 50 })));
    expect(results.contexts[1]).toMatchObject({
      layout: 'board',
      minigame: { stage: 'results', place: 1, score: 50 },
    });
  });
});
