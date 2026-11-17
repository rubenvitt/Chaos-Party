/**
 * Entscheidungen (Prompts): Vergabe der fortlaufenden ID, Fristen (inkl. Verkürzung für
 * getrennte Spieler) und die konkreten Prompts des Zugablaufs.
 */
import type { GamePhase, ItemKind, PromptKind, PromptOption, Slot } from '../types.ts';
import { sabotageAmount } from './economy.ts';
import { activePlayer, playerOf, spaceOf, type Ctx } from './internal.ts';
import {
  coinsText,
  ITEM_LABELS,
  itemDetail,
  MAX_TITLE,
  displayText,
  pathLabel,
  playerLabel,
  reactionTitle,
  TEXT,
} from './labels.ts';

/** Items, die vor dem Wurf aktiv eingesetzt werden (Schild ist nur reaktiv). */
export const ACTIVE_ITEMS: readonly ItemKind[] = ['double-dice', 'coin-steal', 'trap'];

export const ROLL_OPTION = 'roll';
export const CANCEL_OPTION = 'cancel';
export const BUY_OPTION = 'buy';
export const SKIP_OPTION = 'skip';
export const SHIELD_OPTION = 'shield';
export const BRACE_OPTION = 'brace';
/** Standard des Reaktionsfensters: keine Reaktion (steht bewusst nicht in den Optionen). */
export const NO_REACTION_OPTION = 'none';

export function itemOption(item: ItemKind): string {
  return `item:${item}`;
}

export function slotOption(slot: Slot): string {
  return `slot:${String(slot)}`;
}

interface PromptSpec {
  readonly phase: GamePhase;
  readonly slot: Slot;
  readonly kind: PromptKind;
  readonly title: string;
  readonly options: readonly PromptOption[];
  readonly defaultOption: string;
  /** Reguläre Frist (absolut) oder `null`. */
  readonly deadline: number | null;
}

/** Frist für einen getrennten Spieler: höchstens `disconnectGraceMs` ab `t`. */
export function graceDeadline(ctx: Ctx, base: number | null, t: number): number {
  const grace = t + ctx.rules.pacing.disconnectGraceMs;
  return base === null ? grace : Math.min(base, grace);
}

export function openPrompt(ctx: Ctx, spec: PromptSpec, t: number): void {
  const { d } = ctx;
  const id = d.internal.promptSeq + 1;
  d.internal.promptSeq = id;
  d.internal.promptBaseDeadline = spec.deadline;
  const connected = playerOf(ctx, spec.slot).connected;
  d.phase = spec.phase;
  d.resumeAt = null;
  d.prompt = {
    id,
    slot: spec.slot,
    kind: spec.kind,
    title: displayText(spec.title, MAX_TITLE, 'Deine Wahl'),
    options: spec.options,
    defaultOption: spec.defaultOption,
    deadline: connected ? spec.deadline : graceDeadline(ctx, spec.deadline, t),
  };
}

/** Optionen vor dem Wurf: Würfeln plus je einsetzbarem Item (höchstens eins pro Zug). */
export function rollOptions(ctx: Ctx): PromptOption[] {
  const { d, rules } = ctx;
  const player = activePlayer(ctx);
  const double = d.internal.diceCount > 1;
  const options: PromptOption[] = [
    double
      ? { id: ROLL_OPTION, label: TEXT.rollOption, detail: TEXT.rollDetailDouble }
      : { id: ROLL_OPTION, label: TEXT.rollOption },
  ];
  if (d.internal.itemUsed) return options;
  for (const item of ACTIVE_ITEMS) {
    if (!player.items.includes(item)) continue;
    if (item === 'coin-steal' && d.players.length < 2) continue;
    if (item === 'trap' && d.traps.some((trap) => trap.spaceId === player.spaceId)) continue;
    const amount =
      item === 'trap' || item === 'coin-steal' ? sabotageAmount(rules.items, item, ctx.d.round) : 0;
    options.push({
      id: itemOption(item),
      label: ITEM_LABELS[item],
      detail: itemDetail(item, amount),
    });
  }
  return options;
}

export function openRollPrompt(ctx: Ctx, t: number): void {
  const player = activePlayer(ctx);
  openPrompt(
    ctx,
    {
      phase: 'roll',
      slot: player.slot,
      kind: 'roll',
      title: ctx.d.internal.diceCount > 1 ? TEXT.rollTitleDouble : TEXT.rollTitle,
      options: rollOptions(ctx),
      defaultOption: ROLL_OPTION,
      deadline: null,
    },
    t,
  );
}

export function openTargetPrompt(ctx: Ctx, t: number): void {
  const player = activePlayer(ctx);
  const options: PromptOption[] = ctx.d.players
    .filter((p) => p.slot !== player.slot)
    .map((p) => ({
      id: slotOption(p.slot),
      label: playerLabel(p.name, p.slot),
      detail: coinsText(p.coins),
      slot: p.slot,
    }));
  options.push({ id: CANCEL_OPTION, label: TEXT.cancelOption });
  openPrompt(
    ctx,
    {
      phase: 'choose-target',
      slot: player.slot,
      kind: 'target',
      title: TEXT.targetTitle,
      options,
      defaultOption: CANCEL_OPTION,
      deadline: null,
    },
    t,
  );
}

export function openPathPrompt(ctx: Ctx, t: number): void {
  const player = activePlayer(ctx);
  const here = spaceOf(ctx, player.spaceId);
  const options: PromptOption[] = here.next.map((id, index) => ({
    id,
    label: pathLabel(spaceOf(ctx, id).label, index),
  }));
  openPrompt(
    ctx,
    {
      phase: 'choose-path',
      slot: player.slot,
      kind: 'path',
      title: TEXT.pathTitle,
      options,
      defaultOption: here.next[0] ?? '',
      deadline: null,
    },
    t,
  );
}

export function openTrophyPrompt(ctx: Ctx, t: number): void {
  const player = activePlayer(ctx);
  openPrompt(
    ctx,
    {
      phase: 'trophy-offer',
      slot: player.slot,
      kind: 'trophy',
      title: TEXT.trophyTitle,
      options: [
        { id: BUY_OPTION, label: TEXT.trophyBuy, detail: coinsText(ctx.rules.trophy.price) },
        { id: SKIP_OPTION, label: TEXT.trophySkip },
      ],
      defaultOption: SKIP_OPTION,
      deadline: null,
    },
    t,
  );
}

export function openReactionPrompt(ctx: Ctx, attacker: Slot, target: Slot, t: number): void {
  const targetPlayer = playerOf(ctx, target);
  const attackerPlayer = playerOf(ctx, attacker);
  const options: PromptOption[] = [];
  if (targetPlayer.items.includes('shield')) {
    options.push({ id: SHIELD_OPTION, label: TEXT.shieldOption, detail: TEXT.shieldDetail });
  }
  options.push({ id: BRACE_OPTION, label: TEXT.braceOption, detail: TEXT.braceDetail });
  openPrompt(
    ctx,
    {
      phase: 'reaction-window',
      slot: target,
      kind: 'reaction',
      title: reactionTitle(attackerPlayer.name, attacker),
      options,
      defaultOption: NO_REACTION_OPTION,
      deadline: t + ctx.rules.pacing.reactionWindowMs,
    },
    t,
  );
}
