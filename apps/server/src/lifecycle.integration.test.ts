/**
 * M4 (CHAOS-36/37/55, ADR-015): kompletter Lebenszyklus einer Partie über die Session,
 * deterministisch mit festem Seed und künstlicher Uhr.
 *
 * Lobby → Figurenwahl (inkl. Konflikt) → Rundenzahl → Start → zwei Runden mit echten
 * Minispielen aus der Rotation (Ergebnisse vom synthetischen Host) → Pause mitten im
 * Minispiel und mitten im Zug → Endstand → Revanche zurück in die Lobby → zweite Partie
 * startet mit neuem Seed.
 */
import { createMessage, type BoardEvent, type SlotNumber } from '@chaos-party/protocol';
import { rankByScore } from '@chaos-party/minigame-sdk';
import { getMinigameInfo, rotationInfos } from '@chaos-party/minigames/catalog';
import { describe, expect, it } from 'vitest';
import { assertContiguousEvents, Harness, HOST, pressInMinigame, TICK_MS } from './testHarness.ts';

const SEEDS = { two: [20261116, 77] as const, four: [4242, 99] as const };
const PAUSE_TICKS = 300; // 30 s

interface LifecycleResult {
  readonly h: Harness;
  readonly firstGameEvents: BoardEvent[];
}

/**
 * Synthetischer Host mit Pause: zählt die gespielte Zeit je Minispiel nur, solange nicht
 * pausiert ist (wie die Minispiel-Laufzeit im Host), und meldet danach ein Ergebnis aus den
 * weitergeleiteten Eingaben (mehr Eingaben = mehr Punkte).
 */
function hostPlays(h: Harness, played: Map<number, number>, sent: Set<number>): void {
  const view = h.boards.at(-1)?.view;
  const minigame = view?.minigame;
  if (view?.gamePhase !== 'minigame-play' || !minigame || view.paused) return;
  if (sent.has(minigame.round)) return;
  const time = (played.get(minigame.round) ?? 0) + TICK_MS;
  played.set(minigame.round, time);
  if (time < minigame.playMs) return;
  const info = getMinigameInfo(minigame.id);
  if (!info) throw new Error(`Unbekanntes Minispiel ${minigame.id}`);
  const counts = new Map<SlotNumber, number>();
  for (const input of h.hostInputs) {
    counts.set(input.intent.slot, (counts.get(input.intent.slot) ?? 0) + 1);
  }
  sent.add(minigame.round);
  h.send(
    HOST,
    createMessage('minigame-result', {
      minigameId: minigame.id,
      round: minigame.round,
      placements: rankByScore(
        view.players.map((p) => ({ slot: p.slot, score: counts.get(p.slot) ?? 0 })),
        info.scoring,
      ),
    }),
  );
}

function lifecycle(players: 2 | 4): LifecycleResult {
  const seeds = [...(players === 2 ? SEEDS.two : SEEDS.four)];
  const h = new Harness(
    {
      game: {
        rounds: 5,
        minigames: rotationInfos().map((info) => ({
          id: info.id,
          playMs: info.durationMs,
          scoring: info.scoring,
        })),
      },
      randomSeed: () => seeds.shift() ?? 0,
    },
    { useItems: true, reaction: 'brace' },
    players,
  );
  h.host();
  for (let id = 1; id <= players; id++) h.join(id);

  // Figurenwahl: Slot 1 wählt, Slot 3 will dieselbe (abgewiesen) und nimmt eine andere.
  h.pickCharacter(1, 1, players === 2 ? 'sock' : 'raccoon');
  if (players === 4) {
    h.pickCharacter(3, 3, 'raccoon');
    expect(h.errors).toEqual([{ to: 3, code: 'character-taken' }]);
    h.errors.length = 0;
    h.pickCharacter(3, 3, 'robot');
  }
  h.configure(2);
  for (const id of h.controllers.keys()) h.ready(id);
  expect(h.lobby?.players.every((p) => p.ready)).toBe(true);
  h.start();
  expect(h.session.phase).toBe('board');

  const played = new Map<number, number>();
  const sent = new Set<number>();
  const pressed = new Map<SlotNumber, number>();
  let minigamePause = false;
  let turnPause = false;
  let pauseTicks = 0;
  const eventsAtPause: number[] = [];
  h.runToEnd(400_000, (x) => {
    const view = x.boards.at(-1)?.view;
    if (view?.paused) {
      pauseTicks++;
      if (pauseTicks === 1) eventsAtPause.push(x.events.length);
      if (pauseTicks >= PAUSE_TICKS) {
        // Während der ganzen Pause: keine Ereignisse, keine Eingaben an den Host.
        expect(x.events.length).toBe(eventsAtPause.at(-1));
        x.resume();
        pauseTicks = 0;
      }
      return;
    }
    // Pause 1: Runde 1, zwei Sekunden ins Minispiel.
    if (!minigamePause && view?.gamePhase === 'minigame-play' && (played.get(1) ?? 0) >= 2_000) {
      minigamePause = true;
      x.pause();
      return;
    }
    // Pause 2: Runde 2, während jemand würfeln soll.
    if (!turnPause && view?.round === 2 && view.prompt?.kind === 'roll') {
      turnPause = true;
      x.pause();
      return;
    }
    pressInMinigame(x, pressed);
    hostPlays(x, played, sent);
    if (x.gamePhase === 'round-end') pressed.clear();
  });
  expect([minigamePause, turnPause]).toEqual([true, true]);
  return { h, firstGameEvents: h.events };
}

