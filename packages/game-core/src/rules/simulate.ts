/**
 * Bot-Simulation ganzer Partien für Balance-Experimente (CHAOS-24, M4: CHAOS-40): Brett-Tempo,
 * Münzbelohnungen, Item-Häufigkeit, Reaktionsdauer, Partiedauer mit echten Minispielen.
 * Deterministisch je Seed.
 *
 * Die Simulation ersetzt keinen menschlichen Spaßtest; sie liefert objektive Kennzahlen
 * (Dauer, Abstände, Sabotage-Häufigkeit) für den Vergleich von Regelvarianten.
 */
import { rankByScore } from '@chaos-party/minigame-sdk';
import { activeNext } from '../board/rotation.ts';
import { createRng, pickOne, type Rng } from '../rng.ts';
import type {
  BoardDefinition,
  BoardEventKind,
  GameEvent,
  GameState,
  ItemKind,
  MinigameSpec,
  PlayerState,
  Prompt,
  RankingEntry,
  RuleSet,
  Slot,
  StepResult,
} from '../types.ts';
import { DEFAULT_RULES } from './defaults.ts';
import { rankPlayers } from './economy.ts';
import { ITEM_KINDS } from './items.ts';
import { createGame, step } from './machine.ts';
import { PLACEHOLDER_MINIGAME } from './minigame.ts';
import {
  BRACE_OPTION,
  BUY_OPTION,
  CANCEL_OPTION,
  ROLL_OPTION,
  SHIELD_OPTION,
  SKIP_OPTION,
} from './prompts.ts';
import { BOARD_EVENT_KINDS } from './spaces.ts';

/** Bereich [min, max] in ms, gleichverteilt. */
export type MsRange = readonly [number, number];

/**
 * Rechtsschiefe Zeitverteilung (log-normal) wie bei menschlichen Reaktionszeiten: meist
 * um den Median, selten deutlich länger. `sigma` = Streuung des Logarithmus.
 */
export interface LogNormalMs {
  readonly medianMs: number;
  readonly sigma: number;
  /** Untergrenze (schneller geht es nicht: Wahrnehmung + Tippen). */
  readonly minMs: number;
}

/** Zeitmodell: gleichverteilter Bereich oder log-normal. */
export type DelayModel = MsRange | LogNormalMs;

export interface BotPolicy {
  /** Wahrscheinlichkeit, im Würfel-Prompt ein angebotenes Item einzusetzen. */
  readonly itemUseChance: number;
  /** Trophäe kaufen, wenn möglich. */
  readonly buyTrophies: boolean;
  /** Ziel des Münzklaus: reichster Mitspieler oder zufällig. */
  readonly target: 'richest' | 'random';
  /** Wahrscheinlichkeit, im Reaktionsfenster überhaupt zu reagieren. */
  readonly reactionChance: number;
  /** Reaktionszeit; liegt sie hinter der Frist, ist die Reaktion zu spät (`stale-prompt`). */
  readonly reactionDelayMs: DelayModel;
  /** Entscheidungszeit für alle anderen Prompts (Würfeln, Weg, Trophäe, Ziel). */
  readonly decisionMs: MsRange;
  /**
   * Wahrscheinlichkeit, an einer Verzweigung den Weg mit der kürzesten Strecke zur aktiven
   * Trophäe zu nehmen (sonst zufällig). 0 = immer zufällig (bisheriges Verhalten).
   */
  readonly trophyPathChance: number;
  /**
   * Sichtbare Fallen (CHAOS-51, EXP-019): Wahrscheinlichkeit, an einer Verzweigung Wege zu
   * meiden, auf denen in den nächsten `TRAP_LOOKAHEAD` Feldern eine fremde Falle liegt (nur
   * wenn ein Weg ohne Falle bleibt). Wird vor der Trophäen-Wahl geprüft. 0 = Fallen sind
   * egal bzw. unsichtbar (bisheriges Verhalten).
   */
  readonly avoidTrapChance: number;
  /**
   * Echte Minispiele (M3/M4): So lange nach Ende der Spielzeit meldet der „Host“ das Ergebnis
   * (Abschlussbild, Netz). Nur mit `SimulationOptions.minigames`.
   */
  readonly minigameResultDelayMs: number;
  /**
   * Punkte je Spieler und Minispiel: gleichverteilt 0 … `minigameScoreSpread` plus Können
   * (`minigameSkill`). Kleine Spannweite = mehr Gleichstände.
   */
  readonly minigameScoreSpread: number;
  /** Zusatzpunkte je Slot im Minispiel (Können; fehlt = 0). */
  readonly minigameSkill: Readonly<Partial<Record<Slot, number>>>;
}

