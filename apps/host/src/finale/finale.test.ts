import type { BoardPlayer, RankingEntryInfo } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { DEMO_VIEW } from '../board/demo.ts';
import { bonusAwards } from './awards.ts';
import { CRITERION_BADGE, tiebreakText, winnerReason } from './texts.ts';
import {
  buildFinalePlan,
  finaleCues,
  finaleStateAt,
  INTRO_MS,
  REVEAL_MS,
  revealOrder,
  TIEBREAK_MS,
  WINNER_REVEAL_MS,
  winningCriterion,
  type FinaleState,
} from './finalePlan.ts';

const entry = (
  slot: 1 | 2 | 3 | 4,
  place: number,
  trophies: number,
  coins: number,
  decidedBy: RankingEntryInfo['decidedBy'] = 'trophies',
  minigameWins = 0,
): RankingEntryInfo => ({ slot, place, trophies, coins, minigameWins, decidedBy });

/** Klarer Sieg: Grün vor Blau vor Orange/Rosa (geteilter 3. Platz). */
const CLEAR = [
  entry(3, 1, 3, 4),
  entry(1, 2, 1, 12),
  entry(2, 3, 0, 9, 'shared'),
  entry(4, 3, 0, 9, 'shared'),
];

describe('buildFinalePlan', () => {
  it('Intro, dann vom letzten zum ersten Platz, zuletzt der Sieger', () => {
    const plan = buildFinalePlan(CLEAR, false);
    expect(
      plan.beats.map((b) => (b.kind === 'reveal' ? `${b.kind}:${String(b.slot)}` : b.kind)),
    ).toEqual(['intro', 'reveal:4', 'reveal:2', 'reveal:1', 'reveal:3', 'winner']);
    expect(plan.winnerAtMs).toBe(INTRO_MS + 3 * REVEAL_MS + WINNER_REVEAL_MS);
    expect(revealOrder(CLEAR).map((e) => e.slot)).toEqual([4, 2, 1, 3]);
  });

  it('Gleichstand bei Trophäen: Ansage „Münzen entscheiden“ vor dem Sieger', () => {
    const ranking = [entry(2, 1, 2, 15, 'coins'), entry(1, 2, 2, 8, 'coins'), entry(3, 3, 0, 30)];
    const plan = buildFinalePlan(ranking, false);
    const tiebreak = plan.beats.find((b) => b.kind === 'tiebreak');
    expect(tiebreak).toEqual({
      kind: 'tiebreak',
      criterion: 'coins',
      slots: [1, 2],
      durationMs: TIEBREAK_MS,
    });
    const kinds = plan.beats.map((b) => b.kind);
    expect(kinds.indexOf('tiebreak')).toBe(kinds.length - 3);
    expect(winningCriterion(ranking)).toBe('coins');
  });

  it('Minispiel-Siege entscheiden bzw. geteilter Sieg', () => {
    const wins = [entry(1, 1, 1, 5, 'minigame-wins', 2), entry(4, 2, 1, 5, 'minigame-wins', 1)];
    expect(winningCriterion(wins)).toBe('minigame-wins');
    const tiebreak = buildFinalePlan(wins, false).beats.find((b) => b.kind === 'tiebreak');
    expect(tiebreak).toMatchObject({ criterion: 'minigame-wins', slots: [1, 4] });

    const shared = [entry(1, 1, 1, 5, 'shared'), entry(2, 1, 1, 5, 'shared')];
    expect(winningCriterion(shared)).toBe('shared');
    const plan = buildFinalePlan(shared, true);
    expect(plan.endedEarly).toBe(true);
    expect(plan.beats.filter((b) => b.kind === 'tiebreak')).toHaveLength(1);
    expect(winningCriterion(CLEAR)).toBeNull();
  });
});

describe('finaleStateAt', () => {
  const plan = buildFinalePlan(CLEAR, false);

  it('am Anfang ist alles verdeckt', () => {
    const state = finaleStateAt(plan, CLEAR, 0);
    expect(state.beat.kind).toBe('intro');
    expect(state.cards.map((c) => c.slot)).toEqual([1, 2, 3, 4]);
    expect(state.cards.every((c) => !c.revealed && c.trophies === 0)).toBe(true);
    expect(state.done).toBe(false);
  });

  it('zählt erst Trophäen, dann Münzen hoch, dann der Platz', () => {
    // Blau (Slot 1, 1 Trophäe, 12 Münzen) ist das dritte Aufdecken.
    const at = (p: number) => finaleStateAt(plan, CLEAR, INTRO_MS + 2 * REVEAL_MS + p * REVEAL_MS);
    const blue = (p: number) => at(p).cards.find((c) => c.slot === 1);
    expect(blue(0.05)).toMatchObject({ revealed: true, active: true, trophies: 0, coins: 0 });
    expect(blue(0.52)).toMatchObject({ trophies: 1, coins: 0, placeShown: false });
    expect(blue(0.7)?.coins).toBeGreaterThan(0);
    expect(blue(0.7)?.coins).toBeLessThan(12);
    expect(blue(0.9)).toMatchObject({ trophies: 1, coins: 12, placeShown: true });
    // Früher Aufgedeckte stehen fest, Spätere sind verdeckt.
    expect(at(0.5).cards.find((c) => c.slot === 4)).toMatchObject({
      revealed: true,
      active: false,
      coins: 9,
      placeShown: true,
    });
    expect(at(0.5).cards.find((c) => c.slot === 3)?.revealed).toBe(false);
  });

  it('Überspringen (Infinity) zeigt sofort den Sieger mit allen Werten', () => {
    const state = finaleStateAt(plan, CLEAR, Number.POSITIVE_INFINITY);
    expect(state.done).toBe(true);
    expect(state.beat.kind).toBe('winner');
    expect(state.cards.map((c) => [c.slot, c.trophies, c.coins, c.place])).toEqual([
      [1, 1, 12, 2],
      [2, 0, 9, 3],
      [3, 3, 4, 1],
      [4, 0, 9, 3],
    ]);
    expect(finaleStateAt(plan, CLEAR, plan.winnerAtMs).done).toBe(true);
    expect(finaleStateAt(plan, CLEAR, plan.winnerAtMs - 1).done).toBe(false);
  });
});

