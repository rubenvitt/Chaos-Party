/**
 * Items (CHAOS-20): Doppelwürfel, Münzklau, Falle (aktiv vor dem Wurf, höchstens eins pro
 * Zug) und Schild (nur reaktiv im Reaktionsfenster).
 */
import { pickWeighted } from '../rng.ts';
import type { ItemKind, Slot } from '../types.ts';
import { activePlayer, playerOf, type Ctx } from './internal.ts';
import { openRollPrompt, openTargetPrompt } from './prompts.ts';
import { openReaction } from './reaction.ts';

/** Feste Reihenfolge für gewichtete Züge (Determinismus unabhängig von Objekt-Reihenfolge). */
export const ITEM_KINDS: readonly ItemKind[] = ['double-dice', 'coin-steal', 'trap', 'shield'];

function removeItem(items: ItemKind[], item: ItemKind): void {
  const index = items.indexOf(item);
  if (index < 0) throw new Error(`Item ${item} nicht vorhanden`);
  items.splice(index, 1);
}

/** Item aus dem Würfel-Prompt einsetzen (Gültigkeit hat `step` schon geprüft). */
export function useItemFromRoll(ctx: Ctx, item: ItemKind, t: number): void {
  const player = activePlayer(ctx);
  switch (item) {
    case 'double-dice':
      removeItem(player.items, item);
      ctx.d.internal.itemUsed = true;
      ctx.d.internal.diceCount = 2;
      ctx.events.push({ type: 'item-used', slot: player.slot, item });
      openRollPrompt(ctx, t);
      return;
    case 'trap':
      removeItem(player.items, item);
      ctx.d.internal.itemUsed = true;
      ctx.d.traps.push({ spaceId: player.spaceId, owner: player.slot });
      ctx.events.push({ type: 'item-used', slot: player.slot, item });
      ctx.events.push({ type: 'trap-placed', slot: player.slot, spaceId: player.spaceId });
      openRollPrompt(ctx, t);
      return;
    case 'coin-steal':
      // Erst das Ziel wählen; das Item wird erst mit der Zielwahl verbraucht.
      openTargetPrompt(ctx, t);
      return;
    case 'shield':
      throw new Error('Schild ist nur im Reaktionsfenster einsetzbar');
  }
}

/** Münzklau auf `target`: Item weg, dann Reaktionsfenster des Ziels. */
export function useCoinSteal(ctx: Ctx, target: Slot, t: number): void {
  const player = activePlayer(ctx);
  removeItem(player.items, 'coin-steal');
  ctx.d.internal.itemUsed = true;
  ctx.events.push({ type: 'item-used', slot: player.slot, item: 'coin-steal', target });
  openReaction(ctx, player.slot, target, 'coin-steal', t);
}

/** Gewichteter Item-Zug auf einem `item`-Feld; bei voller Kapazität gibt es nichts. */
export function gainRandomItem(ctx: Ctx, slot: Slot): void {
  const player = playerOf(ctx, slot);
  const { capacity, weights } = ctx.rules.items;
  if (player.items.length >= capacity) return;
  const item = pickWeighted(
    ctx.rng,
    ITEM_KINDS.map((kind) => [kind, weights[kind]] as const),
  );
  if (item === null) return;
  player.items.push(item);
  ctx.events.push({ type: 'item-gained', slot, item });
}