describe('Kompletter Lebenszyklus (M4, CHAOS-36/37/55)', () => {
  it.each([2, 4] as const)(
    '%i Spieler: Lobby → Figuren → Partie mit Pausen → Endstand → Revanche',
    (players) => {
      const { h, firstGameEvents } = lifecycle(players);
      const last = h.boards.at(-1);
      expect(last?.view).toMatchObject({
        gamePhase: 'game-results',
        rounds: 2,
        paused: false,
        endedEarly: false,
      });
      assertContiguousEvents(h);

      // Figuren bis ins Brett durchgereicht.
      const expected =
        players === 2
          ? [
              [1, 'sock'],
              [2, 'cactus'],
            ]
          : [
              [1, 'raccoon'],
              [2, 'cactus'],
              [3, 'robot'],
              [4, 'sock'],
            ];
      expect(last?.view.players.map((p) => [p.slot, p.character])).toEqual(expected);

      // Zwei Runden, je ein echtes Minispiel, alle Ergebnisse angenommen und bestätigt.
      const results = firstGameEvents.flatMap((e) => (e.type === 'minigame-results' ? [e] : []));
      expect(results).toHaveLength(2);
      expect(results.every((e) => !e.aborted)).toBe(true);
      expect(h.acks).toHaveLength(2);
      expect(h.acks.every((ack) => ack.accepted)).toBe(true);

      // Wertung: Minispiel-Siege gezählt (Gleichstand auf 1 für alle) und im Endstand.
      const winners = results.flatMap((e) => e.placements.filter((p) => p.place === 1));
      const ranking = last?.view.ranking ?? [];
      expect(ranking.reduce((sum, entry) => sum + entry.minigameWins, 0)).toBe(winners.length);
      expect(ranking).toHaveLength(players);
      for (const entry of ranking) {
        expect(['trophies', 'coins', 'minigame-wins', 'shared']).toContain(entry.decidedBy);
        const board = h.contexts.get(entry.slot)?.context.board;
        expect(board).toMatchObject({
          place: entry.place,
          tied: entry.decidedBy === 'shared',
          endedEarly: false,
          coins: entry.coins,
          trophies: entry.trophies,
        });
      }
      const ended = firstGameEvents.at(-1);
      expect(ended).toMatchObject({ type: 'game-ended', endedEarly: false });

      // Keine Fehler im normalen Ablauf (auch nicht während der Pausen).
      expect(h.errors).toEqual([]);

      // Revanche: zurück in die Lobby, Figuren bleiben, alle wieder „nicht bereit“.
      const seedBefore = h.session.snapshot().game?.seed;
      h.rematch();
      expect(h.session.phase).toBe('lobby');
      expect(h.lobby?.players.map((p) => [p.slot, p.character, p.ready])).toEqual(
        expected.map(([slot, character]) => [slot, character, false]),
      );
      for (const [slot] of expected) {
        expect(h.contexts.get(slot as SlotNumber)?.context).toMatchObject({
          phase: 'lobby',
          layout: 'lobby',
          actions: ['ready', 'pick-character'],
        });
      }
      for (const id of h.controllers.keys()) h.ready(id);
      h.start();
      const seedAfter = h.session.snapshot().game?.seed;
      expect(seedAfter).not.toBe(seedBefore);
      expect(h.boards.at(-1)?.view).toMatchObject({ gamePhase: 'turn-start', round: 1 });
    },
  );

  it('gleicher Seed → gleicher Ablauf, auch mit Pausen', () => {
    const a = lifecycle(2).firstGameEvents;
    const b = lifecycle(2).firstGameEvents;
    expect(b).toEqual(a);
  });
});