describe('finaleCues', () => {
  const plan = buildFinalePlan(CLEAR, false);
  const sample = (ms: number): FinaleState => finaleStateAt(plan, CLEAR, ms);

  it('Trophäe, Münzen, Stempel und Sieger erklingen je einmal', () => {
    const start = INTRO_MS + 3 * REVEAL_MS; // Grün (3 Trophäen) beginnt
    expect(finaleCues(sample(start - 10), sample(start + 1))).toContain('turn');
    expect(finaleCues(sample(start + 1), sample(start + WINNER_REVEAL_MS * 0.3))).toEqual([
      'trophy',
    ]);
    expect(
      finaleCues(sample(start + WINNER_REVEAL_MS * 0.55), sample(start + WINNER_REVEAL_MS * 0.6)),
    ).toEqual(['coin']);
    expect(
      finaleCues(sample(start + WINNER_REVEAL_MS * 0.86), sample(start + WINNER_REVEAL_MS * 0.9)),
    ).toEqual(['pop']);
    expect(finaleCues(sample(plan.winnerAtMs - 1), sample(plan.winnerAtMs)).sort()).toEqual([
      'cheer',
      'win',
    ]);
    // Gleicher Stand: nichts.
    expect(finaleCues(sample(500), sample(500))).toEqual([]);
  });
});

describe('bonusAwards', () => {
  const players: BoardPlayer[] = DEMO_VIEW.players.map((p, i) => ({
    ...p,
    minigameWins: [2, 0, 2, 0][i] ?? 0,
    stats: {
      coinsEarned: [10, 25, 3, 0][i] ?? 0,
      coinsLost: 0,
      spacesMoved: [30, 22, 41, 18][i] ?? 0,
      itemsUsed: [0, 1, 0, 0][i] ?? 0,
    },
  }));

  it('höchster Wert gewinnt, Gleichstand teilt, null entfällt', () => {
    expect(bonusAwards(players)).toEqual([
      {
        id: 'coin-magnet',
        title: 'Münzmagnet',
        detail: '25 Münzen eingesammelt',
        slots: [2],
        value: 25,
      },
      {
        id: 'minigame-ace',
        title: 'Minispiel-Ass',
        detail: '2 Minispiele gewonnen',
        slots: [1, 3],
        value: 2,
      },
      {
        id: 'globetrotter',
        title: 'Weltenbummler',
        detail: '41 Felder gelaufen',
        slots: [3],
        value: 41,
      },
      { id: 'trickster', title: 'Trickkiste', detail: '1 Item eingesetzt', slots: [2], value: 1 },
    ]);
    expect(bonusAwards([])).toEqual([]);
  });

  it('Pechvogel nach `coinsLost` (Pech ohne Trophäenkäufe, gezählt in game-core, CHAOS-123)', () => {
    const unlucky = players.map((p, i) => ({
      ...p,
      stats: { ...p.stats, coinsLost: [4, 0, 9, 1][i] ?? 0 },
    }));
    expect(bonusAwards(unlucky).find((a) => a.id === 'unlucky')).toEqual({
      id: 'unlucky',
      title: 'Pechvogel',
      detail: '9 Münzen verloren',
      slots: [3],
      value: 9,
    });
  });
});

describe('Texte', () => {
  it('Gleichstand-Ansage, Begründung und Kennzeichnung je Kriterium', () => {
    expect(tiebreakText('coins').lead).toBe('Jetzt entscheiden die Münzen …');
    expect(tiebreakText('minigame-wins').lead).toContain('Minispiel-Siege');
    expect(tiebreakText('shared').title).toBe('Unglaublich – alles gleich!');
    expect(winnerReason('coins')).toContain('Münzen');
    expect(winnerReason('shared')).toContain('geteilt');
    expect(CRITERION_BADGE.trophies).toBeNull();
    expect(CRITERION_BADGE['minigame-wins']).toBe('per Minispiel-Siegen');
  });
});
