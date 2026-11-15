import { getBoard } from '@chaos-party/game-core';
import { encode, parseServerToHostMessage } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { createDemoMessages, DEMO_DELAYS_MS, DEMO_VIEW } from './demo.ts';
import { createBoardDirector } from './director.ts';

describe('Demo-Spielstand', () => {
  const messages = createDemoMessages();

  it('besteht nur aus gültigen board-Nachrichten mit lückenloser eventSeq', () => {
    let next = 0;
    for (const message of messages) {
      const parsed = parseServerToHostMessage(encode(message));
      expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
      expect(message.eventSeq).toBe(next);
      next += message.events.length;
    }
    expect(DEMO_DELAYS_MS).toHaveLength(messages.length);
  });

  it('zeigt vier Spieler auf verschiedenen Feldern des Wackelwalds, Falle und aktive Trophäen', () => {
    const board = getBoard(DEMO_VIEW.boardId);
    expect(board).toBeDefined();
    const ids = new Set(board?.spaces.map((s) => s.id));
    expect(DEMO_VIEW.players).toHaveLength(4);
    expect(new Set(DEMO_VIEW.players.map((p) => p.spaceId)).size).toBe(4);
    for (const message of messages) {
      for (const p of message.view.players) expect(ids.has(p.spaceId)).toBe(true);
      for (const t of message.view.traps) expect(ids.has(t.spaceId)).toBe(true);
      for (const t of message.view.trophySpaces)
        expect(board?.spaces.find((s) => s.id === t)?.kind).toBe('trophy');
    }
    expect(DEMO_VIEW.traps).toHaveLength(1);
    // Wie DEFAULT_RULES (EXP-002): drei Trophäen gleichzeitig aktiv.
    expect(DEMO_VIEW.trophySpaces).toHaveLength(3);
  });

  it('läuft durch die Regie bis zum letzten Stand', () => {
    const director = createBoardDirector();
    for (const message of messages) {
      director.receive(message);
      director.advance(10_000);
    }
    expect(director.animating).toBe(false);
    expect(director.getHud().view).toEqual(messages.at(-1)?.view);
    expect(director.getPawnSpaces()).toEqual({ 1: 's10', 2: 's21', 3: 's40', 4: 's42' });
    expect(director.stats.jumps).toBe(1);
  });
});
