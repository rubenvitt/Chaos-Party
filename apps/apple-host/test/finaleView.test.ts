import type { BoardView, RankingEntryInfo } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { DEMO_VIEW } from '../../host/src/board/demo.ts';
import { INTRO_MS, REVEAL_MS, WINNER_REVEAL_MS } from '../../host/src/finale/finalePlan.ts';
import { FinaleStateSchema } from '../src/contract.ts';
import { createFinaleView, podiumEntries } from '../src/finaleView.ts';

const entry = (
  slot: 1 | 2 | 3 | 4,
  place: number,
  trophies: number,
  coins: number,
  decidedBy: RankingEntryInfo['decidedBy'] = 'trophies',
): RankingEntryInfo => ({ slot, place, trophies, coins, minigameWins: 0, decidedBy });

/** Endstand der Demo-Partie: Slot 2 vor 1 per Münzen, dann 3 und 4. */
const RANKING = [
  entry(2, 1, 2, 14, 'coins'),
  entry(1, 2, 2, 6, 'coins'),
  entry(3, 3, 1, 9),
  entry(4, 4, 0, 3),
];
const VIEW: BoardView = {
  ...DEMO_VIEW,
  gamePhase: 'game-results',
  ranking: RANKING,
  endedEarly: false,
};

describe('createFinaleView', () => {
  it('liefert vor dem ersten advance nichts', () => {
    expect(createFinaleView().state(0, true)).toBeNull();
  });

  it('läuft die Zählung bis zum Siegerbildschirm, mit Klängen und gültigem Vertrag', () => {
    const finale = createFinaleView();
    const beats: string[] = [];
    const sounds = new Set<string>();
    let lastId = 0;
    for (let now = 1000; now <= 1000 + 30_000; now += 50) {
      finale.advance(VIEW, now);
      const state = finale.state(now, true);
      expect(state).not.toBeNull();
      if (!state) return;
      if (beats.at(-1) !== state.beat) beats.push(state.beat);
      for (const cue of state.sounds) {
        if (cue.id > lastId) {
          lastId = cue.id;
          sounds.add(cue.name);
        }
      }
      expect(FinaleStateSchema.safeParse(state).success).toBe(true);
      // „Nochmal spielen“ erst am Siegerbildschirm.
      expect(state.canRematch).toBe(state.done);
    }
    expect(beats).toEqual(['intro', 'reveal', 'tiebreak', 'reveal', 'winner']);
    expect([...sounds].sort()).toEqual(['cheer', 'coin', 'pop', 'trophy', 'turn', 'win']);
    const done = finale.state(31_000, true);
    expect(done?.done).toBe(true);
    expect(done?.winner.headline).toBe(`${DEMO_VIEW.players[1]?.name ?? ''} gewinnt!`);
    expect(done?.winner.reason).toBe('Gleich viele Trophäen – die Münzen haben entschieden.');
    expect(done?.winner.ranking.map((r) => r.slot)).toEqual([2, 1, 3, 4]);
    expect(done?.cards.every((card) => card.revealed && card.placeShown)).toBe(true);
  });

  it('zählt ab dem ersten advance und springt mit skip zum Sieger', () => {
    const finale = createFinaleView();
    finale.advance(VIEW, 5000);
    expect(finale.state(5000 + INTRO_MS - 1, true)?.beat).toBe('intro');
    expect(finale.state(5000 + INTRO_MS + 1, true)?.beat).toBe('reveal');
    expect(finale.skip()).toBe(true);
    const state = finale.state(5000 + INTRO_MS + 2, true);
    expect(state?.done).toBe(true);
    expect(state?.elapsedMs).toBe(state?.winnerAtMs);
    expect(state?.winnerAtMs).toBe(INTRO_MS + 2600 + 3 * REVEAL_MS + WINNER_REVEAL_MS);
  });

  it('vergisst beim reset alles (Revanche)', () => {
    const finale = createFinaleView();
    finale.advance(VIEW, 0);
    finale.reset();
    expect(finale.state(10, true)).toBeNull();
    expect(finale.skip()).toBe(false);
    finale.advance(VIEW, 100);
    expect(finale.state(100, true)?.beat).toBe('intro');
  });

  it('kennzeichnet ein vorzeitiges Ende', () => {
    const finale = createFinaleView();
    finale.advance({ ...VIEW, endedEarly: true, round: 4 }, 0);
    const state = finale.state(0, true);
    expect(state?.kicker).toBe('Partie vorzeitig beendet');
    expect(state?.winner.earlyNote).toBe(
      `Vorzeitig beendet – es zählt der Stand von Runde 4/${String(VIEW.rounds)}`,
    );
  });
});

describe('podiumEntries', () => {
  it('stellt wie podiumStage auf: Platz 1 mittig und am höchsten, der letzte schmollt', () => {
    const podium = podiumEntries(VIEW, RANKING);
    expect(podium.map((p) => [p.slot, p.place, p.anim])).toEqual([
      [2, 1, 'cheer'],
      [1, 2, 'jump'],
      [3, 3, 'jump'],
      [4, 4, 'sad'],
    ]);
    expect(podium[0]?.height).toBeGreaterThan(podium[1]?.height ?? 0);
    // Vier Blöcke, 2,25 auseinander, um die Mitte verschoben: Platz 1 bei +1,125.
    expect(podium.map((p) => p.x)).toEqual([1.125, -1.125, 3.375, -3.375]);
  });
});
