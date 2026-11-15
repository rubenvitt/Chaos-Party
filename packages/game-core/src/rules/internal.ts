/**
 * Interner Arbeitszustand der Spielregeln.
 *
 * `step` kopiert den Eingangszustand in einen veränderbaren Entwurf (`Draft`), die
 * Regelmodule arbeiten darauf und sammeln Ereignisse; am Ende wird daraus wieder ein
 * `GameState`. Der Eingangszustand wird nie verändert.
 */
import { createRng, type Rng } from '../rng.ts';
import type {
  BoardDefinition,
  BoardSpace,
  GameEvent,
  GamePhase,
  GameState,
  ItemKind,
  PlayerState,
  Prompt,
  RankingEntry,
  RuleSet,
  Slot,
  TrapState,
} from '../types.ts';

/** Ausgang des gerade animierten Bewegungsabschnitts. */
export type MovePending = 'path' | 'trophy' | 'trap' | 'land';

export interface MoveState {
  /** Noch zu laufende Felder. */
  stepsLeft: number;
  /** An einer Verzweigung gewählter nächster Schritt (gilt für genau einen Schritt). */
  chosenNext: string | null;
  /** `null` = nächster Abschnitt wird berechnet, sonst: was am Abschnittsende passiert. */
  pending: MovePending | null;
}

export interface ReactionState {
  attacker: Slot;
  target: Slot;
  item: ItemKind;
}

/** Form von `GameState.internal` (nur game-core liest sie). */
export interface Internal {
  /** Brett-Topologie (Daten, wird nie verändert). */
  board: BoardDefinition;
  /** Fortsetzungszustand des RNG (`createRng(rng)`). */
  rng: number;
  /** Zuletzt vergebene Prompt-ID (0 = noch keiner). */
  promptSeq: number;
  /** Index des aktiven Spielers in `turnOrder`. */
  turnIndex: number;
  /** In diesem Zug schon ein Item eingesetzt? (höchstens eins pro Zug) */
  itemUsed: boolean;
  /** Zahl der Würfel für den nächsten Wurf (Doppelwürfel = 2). */
  diceCount: number;
  move: MoveState | null;
  reaction: ReactionState | null;
  /** Ursprüngliche Frist des offenen Prompts (ohne Verkürzung durch Disconnect). */
  promptBaseDeadline: number | null;
}

export type MutablePlayer = { -readonly [K in keyof PlayerState]: PlayerState[K] } & {
  items: ItemKind[];
};

export interface Draft {
  boardId: string;
  phase: GamePhase;
  round: number;
  rounds: number;
  turnOrder: Slot[];
  activeSlot: Slot | null;
  players: MutablePlayer[];
  trophySpaces: string[];
  traps: TrapState[];
  prompt: Prompt | null;
  resumeAt: number | null;
  now: number;
  ranking: readonly RankingEntry[] | null;
  config: GameState['config'];
  internal: Internal;
}

export interface Ctx {
  readonly d: Draft;
  readonly events: GameEvent[];
  readonly rng: Rng;
  readonly rules: RuleSet;
  readonly spaces: ReadonlyMap<string, BoardSpace>;
}

export function readInternal(state: GameState): Internal {
  return state.internal as unknown as Internal;
}

const spaceCache = new WeakMap<BoardDefinition, ReadonlyMap<string, BoardSpace>>();

export function spaceMap(board: BoardDefinition): ReadonlyMap<string, BoardSpace> {
  let map = spaceCache.get(board);
  if (!map) {
    map = new Map(board.spaces.map((space) => [space.id, space]));
    spaceCache.set(board, map);
  }
  return map;
}

/** Veränderbare Kopie des Zustands; das Brett wird geteilt (es ist unveränderlich). */
export function openDraft(state: GameState): Ctx {
  const internal = readInternal(state);
  const d: Draft = {
    boardId: state.boardId,
    phase: state.phase,
    round: state.round,
    rounds: state.rounds,
    turnOrder: [...state.turnOrder],
    activeSlot: state.activeSlot,
    players: state.players.map((p) => ({ ...p, items: [...p.items] })),
    trophySpaces: [...state.trophySpaces],
    traps: state.traps.map((t) => ({ ...t })),
    prompt: state.prompt,
    resumeAt: state.resumeAt,
    now: state.now,
    ranking: state.ranking,
    config: state.config,
    internal: {
      ...internal,
      move: internal.move ? { ...internal.move } : null,
      reaction: internal.reaction ? { ...internal.reaction } : null,
    },
  };
  return {
    d,
    events: [],
    rng: createRng(internal.rng),
    rules: state.config.rules,
    spaces: spaceMap(internal.board),
  };
}

export function closeDraft(ctx: Ctx): GameState {
  const { d } = ctx;
  const internal: Internal = { ...d.internal, rng: ctx.rng.state() };
  return {
    boardId: d.boardId,
    phase: d.phase,
    round: d.round,
    rounds: d.rounds,
    turnOrder: d.turnOrder,
    activeSlot: d.activeSlot,
    players: d.players,
    trophySpaces: d.trophySpaces,
    traps: d.traps,
    prompt: d.prompt,
    resumeAt: d.resumeAt,
    now: d.now,
    ranking: d.ranking,
    config: d.config,
    internal: internal as unknown as Readonly<Record<string, unknown>>,
  };
}

export function playerOf(ctx: Ctx, slot: Slot): MutablePlayer {
  const player = ctx.d.players.find((p) => p.slot === slot);
  if (!player) throw new Error(`Unbekannter Spieler ${String(slot)}`);
  return player;
}

export function activePlayer(ctx: Ctx): MutablePlayer {
  const slot = ctx.d.activeSlot;
  if (slot === null) throw new Error('Kein Spieler am Zug');
  return playerOf(ctx, slot);
}

export function spaceOf(ctx: Ctx, id: string): BoardSpace {
  const space = ctx.spaces.get(id);
  if (!space) throw new Error(`Unbekanntes Feld ${id}`);
  return space;
}

/** Automatische Phase setzen: läuft bis `t + ms`, kein Prompt offen. */
export function schedule(ctx: Ctx, phase: GamePhase, t: number, ms: number): void {
  ctx.d.phase = phase;
  ctx.d.prompt = null;
  ctx.d.internal.promptBaseDeadline = null;
  ctx.d.resumeAt = t + ms;
}