export const DEFAULT_BOT_POLICY: BotPolicy = {
  itemUseChance: 0.5,
  buyTrophies: true,
  target: 'richest',
  reactionChance: 0.7,
  reactionDelayMs: [600, 3600],
  decisionMs: [800, 2500],
  trophyPathChance: 0,
  avoidTrapChance: 0,
  minigameResultDelayMs: 500,
  // Gleichstand auf Platz 1 bei 4 Spielern ≈ 4 %, wie die echten Minispiele (EXP-005 … 007).
  minigameScoreSpread: 40,
  minigameSkill: {},
};

export interface SimulationOptions {
  readonly board: BoardDefinition;
  readonly rules?: RuleSet;
  readonly rounds: number;
  readonly seed: number;
  readonly players: 2 | 3 | 4;
  readonly policy?: Partial<BotPolicy>;
  /**
   * Echte Minispiele (Katalog-Rotation): game-core zieht je Runde eines, die Bots liefern ein
   * Ergebnis nach Spielzeit + `minigameResultDelayMs`. Fehlt/leer = M2-Platzhalter.
   */
  readonly minigames?: readonly MinigameSpec[];
}

export interface SimulationPlayerResult {
  readonly slot: Slot;
  readonly place: number;
  readonly coins: number;
  readonly trophies: number;
  /** Summe aller Münzgewinne der Partie (`PlayerStats.coinsEarned`). */
  readonly coinsEarned: number;
}

/** Ein Münzverlust durch Sabotage (Klau nach Reaktion oder ausgelöste Falle). */
export interface SabotageLoss {
  readonly kind: 'steal' | 'trap';
  /** Geschädigter Spieler. */
  readonly slot: Slot;
  /** Tatsächlich verlorene Münzen (0 z. B. bei leerem Beutel). */
  readonly amount: number;
  /** Bestand unmittelbar vor dem Verlust. */
  readonly before: number;
  /** Runde, in der der Verlust geschah (1 … `rounds`). */
  readonly round: number;
}

