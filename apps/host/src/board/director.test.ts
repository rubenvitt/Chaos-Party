import {
  createMessage,
  type BoardEvent,
  type BoardMessage,
  type BoardView,
} from '@chaos-party/protocol';
import { describe, expect, it, vi } from 'vitest';
import { POPUP_MS } from './animation.ts';
import { DEMO_VIEW } from './demo.ts';
import { createBoardDirector, MESSAGE_MS } from './director.ts';

const STEP = DEMO_VIEW.stepMs;

function msg(view: BoardView, events: BoardEvent[], eventSeq: number): BoardMessage {
  return createMessage('board', { view, events, eventSeq });
}

function moveBlue(view: BoardView, spaceId: string): BoardView {
  return {
    ...view,
    players: view.players.map((p) => (p.slot === 1 ? { ...p, spaceId } : p)),
  };
}

/** Regie mit Startstand (Sprung bei der ersten Nachricht). */
function started() {
  const director = createBoardDirector();
  director.receive(msg(DEMO_VIEW, [], 0));
  return director;
}

describe('createBoardDirector', () => {
  it('springt bei der ersten Nachricht ohne Animation auf den Stand', () => {
    const director = createBoardDirector();
    expect(director.getHud().view).toBeNull();
    director.receive(
      msg(moveBlue(DEMO_VIEW, 's10'), [{ type: 'moved', slot: 1, path: ['s08', 's09', 's10'] }], 4),
    );
    expect(director.animating).toBe(false);
    expect(director.getPawnSpaces()[1]).toBe('s10');
    expect(director.stats).toEqual({ received: 1, eventsProcessed: 1, nextEventSeq: 5, jumps: 1 });
    expect(director.getHud().view?.gamePhase).toBe('choose-path');
  });

  it('spielt moved Feld für Feld im Takt stepMs und übernimmt dann den Stand', () => {
    const director = started();
    const after = { ...moveBlue(DEMO_VIEW, 's10'), gamePhase: 'turn-end' as const, prompt: null };
    director.receive(msg(after, [{ type: 'moved', slot: 1, path: ['s08', 's09', 's10'] }], 0));

    expect(director.animating).toBe(true);
    // Stand wartet, bis die Animation fertig ist.
    expect(director.getHud().view?.gamePhase).toBe('choose-path');
    let pawn = director.getFrame().pawns.find((p) => p.slot === 1);
    expect(pawn?.hop).toEqual({ from: 's07', to: 's08', t: 0 });

    director.advance(STEP / 2);
    pawn = director.getFrame().pawns.find((p) => p.slot === 1);
    expect(pawn?.hop?.from).toBe('s07');
    expect(pawn?.hop?.t).toBeGreaterThan(0.5);

    director.advance(STEP);
    pawn = director.getFrame().pawns.find((p) => p.slot === 1);
    expect(pawn?.hop).toMatchObject({ from: 's08', to: 's09' });
    expect(director.getPawnSpaces()[1]).toBe('s08');

    director.advance(STEP * 2);
    expect(director.animating).toBe(false);
    pawn = director.getFrame().pawns.find((p) => p.slot === 1);
    expect(pawn).toMatchObject({ spaceId: 's10', hop: null });
    expect(director.getHud().view?.gamePhase).toBe('turn-end');
    expect(director.stats.eventsProcessed).toBe(1);
  });

  it('verwirft bereits gesehene Ereignisse und ignoriert veraltete Nachrichten', () => {
    const director = started();
    const events: BoardEvent[] = [
      { type: 'dice-rolled', slot: 1, faces: [3], total: 3 },
      { type: 'turn-ended', slot: 1 },
    ];
    director.receive(msg(DEMO_VIEW, events, 0));
    director.advance(5000);
    expect(director.stats.nextEventSeq).toBe(2);
    expect(director.stats.eventsProcessed).toBe(2);

    // Überlappend: Ereignis 1 kennen wir, 2 ist neu.
    director.receive(
      msg(
        DEMO_VIEW,
        [
          { type: 'turn-ended', slot: 1 },
          { type: 'turn-started', slot: 2, round: 2 },
        ],
        1,
      ),
    );
    director.advance(10);
    expect(director.stats).toMatchObject({ nextEventSeq: 3, eventsProcessed: 3, jumps: 1 });

    // Veraltet (endet vor dem Gezeigten): ändert nichts, auch nicht den Stand.
    const stale = { ...DEMO_VIEW, round: 1 };
    director.receive(msg(stale, [{ type: 'turn-ended', slot: 1 }], 1));
    expect(director.stats.received).toBe(3);
    expect(director.getHud().view?.round).toBe(2);
  });

  it('springt bei einer Lücke in eventSeq und verwirft die Warteschlange', () => {
    const director = started();
    director.receive(
      msg(moveBlue(DEMO_VIEW, 's10'), [{ type: 'moved', slot: 1, path: ['s08', 's09', 's10'] }], 0),
    );
    expect(director.animating).toBe(true);
    const later = { ...moveBlue(DEMO_VIEW, 's13'), round: 3 };
    director.receive(msg(later, [{ type: 'turn-ended', slot: 1 }], 7));
    expect(director.animating).toBe(false);
    expect(director.getPawnSpaces()[1]).toBe('s13');
    expect(director.getHud().view?.round).toBe(3);
    expect(director.stats).toMatchObject({ nextEventSeq: 8, jumps: 2 });
  });

  it('übernimmt Nachrichten ohne Ereignisse sofort', () => {
    const director = started();
    director.receive(msg({ ...DEMO_VIEW, gamePhase: 'turn-start' }, [], 0));
    expect(director.getHud().view?.gamePhase).toBe('turn-start');
  });

  it('zeigt Münzen aus coins-changed schon während der Animation', () => {
    const director = started();
    const after = {
      ...DEMO_VIEW,
      players: DEMO_VIEW.players.map((p) => (p.slot === 1 ? { ...p, coins: 15, trophies: 2 } : p)),
    };
    director.receive(
      msg(
        after,
        [
          { type: 'coins-changed', slot: 1, delta: 3, balance: 15, reason: 'space' },
          { type: 'trophy-bought', slot: 1, spaceId: 's24' },
        ],
        0,
      ),
    );
    const hud = director.getHud();
    expect(hud.view?.players.find((p) => p.slot === 1)?.coins).toBe(15);
    expect(hud.view?.players.find((p) => p.slot === 1)?.trophies).toBe(1);
    expect(hud.messages.map((m) => m.text)).toEqual(['Blau bekommt 3 Münzen']);
    expect(director.getFrame().popups).toEqual([
      expect.objectContaining({ kind: 'coins', slot: 1, text: '+3', tone: 'good' }),
    ]);
    director.advance(3000);
    expect(director.getHud().view?.players.find((p) => p.slot === 1)?.trophies).toBe(2);
    expect(director.getHud().messages.map((m) => m.text)).toEqual([
      'Blau bekommt 3 Münzen',
      'Blau kauft eine Trophäe!',
    ]);
  });

  it('lässt Popups und Meldungen nach ihrer Zeit verschwinden', () => {
    const director = started();
    director.receive(
      msg(DEMO_VIEW, [{ type: 'dice-rolled', slot: 1, faces: [2, 5], total: 7 }], 0),
    );
    expect(director.getHud().messages.map((m) => m.text)).toEqual(['Blau würfelt 2 + 5 = 7!']);
    expect(director.getFrame().popups[0]).toMatchObject({ kind: 'dice', text: '7', progress: 0 });
    director.advance(POPUP_MS / 2);
    expect(director.getFrame().popups[0]?.progress).toBeCloseTo(0.5);
    director.advance(POPUP_MS);
    expect(director.getFrame().popups).toEqual([]);
    director.advance(MESSAGE_MS);
    expect(director.getHud().messages).toEqual([]);
  });

  it('zählt den Reaktions-Countdown ab Empfang herunter', () => {
    const director = started();
    const view: BoardView = {
      ...DEMO_VIEW,
      gamePhase: 'reaction-window',
      prompt: {
        id: 9,
        slot: 4,
        kind: 'reaction',
        title: 'Achtung!',
        options: [{ id: 'brace', label: 'Festhalten!' }],
        remainingMs: 3000,
      },
    };
    director.receive(msg(view, [], 0));
    expect(director.getHud().promptSeconds).toBe(3);
    director.advance(1000);
    expect(director.getHud().promptSeconds).toBe(2);
    director.advance(1500);
    expect(director.getHud().promptSeconds).toBe(1);
    director.advance(5000);
    expect(director.getHud().promptSeconds).toBe(0);
  });

  it('Pause (v4): Countdown steht still, solange der Stand pausiert ist', () => {
    const director = started();
    const view: BoardView = {
      ...DEMO_VIEW,
      gamePhase: 'reaction-window',
      paused: true,
      prompt: {
        id: 9,
        slot: 4,
        kind: 'reaction',
        title: 'Achtung!',
        options: [{ id: 'brace', label: 'Festhalten!' }],
        remainingMs: 2400,
      },
    };
    director.receive(msg(view, [], 0));
    director.advance(10_000);
    expect(director.getHud().promptSeconds).toBe(3);
    // Fortsetzen: neuer Stand, Restzeit läuft ab Empfang.
    director.receive(msg({ ...view, paused: false }, [], 0));
    director.advance(1000);
    expect(director.getHud().promptSeconds).toBe(2);
  });

  it('Figuren je Slot aus dem Stand (gewählte Figur, v4)', () => {
    const director = createBoardDirector();
    director.receive(
      msg(
        {
          ...DEMO_VIEW,
          players: DEMO_VIEW.players.map((p) =>
            p.slot === 1
              ? { ...p, character: 'sock' }
              : p.slot === 4
                ? { ...p, character: 'robot' }
                : p,
          ),
        },
        [],
        0,
      ),
    );
    expect(director.getFrame().pawns.map((p) => p.character)).toEqual([
      'sock',
      'cactus',
      'raccoon',
      'robot',
    ]);
  });

  it('meldet HUD-Änderungen, aber nicht bei jedem Frame', () => {
    const director = started();
    const listener = vi.fn();
    director.subscribe(listener);
    const before = director.getHud();
    director.advance(16);
    director.advance(16);
    expect(listener).not.toHaveBeenCalled();
    expect(director.getHud()).toBe(before);
    director.receive(msg({ ...DEMO_VIEW, round: 3 }, [], 0));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(director.getHud()).not.toBe(before);
  });

  it('spielt bei Rückstand schneller und springt bei großem Rückstand', () => {
    const director = createBoardDirector({ catchUpMs: 1000, jumpMs: 4000 });
    director.receive(msg(DEMO_VIEW, [], 0));
    const path = ['s08', 's09', 's10', 's11', 's12'];
    director.receive(msg(moveBlue(DEMO_VIEW, 's12'), [{ type: 'moved', slot: 1, path }], 0));
    // 5 × 320 ms = 1600 ms Rückstand > 1000 → dreifach: nach 400 ms schon 1200 ms gespielt.
    director.advance(400);
    expect(director.getPawnSpaces()[1]).toBe('s10');

    const long = Array.from({ length: 20 }, (): BoardEvent => ({
      type: 'dice-rolled',
      slot: 2,
      faces: [1],
      total: 1,
    }));
    director.receive(msg(DEMO_VIEW, long, 1));
    director.advance(16);
    expect(director.animating).toBe(false);
    expect(director.stats.jumps).toBe(2);
    expect(director.getPawnSpaces()[1]).toBe('s07');
  });

  it('settle spielt alles sofort ab', () => {
    const director = started();
    director.receive(
      msg(moveBlue(DEMO_VIEW, 's10'), [{ type: 'moved', slot: 1, path: ['s08', 's09', 's10'] }], 0),
    );
    director.settle();
    expect(director.animating).toBe(false);
    expect(director.getPawnSpaces()[1]).toBe('s10');
    expect(director.stats.eventsProcessed).toBe(1);
  });

  it('merkt sich Minispiel-Platzierung und Gewinne bis zum Ende der Minispiel-Phasen', () => {
    const director = started();
    director.receive(
      msg(
        { ...DEMO_VIEW, gamePhase: 'minigame-intro', activeSlot: null, prompt: null },
        [{ type: 'minigame-started', minigame: 'placeholder' }],
        0,
      ),
    );
    expect(director.getHud().minigame).toEqual({ ranking: [], rewards: {} });
    director.receive(
      msg(
        { ...DEMO_VIEW, gamePhase: 'minigame-results', activeSlot: null, prompt: null },
        [
          {
            type: 'minigame-results',
            ranking: [3, 1, 2, 4],
            placements: [
              { slot: 3, place: 1, score: 0 },
              { slot: 1, place: 2, score: 0 },
              { slot: 2, place: 3, score: 0 },
              { slot: 4, place: 4, score: 0 },
            ],
            aborted: false,
          },
          { type: 'coins-changed', slot: 3, delta: 10, balance: 28, reason: 'minigame' },
        ],
        1,
      ),
    );
    director.advance(2000);
    expect(director.getHud().minigame).toEqual({ ranking: [3, 1, 2, 4], rewards: { 3: 10 } });
    director.receive(msg({ ...DEMO_VIEW, gamePhase: 'round-end' }, [], 3));
    expect(director.getHud().minigame).toBeNull();
  });

  it('onEvent meldet gespielte Ereignisse im Takt der Animation, übersprungene nicht (CHAOS-33)', () => {
    const director = createBoardDirector();
    const seen: string[] = [];
    const stop = director.onEvent((event) => seen.push(event.type));
    // Erste Nachricht = Sprung: nichts melden.
    director.receive(msg(DEMO_VIEW, [{ type: 'dice-rolled', slot: 1, faces: [3], total: 3 }], 0));
    expect(seen).toEqual([]);
    director.receive(
      msg(
        DEMO_VIEW,
        [
          { type: 'dice-rolled', slot: 1, faces: [2], total: 2 },
          { type: 'coins-changed', slot: 1, delta: 3, balance: 15, reason: 'space' },
        ],
        1,
      ),
    );
    expect(seen).toEqual(['dice-rolled']);
    director.advance(5000);
    expect(seen).toEqual(['dice-rolled', 'coins-changed']);
    stop();
    director.receive(msg(DEMO_VIEW, [{ type: 'turn-ended', slot: 1 }], 3));
    expect(seen).toHaveLength(2);
  });

  it('meldet den Wegweiser beim Abbiegen', () => {
    const director = started();
    director.receive(msg(DEMO_VIEW, [{ type: 'path-chosen', slot: 1, spaceId: 's14' }], 0));
    expect(director.getHud().messages[0]?.text).toBe('Blau nimmt: Sumpfabkürzung');
  });
});
