import {
  createMessage,
  type BoardEvent,
  type BoardMessage,
  type BoardView,
} from '@chaos-party/protocol';
import { describe, expect, it, vi } from 'vitest';
import {
  FLIGHT_EVENT_MS,
  GUST_FLIGHT_MS,
  POPUP_MS,
  SABOTAGE_NOTICE_PAUSE_MS,
  SWAP_FLIGHT_MS,
} from './animation.ts';
import { DEMO_VIEW } from './demo.ts';
import { createBoardDirector, CUE_MS, MESSAGE_MS, NOTICE_MS, toQueueItems } from './director.ts';

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
  it('meldet gespielte Ereignisse mit Alter für die Kamera (CHAOS-194)', () => {
    const director = started();
    expect(director.getFrame().cues).toEqual([]);
    const after = { ...moveBlue(DEMO_VIEW, 's10'), gamePhase: 'turn-end' as const, prompt: null };
    director.receive(
      msg(
        after,
        [
          { type: 'path-chosen', slot: 1, spaceId: 's08' },
          { type: 'moved', slot: 1, path: ['s08', 's09', 's10'] },
        ],
        0,
      ),
    );
    director.advance(100);
    let cues = director.getFrame().cues;
    expect(cues.map((c) => c.event.type)).toEqual(['path-chosen', 'moved']);
    expect(cues[1]).toMatchObject({ start: 's07', durationMs: 3 * STEP, style: 'walk' });
    expect(cues[1]?.elapsedMs).toBe(100);
    // Nach dem Ende läuft das Alter weiter, bis das Ereignis aus der Liste fällt.
    director.advance(3 * STEP);
    expect(director.getFrame().cues[1]?.elapsedMs).toBe(100 + 3 * STEP);
    director.advance(CUE_MS);
    cues = director.getFrame().cues;
    expect(cues).toEqual([]);
    // Sprung (settle) leert die Liste.
    director.receive(msg(DEMO_VIEW, [{ type: 'turn-ended', slot: 1 }], 2));
    director.settle();
    expect(director.getFrame().cues).toEqual([]);
  });

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
    expect(pawn?.hop).toEqual({ from: 's07', to: 's08', t: 0, style: 'walk' });

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

  it('neue Partie nach dem Endstand (eventSeq wieder 0) springt statt „veraltet“ (CHAOS-39)', () => {
    const director = started();
    const ended: BoardView = { ...DEMO_VIEW, gamePhase: 'game-results', round: 5 };
    director.receive(msg(ended, [{ type: 'turn-ended', slot: 1 }], 40));
    director.advance(5000);
    expect(director.getHud().view?.gamePhase).toBe('game-results');
    const fresh: BoardView = { ...DEMO_VIEW, round: 1 };
    director.receive(
      msg(
        fresh,
        [
          { type: 'turn-started', slot: 1, round: 1 },
          { type: 'turn-ended', slot: 1 },
        ],
        0,
      ),
    );
    director.advance(10);
    expect(director.getHud().view?.gamePhase).toBe(DEMO_VIEW.gamePhase);
    expect(director.getHud().view?.round).toBe(1);
    expect(director.stats.nextEventSeq).toBe(2);
    // Mitten in einer Partie bleibt eine Nachricht mit eventSeq 0 veraltet.
    director.receive(msg({ ...DEMO_VIEW, round: 4 }, [{ type: 'turn-ended', slot: 1 }], 0));
    expect(director.getHud().view?.round).toBe(1);
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

  it('stapelt gleichzeitige Popups über derselben Stelle statt sie zu überdecken (CHAOS-189)', () => {
    const director = started();
    // Blau steht auf s07: Münzen über Blau (700 ms), dann eine Falle auf s07 und eine auf s30.
    director.receive(
      msg(
        DEMO_VIEW,
        [
          { type: 'coins-changed', slot: 1, delta: 3, balance: 15, reason: 'space' },
          { type: 'trap-placed', slot: 2, spaceId: 's07' },
          { type: 'trap-placed', slot: 2, spaceId: 's30' },
        ],
        0,
      ),
    );
    expect(director.getFrame().popups).toEqual([
      expect.objectContaining({ kind: 'coins', slot: 1, stack: 0 }),
    ]);
    director.advance(700);
    // Feld-Popup über Blaus Feld: eine Ebene höher als das Münz-Popup über Blau.
    expect(director.getFrame().popups).toEqual([
      expect.objectContaining({ kind: 'coins', slot: 1, stack: 0 }),
      expect.objectContaining({ kind: 'trap', spaceId: 's07', stack: 1 }),
    ]);
    director.advance(700);
    // Anderes Feld: beginnt wieder unten.
    expect(director.getFrame().popups).toEqual([
      expect.objectContaining({ kind: 'trap', spaceId: 's07', stack: 1 }),
      expect.objectContaining({ kind: 'trap', spaceId: 's30', stack: 0 }),
    ]);
  });

  it('gibt eine Ebene frei, sobald ihr Popup abgelaufen ist (CHAOS-189)', () => {
    const director = started();
    const dice = (total: number): BoardEvent => ({
      type: 'dice-rolled',
      slot: 1,
      faces: [1, total - 1],
      total,
    });
    director.receive(msg(DEMO_VIEW, [dice(3), dice(4)], 0));
    director.advance(900);
    expect(director.getFrame().popups.map((p) => p.stack)).toEqual([0, 1]);
    // Das erste Popup ist weg, das zweite steht noch auf Ebene 1: das nächste nimmt Ebene 0.
    director.advance(900);
    expect(POPUP_MS).toBeLessThan(1800);
    director.receive(msg(DEMO_VIEW, [dice(5)], 2));
    expect(director.getFrame().popups.map((p) => [p.text, p.stack])).toEqual([
      ['4', 1],
      ['5', 0],
    ]);
  });

  it('blendet „Sabotage wird stärker!“ ein, hält kurz an und blendet aus (CHAOS-120)', () => {
    const director = started();
    const next: BoardView = { ...DEMO_VIEW, round: 3, gamePhase: 'turn-start', prompt: null };
    director.receive(
      msg(
        next,
        [
          { type: 'round-started', round: 3, sabotage: { steal: 6, trap: 5 } },
          { type: 'turn-started', slot: 1, round: 3 },
        ],
        0,
      ),
    );
    expect(director.getHud().notice).toMatchObject({
      title: 'Sabotage wird stärker!',
      detail: 'Klau: 6 Münzen · Falle: 5 Münzen',
    });
    expect(director.getHud().messages.map((m) => m.text)).toEqual(['Runde 3 beginnt!']);
    // Kurze Pause vor dem Zugbeginn: Stand wird erst danach übernommen.
    director.advance(SABOTAGE_NOTICE_PAUSE_MS - 1);
    expect(director.getHud().view?.round).toBe(DEMO_VIEW.round);
    director.advance(1);
    expect(director.getHud().view?.round).toBe(3);
    director.advance(NOTICE_MS - SABOTAGE_NOTICE_PAUSE_MS);
    expect(director.getHud().notice).toBeNull();
  });

  it('keine Einblendung bei einem gewöhnlichen Rundenstart', () => {
    const director = started();
    director.receive(msg({ ...DEMO_VIEW, round: 3 }, [{ type: 'round-started', round: 3 }], 0));
    expect(director.getHud().notice).toBeNull();
    expect(director.animating).toBe(false);
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

  it('zeigt den Windstoß als einen Flug zum Ziel (CHAOS-52)', () => {
    const director = started();
    const after = moveBlue(DEMO_VIEW, 's09');
    director.receive(
      msg(
        after,
        [
          { type: 'board-event', slot: 1, event: 'gust' },
          { type: 'moved', slot: 1, path: ['s08', 's09'] },
        ],
        0,
      ),
    );
    expect(director.getHud().messages.at(-1)?.text).toContain('Windböe');
    director.advance(FLIGHT_EVENT_MS + GUST_FLIGHT_MS / 2);
    const pawn = director.getFrame().pawns.find((p) => p.slot === 1);
    expect(pawn?.hop).toMatchObject({ from: 's07', to: 's09', style: 'gust' });
    expect(pawn?.hop?.t).toBeCloseTo(0.5);
    expect(pawn?.spaceId).toBe('s07');
    director.advance(GUST_FLIGHT_MS / 2);
    expect(director.animating).toBe(false);
    expect(director.getFrame().pawns.find((p) => p.slot === 1)).toMatchObject({
      spaceId: 's09',
      hop: null,
    });
    expect(director.stats.eventsProcessed).toBe(2);
  });

  it('lässt beim Platztausch beide Figuren gleichzeitig fliegen (CHAOS-52)', () => {
    const director = started();
    const seen: string[] = [];
    director.onEvent((event) => seen.push(event.type));
    const after: BoardView = {
      ...DEMO_VIEW,
      players: DEMO_VIEW.players.map((p) =>
        p.slot === 1 ? { ...p, spaceId: 's34' } : p.slot === 3 ? { ...p, spaceId: 's07' } : p,
      ),
    };
    director.receive(
      msg(
        after,
        [
          { type: 'board-event', slot: 1, event: 'swap' },
          { type: 'moved', slot: 1, path: ['s34'] },
          { type: 'moved', slot: 3, path: ['s07'] },
        ],
        0,
      ),
    );
    director.advance(FLIGHT_EVENT_MS + SWAP_FLIGHT_MS / 4);
    const pawns = director.getFrame().pawns;
    expect(pawns.find((p) => p.slot === 1)?.hop).toMatchObject({
      from: 's07',
      to: 's34',
      style: 'swap',
    });
    expect(pawns.find((p) => p.slot === 3)?.hop).toMatchObject({
      from: 's34',
      to: 's07',
      style: 'swap',
    });
    expect(pawns.find((p) => p.slot === 3)?.hop?.t).toBeCloseTo(0.25);
    // Beide `moved` werden gemeldet (Klänge), auch wenn sie als ein Schritt laufen.
    expect(seen).toEqual(['board-event', 'moved', 'moved']);
    director.advance(SWAP_FLIGHT_MS);
    expect(director.animating).toBe(false);
    expect(director.getPawnSpaces()).toMatchObject({ 1: 's34', 3: 's07' });
    expect(director.stats.eventsProcessed).toBe(3);
  });

  it('markiert nur passende moved als Flug', () => {
    const styles = (events: BoardEvent[]) =>
      toQueueItems(events).map(
        (item) => `${item.event.type}:${item.style}${item.partner ? '+' : ''}`,
      );
    // Normales Gehen bleibt Gehen.
    expect(styles([{ type: 'moved', slot: 1, path: ['s08'] }])).toEqual(['moved:walk']);
    // Windstoß ohne Weg (Sackgasse): das spätere moved ist wieder Gehen.
    expect(
      styles([
        { type: 'board-event', slot: 1, event: 'gust' },
        { type: 'turn-ended', slot: 1 },
        { type: 'moved', slot: 1, path: ['s08'] },
      ]),
    ).toEqual(['board-event:walk', 'turn-ended:walk', 'moved:walk']);
    // Fremde Figur nach dem Windstoß: kein Flug.
    expect(
      styles([
        { type: 'board-event', slot: 1, event: 'gust' },
        { type: 'moved', slot: 2, path: ['s08'] },
      ]),
    ).toEqual(['board-event:walk', 'moved:walk']);
    // Tausch ohne zweites moved: einzelnes moved geht normal.
    expect(
      styles([
        { type: 'board-event', slot: 1, event: 'swap' },
        { type: 'moved', slot: 1, path: ['s20'] },
      ]),
    ).toEqual(['board-event:walk', 'moved:walk']);
    expect(
      styles([
        { type: 'board-event', slot: 1, event: 'swap' },
        { type: 'moved', slot: 1, path: ['s20'] },
        { type: 'moved', slot: 2, path: ['s07'] },
        { type: 'turn-ended', slot: 1 },
      ]),
    ).toEqual(['board-event:walk', 'moved:swap+', 'turn-ended:walk']);
  });
});