export interface SimulationResult {
  readonly seed: number;
  readonly players: number;
  readonly rounds: number;
  /** Geschätzte Partiedauer: Pacing-Zeiten + Bot-Entscheidungszeiten (ms). */
  readonly durationMs: number;
  readonly turns: number;
  /** Dauer je Zug von `turn-started` bis `turn-ended` (ms). */
  readonly turnDurationsMs: readonly number[];
  readonly avgTurnMs: number;
  /** Gewürfelte Bewegung je Zug (ohne Windstoß/Tausch). */
  readonly spacesPerTurn: readonly number[];
  readonly avgSpacesPerTurn: number;
  readonly standings: readonly SimulationPlayerResult[];
  readonly ranking: readonly RankingEntry[];
  /**
   * Zwischenstand nach Runde `floor(rounds / 2)` (gleiche Wertung wie der Endstand), `null`
   * bei weniger als 2 Runden. Für den Aufholeffekt: Wie oft gewinnt, wer zur Hälfte führt?
   */
  readonly midRanking: readonly RankingEntry[] | null;
  /** Gespielte Minispiele (ohne Platzhalter: echte mit Ergebnis). */
  readonly minigamesPlayed: number;
  /** Spielerzustand am Ende (Statistik, Minispiel-Siege) für nachgelagerte Wertungsvarianten. */
  readonly finalPlayers: readonly PlayerState[];
  /** Minispiele mit geteiltem 1. Platz. */
  readonly minigameSharedWins: number;
  /** Trophäen Platz 1 minus Platz 2 (`null` bei einem Spieler). */
  readonly trophyGap: number | null;
  readonly trophiesBought: number;
  /** Gekaufte Trophäen je Feld (CHAOS-199: Sind alle Trophäen-Kandidaten erreichbar?). */
  readonly trophySpacesBought: Readonly<Record<string, number>>;
  /** Gewählte Wege je Ziel-Feld an Gabeln (`path-chosen`, auch automatisch gewählte). */
  readonly pathsChosen: Readonly<Record<string, number>>;
  /** Durchfahrten drehender Felder je Ausgang (Karussell, CHAOS-199). */
  readonly rotationExits: Readonly<Record<string, number>>;
  readonly coinSteals: number;
  readonly coinsStolen: number;
  readonly trapsPlaced: number;
  readonly trapsTriggered: number;
  /** Fallen, die ein Schild abgefangen hat (`shieldBlocksTrap`); zählen nicht als ausgelöst. */
  readonly trapsBlocked: number;
  readonly coinsLostToTraps: number;
  readonly reactions: Readonly<Record<'shield' | 'brace' | 'timeout', number>>;
  /** Reaktionen, die nach der Frist kamen (`stale-prompt`). */
  readonly lateReactions: number;
  /** Je Reaktionsfenster: Zeit von der Öffnung bis zur Auflösung (ms, ohne Ergebnisanzeige). */
  readonly reactionWaitsMs: readonly number[];
  /** Münzverluste durch Sabotage, in Reihenfolge (Schild-Abwehr erzeugt keinen Eintrag). */
  readonly sabotageLosses: readonly SabotageLoss[];
  readonly itemsGained: Readonly<Record<ItemKind, number>>;
  readonly itemsUsed: Readonly<Record<ItemKind, number>>;
  readonly boardEvents: Readonly<Record<BoardEventKind, number>>;
  readonly autoChoices: number;
  readonly events: number;
}

const MAX_COMMANDS = 1_000_000;
const SIM_NAMES = ['Rot', 'Blau', 'Grün', 'Gelb'] as const;

function counter<K extends string>(keys: readonly K[]): Record<K, number> {
  const result = {} as Record<K, number>;
  for (const key of keys) result[key] = 0;
  return result;
}

/** Zeit ziehen: Bereich gleichverteilt, log-normal per Box-Muller (beides seeded). */
export function sampleDelay(rng: Rng, model: DelayModel): number {
  if (!('medianMs' in model)) return inRange(rng, model);
  const u1 = 1 - rng.next(); // (0, 1], damit log(u1) endlich bleibt
  const u2 = rng.next();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return Math.max(Math.round(model.minMs), Math.round(model.medianMs * Math.exp(model.sigma * z)));
}

function inRange(rng: Rng, [min, max]: MsRange): number {
  const lo = Math.max(0, Math.round(Math.min(min, max)));
  const hi = Math.max(0, Math.round(Math.max(min, max)));
  return rng.int(lo, hi);
}

/**
 * Schritte von `from` bis zum nächsten der `targets` entlang der Laufrichtung (BFS), mit der
 * Stellung der drehenden Felder in Runde `round` (CHAOS-199): Bots sehen das Karussell wie die
 * Spieler am Tisch.
 */
function distanceTo(
  board: BoardDefinition,
  from: string,
  targets: readonly string[],
  round: number,
): number {
  const next = new Map(board.spaces.map((space) => [space.id, activeNext(board, space.id, round)]));
  const seen = new Set([from]);
  let frontier = [from];
  for (let distance = 0; frontier.length > 0; distance++) {
    if (frontier.some((id) => targets.includes(id))) return distance;
    const following: string[] = [];
    for (const id of frontier) {
      for (const to of next.get(id) ?? []) {
        if (!seen.has(to)) {
          seen.add(to);
          following.push(to);
        }
      }
    }
    frontier = following;
  }
  return Infinity;
}

