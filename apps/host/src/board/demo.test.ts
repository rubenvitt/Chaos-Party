import { getBoard, WACKELWALD, type BoardDefinition } from '@chaos-party/game-core';
import { encode, parseServerToHostMessage } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { createDemoMessages, DEMO_DELAYS_MS, DEMO_VIEW, demoStartMessage } from './demo.ts';
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

describe('Beispiel-Startstand je Brett (CHAOS-212)', () => {
  it('Wackelwald bekommt den festen Beispielstand', () => {
    expect(demoStartMessage(WACKELWALD).view).toEqual(DEMO_VIEW);
  });

  it('baut für ein anderes Brett einen gültigen Stand aus dessen Feldern', () => {
    // Anderes Brett: Wackelwald mit umbenannten Feldern (`r01` …), damit kein Feld zufällig passt.
    const rename = (id: string) => id.replace(/^s/, 'r');
    const other: BoardDefinition = {
      id: 'testbrett',
      name: 'Testbrett',
      start: rename(WACKELWALD.start),
      spaces: WACKELWALD.spaces.map((s) => ({ ...s, id: rename(s.id), next: s.next.map(rename) })),
    };
    const message = demoStartMessage(other);
    expect(parseServerToHostMessage(encode(message)).ok).toBe(true);
    const view = message.view;
    const byId = new Map(other.spaces.map((s) => [s.id, s]));
    expect(view.boardId).toBe('testbrett');
    expect(new Set(view.players.map((p) => p.spaceId)).size).toBe(4);
    for (const p of view.players) expect(byId.has(p.spaceId)).toBe(true);
    expect(byId.get(view.players[0]?.spaceId ?? '')?.next.length).toBeGreaterThanOrEqual(2);
    expect(view.prompt?.options.map((o) => o.id)).toEqual(
      byId.get(view.players[0]?.spaceId ?? '')?.next,
    );
    expect(view.trophySpaces).toHaveLength(3);
    for (const t of view.trophySpaces) expect(byId.get(t)?.kind).toBe('trophy');
    expect(view.traps).toHaveLength(1);
    expect(view.players.map((p) => p.spaceId)).not.toContain(view.traps[0]?.spaceId);
  });
});
