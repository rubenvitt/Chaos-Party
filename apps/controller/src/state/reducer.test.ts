import { describe, expect, it } from 'vitest';
import { createError, createMessage, type ServerToControllerMessage } from '@chaos-party/protocol';
import {
  createInitialState,
  reduce,
  selectCodeEntryError,
  selectLink,
  selectScreen,
  type ControllerEvent,
  type ControllerState,
} from './reducer.ts';

const TOKEN = 'tok_ABCDEFGHIJKLMNOP';

function server(message: ServerToControllerMessage, receivedAt = 0): ControllerEvent {
  return { type: 'server', message, receivedAt };
}

function run(events: ControllerEvent[], start: ControllerState = createInitialState()) {
  return events.reduce(reduce, start);
}

const welcome = createMessage('welcome', {
  sessionToken: TOKEN,
  players: [{ slot: 2, color: '#E69F00', label: 'Orange' }],
});
const lobby = createMessage('context', {
  slot: 2,
  phase: 'lobby',
  layout: 'lobby',
  actions: ['ready'],
});
const play = createMessage('context', {
  slot: 2,
  phase: 'play',
  layout: 'joystick-buttons',
  actions: ['move', 'button-a'],
});

const joined = run([
  { type: 'connect', joinCode: 'ABCD' },
  { type: 'socket-open' },
  server(welcome),
]);