/** So weit (Felder) schaut ein Bot an einer Verzweigung nach sichtbaren Fallen. */
export const TRAP_LOOKAHEAD = 6;

function choosePath(
  candidates: readonly string[],
  state: GameState,
  board: BoardDefinition,
  policy: BotPolicy,
  rng: Rng,
): string {
  let ids = candidates;
  if (policy.avoidTrapChance > 0 && rng.next() < policy.avoidTrapChance) {
    const slot = state.prompt?.slot;
    const traps = state.traps.filter((trap) => trap.owner !== slot).map((trap) => trap.spaceId);
    const safe = ids.filter((id) => distanceTo(board, id, traps, state.round) >= TRAP_LOOKAHEAD);
    if (traps.length > 0 && safe.length > 0) ids = safe;
  }
  if (policy.trophyPathChance > 0 && rng.next() < policy.trophyPathChance) {
    const distances = ids.map((id) => distanceTo(board, id, state.trophySpaces, state.round));
    const best = Math.min(...distances);
    const nearest = ids.filter((_, index) => distances[index] === best);
    if (best !== Infinity && nearest.length > 0) return pickOne(rng, nearest);
  }
  return pickOne(rng, ids);
}

function decide(
  prompt: Prompt,
  state: GameState,
  board: BoardDefinition,
  policy: BotPolicy,
  rng: Rng,
): string {
  const ids = prompt.options.map((o) => o.id);
  switch (prompt.kind) {
    case 'roll': {
      const items = ids.filter((id) => id !== ROLL_OPTION);
      if (items.length > 0 && rng.next() < policy.itemUseChance) return pickOne(rng, items);
      return ROLL_OPTION;
    }
    case 'target': {
      const targets = prompt.options.filter((o) => o.slot !== undefined);
      if (targets.length === 0) return CANCEL_OPTION;
      if (policy.target === 'random') return pickOne(rng, targets).id;
      const coinsOf = (slot: Slot | undefined): number =>
        state.players.find((p) => p.slot === slot)?.coins ?? 0;
      return targets.reduce((best, o) => (coinsOf(o.slot) > coinsOf(best.slot) ? o : best)).id;
    }
    case 'path':
      return choosePath(ids, state, board, policy, rng);
    case 'trophy':
      return policy.buyTrophies ? BUY_OPTION : SKIP_OPTION;
    case 'reaction':
      return ids.includes(SHIELD_OPTION) ? SHIELD_OPTION : BRACE_OPTION;
  }
}

