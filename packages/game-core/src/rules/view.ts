/**
 * Öffentliche Sicht auf den Spielstand (ohne `internal`, ohne Standardoption und absolute
 * Fristen). Form passt zu `BoardViewSchema` im Protokoll; Fristen werden zu Restzeiten.
 */
import type {
  GamePhase,
  ItemKind,
  PromptKind,
  PromptOption,
  RankingEntry,
  Slot,
  GameState,
} from '../types.ts';

export interface PublicPrompt {
  readonly id: number;
  readonly slot: Slot;
  readonly kind: PromptKind;
  readonly title: string;
  readonly options: readonly PromptOption[];
  /** Restzeit bis zur Frist (ms, aufgerundet) oder `null` = unbegrenzt. */
  readonly remainingMs: number | null;
}

export interface PublicPlayer {
  readonly slot: Slot;
  readonly name: string;
  readonly spaceId: string;
  readonly coins: number;
  readonly trophies: number;
  readonly items: readonly ItemKind[];
  readonly connected: boolean;
}

export interface PublicGameView {
  readonly boardId: string;
  readonly gamePhase: GamePhase;
  readonly round: number;
  readonly rounds: number;
  readonly turnOrder: readonly Slot[];
  readonly activeSlot: Slot | null;
  readonly players: readonly PublicPlayer[];
  readonly trophySpaces: readonly string[];
  readonly trophyPrice: number;
  readonly traps: readonly { readonly spaceId: string; readonly owner: Slot }[];
  readonly prompt: PublicPrompt | null;
  /** Restzeit der laufenden automatischen Phase (ms) oder `null`. */
  readonly remainingMs: number | null;
  readonly stepMs: number;
  readonly ranking: readonly RankingEntry[] | null;
}

function remaining(until: number | null, at: number): number | null {
  return until === null ? null : Math.max(0, Math.ceil(until - at));
}

/** Öffentliche Sicht zum Zeitpunkt `at` (Standard: `state.now`). */
export function toPublicView(state: GameState, at: number = state.now): PublicGameView {
  const prompt = state.prompt;
  return {
    boardId: state.boardId,
    gamePhase: state.phase,
    round: state.round,
    rounds: state.rounds,
    turnOrder: [...state.turnOrder],
    activeSlot: state.activeSlot,
    players: state.players.map((p) => ({
      slot: p.slot,
      name: p.name,
      spaceId: p.spaceId,
      coins: p.coins,
      trophies: p.trophies,
      items: [...p.items],
      connected: p.connected,
    })),
    trophySpaces: [...state.trophySpaces],
    trophyPrice: state.config.rules.trophy.price,
    traps: state.traps.map((t) => ({ spaceId: t.spaceId, owner: t.owner })),
    prompt: prompt
      ? {
          id: prompt.id,
          slot: prompt.slot,
          kind: prompt.kind,
          title: prompt.title,
          options: prompt.options.map((o) => ({ ...o })),
          remainingMs: remaining(prompt.deadline, at),
        }
      : null,
    remainingMs: remaining(state.resumeAt, at),
    stepMs: state.config.rules.pacing.stepMs,
    ranking: state.ranking ? state.ranking.map((r) => ({ ...r })) : null,
  };
}
