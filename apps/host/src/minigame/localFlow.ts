/**
 * Lokaler Minispiel-Ablauf ohne Server (`?local=1&minigame=<id>&flow=1`, M3): baut die
 * Brett-Stände, die sonst der Server schickt – Intro → Spiel → Ergebnis –, damit Anleitung
 * und Ergebnisanzeige ohne Server angeschaut und fotografiert werden können. Rein.
 *
 * Münzen im Ergebnis: die Standardregeln (`DEFAULT_RULES.economy.minigameRewards`) – im echten
 * Spiel kommen sie vom Server. Trostpreis (CHAOS-51, EXP-019): Der letzte Platz bekommt
 * `DEFAULT_RULES.items.minigameLastItems` Items, hier fest `LOCAL_PRIZE` statt gezogen.
 */
import { DEFAULT_BOARD, DEFAULT_RULES } from '@chaos-party/game-core';
import type { MinigameInfo } from '@chaos-party/minigame-sdk';
import {
  defaultCharacterFor,
  PLAYER_SLOTS,
  type BoardView,
  type ItemKindName,
  type SlotNumber,
} from '@chaos-party/protocol';
import type { MinigameResultPayload } from '../net/hostConnection.ts';
import type { MinigameStageName } from './plan.ts';

/** So lange zeigt der lokale Ablauf die Anleitung (ohne Testmodus). */
export const LOCAL_INTRO_MS = 8_000;
/** Runde des lokalen Minispiels. */
export const LOCAL_ROUND = 1;
/** Fester Trostpreis im lokalen Ablauf (im Spiel zieht der Server ihn zufällig). */
export const LOCAL_PRIZE: ItemKindName = 'shield';

export interface LocalFlowState {
  readonly view: BoardView;
  readonly rewards: Partial<Record<SlotNumber, number>> | null;
}

const START_SPACE = DEFAULT_BOARD.spaces[0]?.id ?? 'start';

export function localSlots(count: number): SlotNumber[] {
  return ([1, 2, 3, 4] as const).slice(0, Math.max(1, Math.min(4, count)));
}

/** Brett-Stand eines lokalen Minispiel-Abschnitts. */
export function localView(
  info: Pick<MinigameInfo, 'id' | 'durationMs'>,
  stage: MinigameStageName,
  options: {
    readonly players: number;
    readonly seed: number;
    readonly result?: MinigameResultPayload | null;
  },
): BoardView {
  const slots = localSlots(options.players);
  const result = options.result ?? null;
  return {
    boardId: DEFAULT_BOARD.id,
    gamePhase:
      stage === 'intro'
        ? 'minigame-intro'
        : stage === 'play'
          ? 'minigame-play'
          : 'minigame-results',
    round: LOCAL_ROUND,
    rounds: LOCAL_ROUND,
    turnOrder: slots,
    activeSlot: null,
    players: slots.map((slot) => ({
      slot,
      name: PLAYER_SLOTS[slot].label,
      spaceId: START_SPACE,
      coins: DEFAULT_RULES.economy.startCoins,
      trophies: 0,
      items: [],
      connected: true,
      character: defaultCharacterFor(slot),
      minigameWins: 0,
      stats: { coinsEarned: 0, coinsLost: 0, spacesMoved: 0, itemsUsed: 0 },
    })),
    trophySpaces: [],
    trophyPrice: DEFAULT_RULES.trophy.price,
    traps: [],
    prompt: null,
    remainingMs: stage === 'intro' ? LOCAL_INTRO_MS : stage === 'play' ? info.durationMs : null,
    stepMs: DEFAULT_RULES.pacing.stepMs,
    ranking: null,
    minigame: {
      id: info.id,
      round: LOCAL_ROUND,
      seed: options.seed >>> 0,
      playMs: info.durationMs,
      elapsedMs: stage === 'intro' ? null : 0,
      placements:
        stage === 'results' && result ? result.placements.map((entry) => ({ ...entry })) : null,
      highlights: stage === 'results' && result ? [...(result.highlights ?? [])] : [],
      aborted: stage === 'results' && !result,
      rewards: stage === 'results' ? (result ? localRewardEntries(result) : []) : null,
    },
    paused: false,
    endedEarly: false,
  };
}

/** Belohnungen wie vom Server: Münzen nach Platz, Trostpreis für den letzten Platz. */
function localRewardEntries(result: MinigameResultPayload) {
  const lastPlace = Math.max(...result.placements.map((entry) => entry.place));
  const prizes = DEFAULT_RULES.items.minigameLastItems ?? 0;
  return result.placements.map((entry) => ({
    slot: entry.slot,
    coins: DEFAULT_RULES.economy.minigameRewards[entry.place - 1] ?? 0,
    ...(entry.place === lastPlace && lastPlace > 1 && prizes > 0
      ? { items: Array.from({ length: Math.min(prizes, 4) }, () => LOCAL_PRIZE) }
      : {}),
  }));
}

/** Münzen je Slot nach Platz (Standardregeln). */
export function localRewards(result: MinigameResultPayload): Partial<Record<SlotNumber, number>> {
  const rewards: Partial<Record<SlotNumber, number>> = {};
  for (const entry of result.placements) {
    rewards[entry.slot] = DEFAULT_RULES.economy.minigameRewards[entry.place - 1] ?? 0;
  }
  return rewards;
}