/** Eine Partie mit Bots zu Ende spielen und Kennzahlen sammeln. */
export function simulateGame(options: SimulationOptions): SimulationResult {
  const policy: BotPolicy = { ...DEFAULT_BOT_POLICY, ...options.policy };
  const rules = options.rules ?? DEFAULT_RULES;
  const slots = ([1, 2, 3, 4] as const).slice(0, options.players);
  let state = createGame({
    board: options.board,
    rules,
    rounds: options.rounds,
    seed: options.seed,
    players: slots.map((slot) => ({ slot, name: SIM_NAMES[slot - 1] ?? `Bot ${String(slot)}` })),
    ...(options.minigames ? { minigames: options.minigames } : {}),
  });
  // Eigener Zufall für Bot-Entscheidungen, damit der Spiel-RNG nur Regeln bedient.
  const bot = createRng((options.seed ^ 0x5bd1e995) >>> 0);

  const turnDurations: number[] = [];
  const spacesPerTurn: number[] = [];
  const reactions = { shield: 0, brace: 0, timeout: 0 };
  const itemsGained = counter(ITEM_KINDS);
  const itemsUsed = counter(ITEM_KINDS);
  const boardEvents = counter(BOARD_EVENT_KINDS);
  let turnStart = 0;
  let turnSpaces = 0;
  let round = 0;
  let countingMoves = false;
  let trophiesBought = 0;
  const trophySpacesBought: Record<string, number> = {};
  const pathsChosen: Record<string, number> = {};
  const rotationExits: Record<string, number> = {};
  const rotating = new Map((options.board.rotations ?? []).map((r) => [r.space, r.exits]));
  const positions = new Map<Slot, string>(slots.map((slot) => [slot, options.board.start]));
  const bump = (record: Record<string, number>, key: string): void => {
    record[key] = (record[key] ?? 0) + 1;
  };
  let coinSteals = 0;
  let coinsStolen = 0;
  let trapsPlaced = 0;
  let trapsTriggered = 0;
  let trapsBlocked = 0;
  /** Letztes Ereignis war eine Falle ohne Verlust: ein folgender Schild hat sie abgefangen. */
  let trapWithoutLoss = false;
  let coinsLostToTraps = 0;
  let lateReactions = 0;
  const reactionWaits: number[] = [];
  let reactionOpenedAt = 0;
  const sabotageLosses: SabotageLoss[] = [];
  const coins = new Map<Slot, number>(slots.map((slot) => [slot, rules.economy.startCoins]));
  let autoChoices = 0;
  let eventCount = 0;

  const record = (event: GameEvent, at: number): void => {
    eventCount += 1;
    const blockedTrap = trapWithoutLoss && event.type === 'item-used' && event.item === 'shield';
    trapWithoutLoss = event.type === 'trap-triggered' && event.amount === 0;
    if (blockedTrap) {
      // CHAOS-51: Schild gegen Falle – keine Sabotage, kein Verlust-Eintrag.
      trapsTriggered -= 1;
      trapsBlocked += 1;
      sabotageLosses.pop();
    }
    switch (event.type) {
      case 'turn-started':
        round = event.round;
        turnStart = at;
        turnSpaces = 0;
        countingMoves = false;
        break;
      case 'dice-rolled':
        countingMoves = true;
        break;
      case 'moved': {
        if (countingMoves) turnSpaces += event.path.length;
        let from = positions.get(event.slot);
        for (const to of event.path) {
          // Nur echte Ausfahrten, kein Platztausch vom Karussell weg.
          if (from !== undefined && rotating.get(from)?.includes(to)) bump(rotationExits, to);
          from = to;
        }
        if (from !== undefined) positions.set(event.slot, from);
        break;
      }
      case 'path-chosen':
        bump(pathsChosen, event.spaceId);
        break;
      case 'board-event':
        countingMoves = false;
        boardEvents[event.event] += 1;
        break;
      case 'turn-ended':
        turnDurations.push(at - turnStart);
        spacesPerTurn.push(turnSpaces);
        countingMoves = false;
        break;
      case 'trophy-bought':
        trophiesBought += 1;
        bump(trophySpacesBought, event.spaceId);
        break;
      case 'item-gained':
        itemsGained[event.item] += 1;
        break;
      case 'item-used':
        itemsUsed[event.item] += 1;
        if (event.item === 'coin-steal') coinSteals += 1;
        break;
      case 'coins-changed':
        coins.set(event.slot, event.balance);
        break;
      case 'coins-stolen':
        coinsStolen += event.amount;
        // Der Transfer ist schon verbucht: Bestand davor = jetzt + Verlust.
        sabotageLosses.push({
          kind: 'steal',
          slot: event.from,
          amount: event.amount,
          before: (coins.get(event.from) ?? 0) + event.amount,
          round,
        });
        break;
      case 'trap-placed':
        trapsPlaced += 1;
        break;
      case 'trap-triggered':
        trapsTriggered += 1;
        coinsLostToTraps += event.amount;
        // Das Ereignis kommt vor dem Transfer: Bestand ist noch der alte.
        sabotageLosses.push({
          kind: 'trap',
          slot: event.slot,
          amount: event.amount,
          before: coins.get(event.slot) ?? 0,
          round,
        });
        break;
      case 'reaction-opened':
        reactionOpenedAt = at;
        break;
      case 'reaction-resolved':
        reactions[event.result] += 1;
        reactionWaits.push(at - reactionOpenedAt);
        break;
      case 'player-auto':
        autoChoices += 1;
        break;
      default:
        break;
    }
  };

  const midRound = Math.floor(options.rounds / 2);
  let midRanking = null as RankingEntry[] | null;
  let minigamesPlayed = 0;
  let minigameSharedWins = 0;

  const apply = (result: StepResult, at: number): void => {
    if (!result.ok) {
      throw new Error(
        `Simulation: unerwarteter Fehler ${result.error.code}: ${result.error.message}`,
      );
    }
    state = result.state;
    for (const event of result.events) {
      record(event, at);
      if (event.type === 'round-ended' && event.round === midRound && midRound >= 1) {
        midRanking = rankPlayers(state.players);
      }
      if (event.type === 'minigame-results' && !event.aborted) {
        minigamesPlayed += 1;
        if (event.placements.filter((p) => p.place === 1).length > 1) minigameSharedWins += 1;
      }
    }
  };

  /** Ergebnis eines echten Minispiels: Punkte je Slot, Plätze wie im SDK („1224“). */
  const minigameResult = (minigame: NonNullable<GameState['minigame']>, at: number): void => {
    const spec = options.minigames?.find((m) => m.id === minigame.id);
    const scores = state.players.map((p) => {
      const base = bot.int(0, Math.max(0, Math.round(policy.minigameScoreSpread)));
      const skill = policy.minigameSkill[p.slot] ?? 0;
      return { slot: p.slot, score: spec?.scoring === 'lower' ? base - skill : base + skill };
    });
    apply(
      step(state, {
        type: 'minigame-result',
        minigameId: minigame.id,
        round: minigame.round,
        placements: rankByScore(scores, spec?.scoring ?? 'higher'),
        at,
      }),
      at,
    );
  };

  apply(step(state, { type: 'start', at: 0 }), 0);
  for (let i = 0; state.phase !== 'game-results'; i++) {
    if (i > MAX_COMMANDS) throw new Error('Simulation endet nicht');
    const prompt = state.prompt;
    const minigame = state.minigame;
    if (
      prompt === null &&
      state.phase === 'minigame-play' &&
      minigame !== null &&
      minigame.id !== PLACEHOLDER_MINIGAME &&
      minigame.placements === null &&
      minigame.playStartedAt !== null
    ) {
      const at = Math.max(
        state.now,
        minigame.playStartedAt + minigame.playMs + policy.minigameResultDelayMs,
      );
      minigameResult(minigame, at);
      continue;
    }
    if (prompt === null) {
      if (state.resumeAt === null) throw new Error(`Simulation hängt in Phase ${state.phase}`);
      apply(step(state, { type: 'tick', at: state.resumeAt }), state.resumeAt);
      continue;
    }
    if (prompt.kind === 'reaction' && !(bot.next() < policy.reactionChance)) {
      // Keine Reaktion: Fenster läuft ab.
      const at = prompt.deadline ?? state.now;
      apply(step(state, { type: 'tick', at }), at);
      continue;
    }
    const delay =
      prompt.kind === 'reaction'
        ? sampleDelay(bot, policy.reactionDelayMs)
        : inRange(bot, policy.decisionMs);
    const at = state.now + delay;
    const option = decide(prompt, state, options.board, policy, bot);
    const result = step(state, {
      type: 'choose',
      slot: prompt.slot,
      promptId: prompt.id,
      option,
      at,
    });
    if (!result.ok && result.error.code === 'stale-prompt' && prompt.kind === 'reaction') {
      lateReactions += 1;
      // Das Fenster ist an der Frist zu Ende gegangen; ab dort läuft die Partie weiter.
      const deadline = prompt.deadline ?? at;
      apply(step(state, { type: 'tick', at: deadline }), deadline);
      continue;
    }
    apply(result, at);
  }

  const ranking = state.ranking ?? [];
  const first = ranking[0];
  const second = ranking[1];
  const mean = (values: readonly number[]): number =>
    values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

  return {
    seed: options.seed,
    players: options.players,
    rounds: options.rounds,
    durationMs: state.now,
    turns: turnDurations.length,
    turnDurationsMs: turnDurations,
    avgTurnMs: mean(turnDurations),
    spacesPerTurn,
    avgSpacesPerTurn: mean(spacesPerTurn),
    standings: ranking.map((r) => ({
      slot: r.slot,
      place: r.place,
      coins: r.coins,
      trophies: r.trophies,
      coinsEarned: state.players.find((p) => p.slot === r.slot)?.stats.coinsEarned ?? 0,
    })),
    ranking,
    midRanking,
    minigamesPlayed,
    finalPlayers: state.players,
    minigameSharedWins,
    trophyGap: first && second ? first.trophies - second.trophies : null,
    trophiesBought,
    trophySpacesBought,
    pathsChosen,
    rotationExits,
    coinSteals,
    coinsStolen,
    trapsPlaced,
    trapsTriggered,
    trapsBlocked,
    coinsLostToTraps,
    reactions,
    lateReactions,
    reactionWaitsMs: reactionWaits,
    sabotageLosses,
    itemsGained,
    itemsUsed,
    boardEvents,
    autoChoices,
    events: eventCount,
  };
}