describe('reduce', () => {
  it('startet ohne Code in der Code-Eingabe', () => {
    expect(selectScreen(createInitialState())).toBe('code-entry');
  });

  it('connect → connecting, welcome → controller', () => {
    const connecting = reduce(createInitialState(), { type: 'connect', joinCode: 'ABCD' });
    expect(connecting.connection).toBe('connecting');
    expect(selectScreen(connecting)).toBe('connecting');
    expect(joined.connection).toBe('open');
    expect(joined.sessionToken).toBe(TOKEN);
    expect(joined.players.map((p) => p.slot)).toEqual([2]);
    expect(selectScreen(joined)).toBe('controller');
  });

  it('übernimmt Kontexte pro Slot', () => {
    const state = run([server(lobby), server(play)], joined);
    expect(state.contexts[2]).toEqual({
      phase: 'play',
      layout: 'joystick-buttons',
      actions: ['move', 'button-a'],
    });
    expect(state.contexts[1]).toBeUndefined();
  });

  it('zählt Rückmeldungen hoch, damit gleiche Arten neu animieren', () => {
    const fb = createMessage('feedback', { slot: 2, kind: 'hit' });
    const state = run([server(fb), server(fb)], joined);
    expect(state.feedback[2]).toEqual({ kind: 'hit', id: 2 });
  });

  it('falscher Code → zurück zur Code-Eingabe mit Hinweis', () => {
    const state = run([
      { type: 'connect', joinCode: 'ZZZZ' },
      { type: 'socket-open' },
      server(createError('bad-join-code', 'x')),
    ]);
    expect(selectScreen(state)).toBe('code-entry');
    expect(selectCodeEntryError(state)).toBe('bad-join-code');
    // Das anschließende Schließen überschreibt den Grund nicht.
    const closed = reduce(state, { type: 'socket-closed' });
    expect(selectCodeEntryError(closed)).toBe('bad-join-code');
    // Neuer Versuch löscht den Hinweis.
    const retry = reduce(closed, { type: 'connect', joinCode: 'ABCD' });
    expect(selectCodeEntryError(retry)).toBeNull();
    expect(selectScreen(retry)).toBe('connecting');
  });

  it('kurze Fehler werden zum Hinweis, stille ändern nichts', () => {
    const toast = reduce(joined, server(createError('out-of-phase', 'x', 3)));
    expect(toast.notice?.code).toBe('out-of-phase');
    expect(selectScreen(toast)).toBe('controller');
    const dismissed = reduce(toast, { type: 'notice-dismissed', id: toast.notice?.id ?? -1 });
    expect(dismissed.notice).toBeNull();
    // Veralteter Dismiss lässt neueren Hinweis stehen.
    const stale = reduce(toast, { type: 'notice-dismissed', id: 999 });
    expect(stale).toBe(toast);

    expect(reduce(joined, server(createError('stale-seq', 'x', 1)))).toBe(joined);
  });

  it('blockierende Fehler zeigen die Fehlerseite', () => {
    const state = reduce(joined, server(createError('version-mismatch', 'x')));
    expect(selectScreen(state)).toBe('error');
    expect(state.fatal).toBe('version-mismatch');
  });

  it('Verbindungsverlust nach dem Beitritt: Controller bleibt, Overlay statt Fehlerseite', () => {
    const lost = reduce(joined, { type: 'socket-closed' });
    expect(lost.fatal).toBeNull();
    expect(lost.welcomed).toBe(false);
    expect(lost.sessionToken).toBe(TOKEN);
    expect(selectScreen(lost)).toBe('controller');
    expect(selectLink(lost)).toEqual({ kind: 'reconnecting', attempt: 0, hadSession: true });
    const scheduled = reduce(lost, { type: 'reconnect-scheduled', attempt: 3 });
    expect(selectLink(scheduled)).toEqual({ kind: 'reconnecting', attempt: 3, hadSession: true });
    // Gleicher Versuch erneut gemeldet: kein neuer Zustand.
    expect(reduce(scheduled, { type: 'reconnect-scheduled', attempt: 3 })).toBe(scheduled);
    expect(reduce(lost, { type: 'socket-closed' })).toBe(lost);

    // Vor dem ersten Beitritt bleibt es beim Verbinden-Bildschirm.
    const failed = run([
      { type: 'connect', joinCode: 'ABCD' },
      { type: 'socket-closed' },
      { type: 'reconnect-scheduled', attempt: 1 },
    ]);
    expect(selectScreen(failed)).toBe('connecting');
    expect(selectLink(failed)).toEqual({ kind: 'reconnecting', attempt: 1, hadSession: false });
  });

  it('welcome beendet das Wiederverbinden', () => {
    const state = run(
      [
        { type: 'socket-closed' },
        { type: 'reconnect-scheduled', attempt: 2 },
        { type: 'connect', joinCode: 'ABCD' },
        { type: 'socket-open' },
        server(welcome),
      ],
      joined,
    );
    expect(state.attempt).toBe(0);
    expect(selectLink(state)).toEqual({ kind: 'online', rttMs: null });
  });

  it('Aufgeben zeigt den Grund als Fehlerseite', () => {
    const state = run(
      [
        { type: 'reconnect-scheduled', attempt: 4 },
        { type: 'gave-up', reason: 'replaced' },
      ],
      joined,
    );
    expect(state.fatal).toBe('replaced');
    expect(state.attempt).toBe(0);
    expect(selectScreen(state)).toBe('error');
    expect(selectLink(state)).toEqual({ kind: 'hidden' });
  });

  it('Verbindungsanzeige: verborgen ohne Code, verbinden beim ersten Aufbau, online mit Rundlaufzeit', () => {
    expect(selectLink(createInitialState())).toEqual({ kind: 'hidden' });
    expect(selectLink(reduce(createInitialState(), { type: 'connect', joinCode: 'ABCD' }))).toEqual(
      {
        kind: 'connecting',
      },
    );
    const withRtt = reduce(joined, server(createMessage('heartbeat-ack', { t: 10 }), 25));
    expect(selectLink(withRtt)).toEqual({ kind: 'online', rttMs: 15 });
  });

  it('Wiederverbinden mit gleichem Code behält Spieler und Kontext bis zum neuen welcome', () => {
    const playing = reduce(joined, server(play));
    const lost = reduce(playing, { type: 'socket-closed' });
    const again = reduce(lost, { type: 'connect', joinCode: 'ABCD' });
    expect(again.fatal).toBeNull();
    expect(again.contexts[2]?.layout).toBe('joystick-buttons');
    expect(selectScreen(again)).toBe('controller');
    expect(selectLink(again)).toMatchObject({ kind: 'reconnecting' });

    const other = reduce(lost, { type: 'connect', joinCode: 'WXYZ' });
    expect(other.players).toEqual([]);
    expect(other.contexts).toEqual({});
  });

  it('Neubeitritt mit anderem Slot verwirft Kontexte fremder Slots', () => {
    const playing = run(
      [server(play), server(createMessage('feedback', { slot: 2, kind: 'hit' }))],
      joined,
    );
    const rejoined = reduce(
      playing,
      server(
        createMessage('welcome', {
          sessionToken: 'tok_NEU_ABCDEFGHIJKL',
          players: [{ slot: 1, color: '#0072B2', label: 'Blau' }],
        }),
      ),
    );
    expect(rejoined.contexts).toEqual({});
    expect(rejoined.feedback).toEqual({});
    // Gleicher Slot: Kontext bleibt bis zum neuen `context`.
    expect(reduce(playing, server(welcome)).contexts[2]?.layout).toBe('joystick-buttons');
  });

  it('misst die Rundlaufzeit aus heartbeat-ack', () => {
    const state = reduce(joined, server(createMessage('heartbeat-ack', { t: 1000 }), 1042));
    expect(state.rttMs).toBe(42);
    // Uhrsprung (negativ) wird ignoriert.
    expect(reduce(state, server(createMessage('heartbeat-ack', { t: 5000 }), 10)).rttMs).toBe(42);
  });
});
