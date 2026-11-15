/**
 * Reaktionsfenster (CHAOS-21): Das Ziel eines Münzklaus darf kurz reagieren.
 * - `shield`: Schild wird verbraucht, nichts wird geklaut.
 * - `brace` („Festhalten!“): Verlust halbiert, abgerundet (also zugunsten des Ziels).
 * - keine Reaktion bis zur Frist: voller Klau (`stealAmount`, höchstens Bestand).
 * Danach zeigt der PC das Ergebnis `spaceEventMs` lang, dann geht der Zug des Angreifers
 * mit seinem Würfel-Prompt weiter.
 */
import type { ItemKind, Slot } from '../types.ts';
import { transferCoins } from './economy.ts';
import { playerOf, schedule, type Ctx } from './internal.ts';
import { BRACE_OPTION, openReactionPrompt, SHIELD_OPTION } from './prompts.ts';

export type ReactionResult = 'shield' | 'brace' | 'timeout';

export function openReaction(
  ctx: Ctx,
  attacker: Slot,
  target: Slot,
  item: ItemKind,
  t: number,
): void {
  ctx.d.internal.reaction = { attacker, target, item };
  openReactionPrompt(ctx, attacker, target, t);
  const prompt = ctx.d.prompt;
  if (!prompt) throw new Error('Reaktions-Prompt fehlt');
  ctx.events.push({
    type: 'reaction-opened',
    promptId: prompt.id,
    slot: target,
    attacker,
    item,
    // Tatsächliche Frist des Prompts (bei getrenntem Ziel ggf. verkürzt), für die PC-Anzeige.
    deadline: prompt.deadline ?? t + ctx.rules.pacing.reactionWindowMs,
  });
}

/**
 * Verlust beim Klau: voller Klau = `min(stealAmount, Bestand)`; „Festhalten!“ halbiert das,
 * abgerundet (zugunsten des Ziels); Schild = 0.
 */
export function stealLoss(stealAmount: number, owned: number, result: ReactionResult): number {
  if (result === 'shield') return 0;
  const full = Math.min(Math.max(0, stealAmount), Math.max(0, owned));
  return result === 'brace' ? Math.floor(full / 2) : full;
}

/** Wahl (oder Fristablauf mit `none`) im Reaktionsfenster auflösen. */
export function resolveReaction(ctx: Ctx, option: string, t: number): void {
  const reaction = ctx.d.internal.reaction;
  if (!reaction) throw new Error('Kein Reaktionsfenster offen');
  const { attacker, target } = reaction;
  const result: ReactionResult =
    option === SHIELD_OPTION ? 'shield' : option === BRACE_OPTION ? 'brace' : 'timeout';
  ctx.events.push({ type: 'reaction-resolved', slot: target, result });
  if (result === 'shield') {
    const targetPlayer = playerOf(ctx, target);
    const index = targetPlayer.items.indexOf('shield');
    if (index >= 0) targetPlayer.items.splice(index, 1);
    ctx.events.push({ type: 'item-used', slot: target, item: 'shield' });
  } else {
    const amount = stealLoss(ctx.rules.items.stealAmount, playerOf(ctx, target).coins, result);
    const moved = transferCoins(ctx, target, attacker, amount, 'steal');
    ctx.events.push({ type: 'coins-stolen', from: target, to: attacker, amount: moved });
  }
  schedule(ctx, 'reaction-window', t, ctx.rules.pacing.spaceEventMs);
}
