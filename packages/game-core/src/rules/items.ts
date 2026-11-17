/**
 * Items (CHAOS-20): Doppelwürfel, Münzklau, Falle (aktiv vor dem Wurf, höchstens eins pro
 * Zug) und Schild (nur reaktiv im Reaktionsfenster).
 */
import { pickWeighted } from '../rng.ts';
import type { ItemKind, Slot } from '../types.ts';
import { sabotageAmount, transferCoins } from './economy.ts';
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

/** Liegt auf `spaceId` eine Falle, die `slot` auslösen würde (fremde Besitzerin)? */
export function hasForeignTrap(ctx: Ctx, spaceId: string, slot: Slot): boolean {
  return ctx.d.traps.some((trap) => trap.spaceId === spaceId && trap.owner !== slot);
}

/** Fremde Falle auf dem Feld des Spielers am Zug auslösen (eigene Fallen lösen nicht aus). */
export function triggerTrap(ctx: Ctx): void {
  const { d } = ctx;
  const player = activePlayer(ctx);
  const index = d.traps.findIndex(
    (trap) => trap.spaceId === player.spaceId && trap.owner !== player.slot,
  );
  if (index < 0) return;
  const trap = d.traps[index];
  if (!trap) return;
  d.traps.splice(index, 1);
  const amount = Math.min(sabotageAmount(ctx.rules.items, 'trap', d.round), player.coins);
  ctx.events.push({
    type: 'trap-triggered',
    slot: player.slot,
    owner: trap.owner,
    spaceId: trap.spaceId,
    amount,
  });
  transferCoins(ctx, player.slot, trap.owner, amount, 'trap');
}
