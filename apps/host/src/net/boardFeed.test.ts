import { createMessage, type BoardEvent, type BoardView } from '@chaos-party/protocol';
import { describe, expect, it, vi } from 'vitest';
import { minigameView } from '../minigame/testViews.ts';
import { createBoardFeed } from './boardFeed.ts';

function msg(view: BoardView, events: BoardEvent[], eventSeq: number) {
  return createMessage('board', { view, events, eventSeq });
}

const RESULTS_EVENTS: BoardEvent[] = [
  {
    type: 'minigame-results',
    ranking: [2, 1],
    placements: [
      { slot: 2, place: 1, score: 4 },
      { slot: 1, place: 2, score: 1 },
    ],
    aborted: false,
  },
  { type: 'coins-changed', slot: 2, delta: 10, balance: 17, reason: 'minigame' },
  { type: 'coins-changed', slot: 1, delta: 5, balance: 17, reason: 'minigame' },
  { type: 'coins-changed', slot: 1, delta: 3, balance: 20, reason: 'space' },
];

describe('createBoardFeed', () => {
  it('merkt den neuesten Stand mit Empfangszeit und meldet Änderungen', () => {
    let clock = 100;
    const feed = createBoardFeed(() => clock);
    const listener = vi.fn();
    feed.subscribe(listener);
    expect(feed.getSnapshot().view).toBeNull();
    const intro = minigameView('minigame-intro');
    feed.receive(msg(intro, [{ type: 'minigame-started', minigame: 'pump-parade' }], 0));
    expect(feed.getSnapshot()).toEqual({
      view: intro,
      receivedAt: 100,
      rewards: { round: 2, bySlot: {} },
    });
    clock = 250;
    const play = minigameView('minigame-play');
    feed.receive(msg(play, [], 1));
    expect(feed.getSnapshot().view).toBe(play);
    expect(feed.getSnapshot().receivedAt).toBe(250);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('sammelt Münzgewinne des Minispiels (nur Grund minigame), Doppeltes zählt nicht', () => {
    const feed = createBoardFeed(() => 0);
    feed.receive(
      msg(minigameView('minigame-intro'), [{ type: 'minigame-started', minigame: 'x' }], 0),
    );
    const results = minigameView('minigame-results');
    feed.receive(msg(results, RESULTS_EVENTS, 1));
    expect(feed.getSnapshot().rewards).toEqual({ round: 2, bySlot: { 2: 10, 1: 5 } });
    // Dieselbe Nachricht noch einmal (z. B. Wiederholung): nichts doppelt.
    feed.receive(msg(results, RESULTS_EVENTS, 1));
    expect(feed.getSnapshot().rewards).toEqual({ round: 2, bySlot: { 2: 10, 1: 5 } });
    // Teilweise überlappend: nur das Neue zählt.
    feed.receive(
      msg(
        results,
        [
          ...RESULTS_EVENTS.slice(3),
          { type: 'coins-changed', slot: 2, delta: 1, balance: 18, reason: 'minigame' },
        ],
        4,
      ),
    );
    expect(feed.getSnapshot().rewards).toEqual({ round: 2, bySlot: { 2: 11, 1: 5 } });
  });

  it('Gewinne ohne minigame-started (Host kam mitten hinein) gehören zur Runde des Stands', () => {
    const feed = createBoardFeed(() => 0);
    feed.receive(msg(minigameView('minigame-results'), RESULTS_EVENTS, 10));
    expect(feed.getSnapshot().rewards).toEqual({ round: 2, bySlot: { 2: 10, 1: 5 } });
    // Nächstes Minispiel: alte Gewinne verfallen.
    feed.receive(msg(minigameView('minigame-intro', { round: 3 }), [], 14));
    expect(feed.getSnapshot().rewards).toBeNull();
  });

  it('ignoriert veraltete Nachrichten', () => {
    const feed = createBoardFeed(() => 0);
    const newer = minigameView('minigame-play');
    feed.receive(msg(newer, [], 5));
    feed.receive(msg(minigameView('minigame-intro'), [], 1));
    expect(feed.getSnapshot().view).toBe(newer);
  });
});