export interface SimulationSummary {
  readonly games: number;
  readonly avgDurationMs: number;
  readonly avgTurnMs: number;
  readonly avgSpacesPerTurn: number;
  readonly avgTrophyGap: number;
  /** Anteil Partien, in denen Platz 1 geteilt ist. */
  readonly sharedWinRate: number;
  readonly avgTrophiesBought: number;
  readonly avgCoinSteals: number;
  readonly avgCoinsStolen: number;
  readonly avgTrapsTriggered: number;
  readonly reactionShares: Readonly<Record<'shield' | 'brace' | 'timeout', number>>;
  readonly avgFinalCoins: number;
}

/** Mittelwerte über mehrere Simulationen (z. B. Seeds 1–200 je Variante). */
export function summarizeSimulations(results: readonly SimulationResult[]): SimulationSummary {
  const n = results.length;
  const avg = (pick: (r: SimulationResult) => number): number =>
    n === 0 ? 0 : results.reduce((sum, r) => sum + pick(r), 0) / n;
  const totalReactions = results.reduce(
    (sum, r) => sum + r.reactions.shield + r.reactions.brace + r.reactions.timeout,
    0,
  );
  const share = (key: 'shield' | 'brace' | 'timeout'): number =>
    totalReactions === 0 ? 0 : results.reduce((s, r) => s + r.reactions[key], 0) / totalReactions;
  return {
    games: n,
    avgDurationMs: avg((r) => r.durationMs),
    avgTurnMs: avg((r) => r.avgTurnMs),
    avgSpacesPerTurn: avg((r) => r.avgSpacesPerTurn),
    avgTrophyGap: avg((r) => r.trophyGap ?? 0),
    sharedWinRate: avg((r) => (r.ranking.filter((e) => e.place === 1).length > 1 ? 1 : 0)),
    avgTrophiesBought: avg((r) => r.trophiesBought),
    avgCoinSteals: avg((r) => r.coinSteals),
    avgCoinsStolen: avg((r) => r.coinsStolen),
    avgTrapsTriggered: avg((r) => r.trapsTriggered),
    reactionShares: { shield: share('shield'), brace: share('brace'), timeout: share('timeout') },
    avgFinalCoins: avg((r) =>
      r.standings.length === 0
        ? 0
        : r.standings.reduce((s, p) => s + p.coins, 0) / r.standings.length,
    ),
  };
}
