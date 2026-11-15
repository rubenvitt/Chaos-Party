/**
 * Brettspiel in der Session (M2, ADR-011): verbindet die reinen Regeln aus
 * `@chaos-party/game-core` mit dem Protokoll.
 *
 * Die Klasse hält den autoritativen `GameState`, wendet Befehle an, sammelt die
 * Ereignisse für den Host (fortlaufend nummeriert) und baut daraus die Nachrichten:
 * `board` an den Host und je Slot den `context` mit Prompt und eigenem Stand.
 * Kein Netzwerkcode, keine Uhr: Zeitpunkte kommen von der Session.
 */
import {
  createGame,
  DEFAULT_BOARD,
  DEFAULT_RULES,
  getBoard,
  step,
  type GameCommand,
  type GameError,
  type GameEvent,
  type GameState,
  type Prompt,
  type RuleSet,
  type Slot,
} from '@chaos-party/game-core';
import {
  MAX_BOARD_EVENTS,
  type BoardEvent,
  type BoardMessage,
  type BoardView,
  type ControllerBoardInfo,
  type PromptInfo,
} from '@chaos-party/protocol';

/** Einstellungen des Brettspiels, die der Server vorgibt (Umgebung, Tests). */
export interface BoardGameSettings {
  /** Standard-Rundenzahl, wenn `start` keine nennt. */
  readonly rounds: number;
  /** Fester Seed (reproduzierbare Partien) oder `undefined` = zufällig je Partie. */
  readonly seed?: number | undefined;
  readonly rules: RuleSet;
  readonly boardId: string;
}

export const DEFAULT_ROUNDS = 5;

export const DEFAULT_GAME_SETTINGS: BoardGameSettings = {
  rounds: DEFAULT_ROUNDS,
  rules: DEFAULT_RULES,
  boardId: DEFAULT_BOARD.id,
};

export interface BoardGamePlayer {
  readonly slot: Slot;
  readonly name: string;
}

/** Entfernt `readonly` rekursiv (game-core-Typen sind unveränderlich, zod-Typen nicht). */
type DeepWritable<T> = T extends readonly (infer U)[]
  ? DeepWritable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepWritable<T[K]> }
    : T;

/**
 * Kopie eines Regel-Ereignisses fürs Protokoll. Die Zuweisung prüft zur Übersetzungszeit,
 * dass `GameEvent` (game-core) und `BoardEventSchema` (protocol) zusammenpassen (ADR-011).
 */
function toWireEvent(event: GameEvent): BoardEvent {
  const copy: DeepWritable<GameEvent> = structuredClone(event) as DeepWritable<GameEvent>;
  return copy;
}

export class BoardGame {
  private stateValue: GameState;
  /** Ereignisse, die noch nicht an den Host gingen. */
  private pending: BoardEvent[] = [];
  /** Laufende Nummer des ersten Ereignisses in `pending`. */
  private pendingSeq = 0;
  /** Gesamtzahl erzeugter Ereignisse (nächste freie Nummer). */
  private eventCount = 0;

  readonly seed: number;

  constructor(players: readonly BoardGamePlayer[], settings: BoardGameSettings, seed: number) {
    const board = getBoard(settings.boardId);
    if (!board) throw new Error(`Unbekanntes Brett: ${settings.boardId}`);
    this.seed = seed;
    this.stateValue = createGame({
      board,
      rules: settings.rules,
      rounds: settings.rounds,
      seed,
      players: players.map((player) => ({ slot: player.slot, name: player.name })),
    });
  }

  get state(): GameState {
    return this.stateValue;
  }

  /** Wendet einen Befehl an. Fehler lassen den Zustand unverändert. */
  apply(command: GameCommand): { ok: true } | { ok: false; error: GameError } {
    const result = step(this.stateValue, command);
    if (!result.ok) return { ok: false, error: result.error };
    this.stateValue = result.state;
    for (const event of result.events) {
      this.pending.push(toWireEvent(event));
      this.eventCount++;
    }
    return { ok: true };
  }

