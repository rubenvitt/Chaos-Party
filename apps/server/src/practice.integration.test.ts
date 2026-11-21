/**
 * Minispiel-Galerie und Daumen über die Session (CHAOS-87), deterministisch mit künstlicher Uhr.
 *
 * - Übungsrunde (`start.practice`): ein Minispiel ohne Brettzug und Münzen, danach zurück in die
 *   Lobby – ohne auf Stimmen zu warten.
 * - Daumen (`rate`) in der Ergebnisanzeige einer Übungsrunde und einer Partie: freiwillig,
 *   ändern statt doppelt zählen, Übersicht an den Host, gespeichert im Stimmen-Speicher.
 * - Abgelehnt: unbekanntes Minispiel, Stimme außerhalb der Ergebnisanzeige oder zum falschen Lauf.
 */
import { DEFAULT_RULES } from '@chaos-party/game-core';
import type { SlotNumber } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { createMemoryRatingStore } from './ratings.ts';
import {
  Harness,
  HOST,
  playMinigameAsHost,
  pressInMinigame,
  setupMinigameGame,
} from './testHarness.ts';

const PRACTICE_ID = 'wackelturm';

function practiceHarness(players = 2) {
  const store = createMemoryRatingStore();
  const h = new Harness({ game: { seed: 4711 }, ratings: store });
  h.host();
  for (let id = 1; id <= players; id++) h.join(id);
  for (const id of h.controllers.keys()) h.ready(id);
  return { h, store };
}

function playToResults(h: Harness): void {
  const host = { sent: new Set<number>(), startedAt: new Map<number, number>() };
  const pressed = new Map<SlotNumber, number>();
  h.runUntil(
    (x) => x.gamePhase === 'minigame-results',
    20_000,
    (x) => {
      pressInMinigame(x, pressed);
      playMinigameAsHost(x, host);
    },
  );
}

function context(h: Harness, slot: SlotNumber) {
  const entry = h.contexts.get(slot);
  if (!entry) throw new Error(`kein Kontext für Slot ${String(slot)}`);
  return entry.context;
}

