import { getMinigameInfo } from '@chaos-party/minigames/catalog';
import { BoardViewSchema } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_INTRO_MS,
  LOCAL_REPEAT_INTRO_MS,
  localRewards,
  localSlots,
  localView,
} from './localFlow.ts';
import { minigameStageOf } from './plan.ts';

const PUMP_PARADE_INFO = (() => {
  const info = getMinigameInfo('pump-parade');
  if (!info) throw new Error('Referenz-Minispiel fehlt');
  return info;
})();

describe('lokaler Minispiel-Ablauf', () => {
  const result = {
    minigameId: PUMP_PARADE_INFO.id,
    round: 1,
    placements: [
      { slot: 2 as const, place: 1, score: 6 },
      { slot: 1 as const, place: 2, score: 4 },
      { slot: 3 as const, place: 2, score: 4 },
    ],
    highlights: ['Orange pumpt am meisten'],
  };

  it('baut protokollgültige Stände für Intro, Spiel und Ergebnis', () => {
    for (const stage of ['intro', 'play', 'results'] as const) {
      const view = localView(PUMP_PARADE_INFO, stage, { players: 3, seed: 7, result });
      expect(BoardViewSchema.safeParse(view).success).toBe(true);
      expect(minigameStageOf(view)).toBe(stage);
      expect(view.players.map((p) => p.slot)).toEqual([1, 2, 3]);
    }
    const intro = localView(PUMP_PARADE_INFO, 'intro', { players: 2, seed: 7 });
    expect(intro.remainingMs).toBe(LOCAL_INTRO_MS);
    expect(intro.minigame?.elapsedMs).toBeNull();
    expect(intro.minigame?.repeat).toBe(false);
    // CHAOS-66: Wiederholung → kurze Anleitung.
    const repeat = localView(PUMP_PARADE_INFO, 'intro', { players: 2, seed: 7, repeat: true });
    expect(BoardViewSchema.safeParse(repeat).success).toBe(true);
    expect(repeat.remainingMs).toBe(LOCAL_REPEAT_INTRO_MS);
    expect(repeat.minigame?.repeat).toBe(true);
    const results = localView(PUMP_PARADE_INFO, 'results', { players: 3, seed: 7, result });
    expect(results.minigame?.placements).toEqual(result.placements);
    expect(results.minigame?.highlights).toEqual(result.highlights);
    expect(results.minigame?.aborted).toBe(false);
    expect(localView(PUMP_PARADE_INFO, 'results', { players: 3, seed: 7 }).minigame?.aborted).toBe(
      true,
    );
  });

  it('Münzen nach Standardregeln mit Gleichstand', () => {
    expect(localRewards(result)).toEqual({ 2: 10, 1: 5, 3: 5 });
    expect(localSlots(9)).toEqual([1, 2, 3, 4]);
    expect(localSlots(0)).toEqual([1]);
  });
});