  hasSlot(slot: Slot): boolean {
    return this.stateValue.players.some((player) => player.slot === slot);
  }

  /**
   * Nächste `board`-Nachrichten für den Host mit allen noch nicht gesendeten Ereignissen
   * (bei sehr vielen Ereignissen mehrere Nachrichten, jede mit vollständigem `view`).
   */
  drainBoardMessages(now: number): Omit<BoardMessage, 'v' | 'type'>[] {
    const view = this.view(now);
    if (this.pending.length === 0) return [];
    const messages: Omit<BoardMessage, 'v' | 'type'>[] = [];
    for (let index = 0; index < this.pending.length; index += MAX_BOARD_EVENTS) {
      messages.push({
        view,
        events: this.pending.slice(index, index + MAX_BOARD_EVENTS),
        eventSeq: this.pendingSeq + index,
      });
    }
    this.pending = [];
    this.pendingSeq = this.eventCount;
    return messages;
  }

  /** Schnappschuss ohne neue Ereignisse (z. B. für einen neu verbundenen Host). */
  snapshotMessage(now: number): Omit<BoardMessage, 'v' | 'type'> {
    return { view: this.view(now), events: [], eventSeq: this.pendingSeq };
  }

  /** `true`, wenn seit der letzten `board`-Nachricht etwas passiert ist. */
  get dirty(): boolean {
    return this.pending.length > 0;
  }

  view(now: number): BoardView {
    const state = this.stateValue;
    return {
      boardId: state.boardId,
      gamePhase: state.phase,
      round: state.round,
      rounds: state.rounds,
      turnOrder: [...state.turnOrder],
      activeSlot: state.activeSlot,
      players: state.players.map((player) => ({
        slot: player.slot,
        name: player.name,
        spaceId: player.spaceId,
        coins: player.coins,
        trophies: player.trophies,
        items: [...player.items],
        connected: player.connected,
      })),
      trophySpaces: [...state.trophySpaces],
      trophyPrice: state.config.rules.trophy.price,
      traps: state.traps.map((trap) => ({ spaceId: trap.spaceId, owner: trap.owner })),
      prompt: state.prompt ? wirePrompt(state.prompt, now) : null,
      remainingMs: state.resumeAt === null ? null : remaining(state.resumeAt, now),
      stepMs: state.config.rules.pacing.stepMs,
      ranking: state.ranking ? state.ranking.map((entry) => ({ ...entry })) : null,
    };
  }

  /** Prompt dieses Slots (oder `undefined`) für den Controller-Kontext. */
  promptFor(slot: Slot, now: number): PromptInfo | undefined {
    const prompt = this.stateValue.prompt;
    if (!prompt || prompt.slot !== slot) return undefined;
    return wirePrompt(prompt, now);
  }

  /** Eigener Stand für die Controller-Kopfzeile. */
  infoFor(slot: Slot): ControllerBoardInfo | undefined {
    const state = this.stateValue;
    const player = state.players.find((candidate) => candidate.slot === slot);
    if (!player) return undefined;
    const place = state.ranking?.find((entry) => entry.slot === slot)?.place;
    return {
      gamePhase: state.phase,
      round: state.round,
      rounds: state.rounds,
      coins: player.coins,
      trophies: player.trophies,
      items: [...player.items],
      activeSlot: state.activeSlot,
      ...(place === undefined ? {} : { place }),
    };
  }
}

function remaining(deadline: number, now: number): number {
  return Math.max(0, Math.round(deadline - now));
}

function wirePrompt(prompt: Prompt, now: number): PromptInfo {
  return {
    id: prompt.id,
    slot: prompt.slot,
    kind: prompt.kind,
    title: prompt.title,
    options: prompt.options.map((option) => ({
      id: option.id,
      label: option.label,
      ...(option.detail === undefined ? {} : { detail: option.detail }),
      ...(option.slot === undefined ? {} : { slot: option.slot }),
    })),
    remainingMs: prompt.deadline === null ? null : remaining(prompt.deadline, now),
  };
}