describe('Übungsrunde aus der Minispiel-Galerie (CHAOS-87)', () => {
  it('spielt genau ein Minispiel ohne Münzen und kehrt nach der Ergebnisanzeige in die Lobby zurück', () => {
    const { h } = practiceHarness();
    h.startPractice(PRACTICE_ID);
    expect(h.session.phase).toBe('board');
    const first = h.boards.at(-1)?.view;
    expect(first?.practice).toBe(true);
    expect(first?.gamePhase).toBe('minigame-intro');
    expect(first?.minigame?.id).toBe(PRACTICE_ID);
    expect(context(h, 1).minigame).toMatchObject({
      id: PRACTICE_ID,
      stage: 'intro',
      practice: true,
    });
    const coins = first?.players.map((p) => p.coins);

    playToResults(h);
    const results = h.boards.at(-1)?.view;
    expect(results?.minigame?.rewards?.every((reward) => reward.coins === 0)).toBe(true);
    expect(results?.players.map((p) => p.coins)).toEqual(coins);
    expect(context(h, 2)).toMatchObject({ actions: ['rate'], minigame: { stage: 'results' } });

    // Niemand stimmt ab: Nach der Ergebnisanzeige geht es ohne Verzögerung in die Lobby.
    const resultsAt = h.clock;
    h.runUntil((x) => x.session.phase === 'lobby', 1_000);
    expect(h.clock - resultsAt).toBeLessThanOrEqual(DEFAULT_RULES.pacing.minigameResultsMs + 100);
    expect(h.lobby?.phase).toBe('lobby');
    expect(h.lobby?.players.every((p) => !p.ready)).toBe(true);
    expect(context(h, 1).layout).toBe('lobby');
    expect(h.errors).toEqual([]);

    // Danach lässt sich normal eine Partie starten.
    for (const id of h.controllers.keys()) h.ready(id);
    h.start(1);
    expect(h.boards.at(-1)?.view.practice).toBeUndefined();
    expect(h.boards.at(-1)?.view.gamePhase).not.toBe('minigame-intro');
  });

  it('nimmt Daumen an, ersetzt geänderte Stimmen und meldet die Übersicht an den Host', () => {
    const { h, store } = practiceHarness();
    h.startPractice(PRACTICE_ID);
    playToResults(h);
    h.rate(1, 'up');
    h.rate(2, 'down');
    expect(context(h, 1).minigame?.vote).toBe('up');
    expect(context(h, 2).minigame?.vote).toBe('down');
    expect(h.ratings.at(-1)?.games).toEqual([{ id: PRACTICE_ID, up: 1, down: 1 }]);
    // Umentschieden: ersetzt, zählt nicht doppelt.
    h.rate(1, 'down');
    expect(h.ratings.at(-1)?.games).toEqual([{ id: PRACTICE_ID, up: 0, down: 2 }]);
    expect(store.votes()).toHaveLength(2);
    expect(store.votes().every((vote) => vote.practice && vote.minigameId === PRACTICE_ID)).toBe(
      true,
    );
    // Gleiche Stimme noch mal: keine neue Übersicht.
    const sent = h.ratings.length;
    h.rate(2, 'down');
    expect(h.ratings).toHaveLength(sent);
    h.runUntil((x) => x.session.phase === 'lobby', 1_000);
    expect(h.errors).toEqual([]);

    // Ein neu verbundener Host bekommt die Übersicht gleich nach dem Hallo.
    h.reloadHost();
    expect(h.ratings.at(-1)?.games).toEqual([{ id: PRACTICE_ID, up: 0, down: 2 }]);
  });

  it('lehnt unbekannte Minispiele und Stimmen außerhalb der Ergebnisanzeige ab', () => {
    const { h, store } = practiceHarness();
    h.startPractice('gibt-es-nicht');
    expect(h.session.phase).toBe('lobby');
    expect(h.errors).toEqual([{ to: HOST, code: 'bad-message' }]);
    h.errors.length = 0;

    h.startPractice(PRACTICE_ID);
    h.rate(1, 'up');
    expect(h.errors.at(-1)?.code).toBe('out-of-phase');
    playToResults(h);
    h.rate(1, 'up', { round: 7 });
    expect(h.errors.at(-1)?.code).toBe('invalid-choice');
    h.rate(1, 'up', { minigameId: 'sockenregen' });
    expect(h.errors.at(-1)?.code).toBe('invalid-choice');
    expect(store.votes()).toHaveLength(0);
    h.runUntil((x) => x.session.phase === 'lobby', 1_000);
    h.rate(1, 'up');
    expect(h.errors.at(-1)?.code).toBe('out-of-phase');
    expect(store.votes()).toHaveLength(0);
  });

  it('beendet eine Übungsrunde per end-game sofort in die Lobby', () => {
    const { h } = practiceHarness();
    h.startPractice(PRACTICE_ID);
    h.endGame();
    expect(h.session.phase).toBe('lobby');
    expect(h.errors).toEqual([]);
  });
});

describe('Daumen nach einem Minispiel in einer Partie (CHAOS-87)', () => {
  it('nimmt Stimmen in der Ergebnisanzeige an, ohne den Rückweg zum Brett zu verzögern', () => {
    const plain = setupMinigameGame('sockenregen', 2, 99, 2);
    const voted = setupMinigameGame('sockenregen', 2, 99, 2);
    const toRoundEnd = (h: Harness, vote: boolean) => {
      playToResults(h);
      const at = h.clock;
      if (vote) {
        h.rate(1, 'up');
        h.rate(2, 'down');
      }
      h.runUntil((x) => x.gamePhase === 'round-end', 1_000);
      return h.clock - at;
    };
    expect(toRoundEnd(voted, true)).toBe(toRoundEnd(plain, false));
    expect(voted.ratings.at(-1)?.games).toEqual([{ id: 'sockenregen', up: 1, down: 1 }]);
    expect(voted.session.ratingVotes().every((vote) => !vote.practice)).toBe(true);
    expect(voted.errors).toEqual([]);
    // In der nächsten Runde ist es ein neuer Lauf: keine eigene Stimme, neue Stimmen zählen dazu.
    playToResults(voted);
    expect(context(voted, 1).minigame?.vote).toBeUndefined();
    voted.rate(1, 'up');
    expect(voted.ratings.at(-1)?.games).toEqual([{ id: 'sockenregen', up: 2, down: 1 }]);
    expect(voted.session.ratingVotes()).toHaveLength(3);
  });
});
