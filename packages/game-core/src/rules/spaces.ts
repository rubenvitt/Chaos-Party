/**
 * Feldwirkung nach dem letzten Schritt (Phase `space-event`): zuerst eine fremde Falle
 * (falls sie nicht schon beim Darüberlaufen ausgelöst hat), dann der Feldtyp. Brett-Ereignisse werden seeded gezogen.
 */
import { pickOne } from '../rng.ts';
import type { BoardEventKind } from '../types.ts';
import { changeCoins, wanderTrophy } from './economy.ts';
import { activePlayer, schedule, spaceOf, type Ctx } from './internal.ts';
import { gainRandomItem, triggerTrap } from './items.ts';
import { gustForward, slideOnIce, swapPlaces } from './movement.ts';

/** Alle Brett-Ereignisse, gleich wahrscheinlich. */
export const BOARD_EVENT_KINDS: readonly BoardEventKind[] = [
  'coin-rain',
  'gust',
  'swap',
  'trophy-shuffle',
  'lucky-find',
];

/** Münzregen: alle Spieler bekommen so viele Münzen. */
export const COIN_RAIN_AMOUNT = 2;
/** Glücksfund: der Spieler am Zug bekommt so viele Münzen. */
export const LUCKY_FIND_AMOUNT = 5;
/** Windstoß: so viele Felder vorwärts (gleichverteilt). */
export const GUST_MIN_STEPS = 1;
export const GUST_MAX_STEPS = 2;

export function applyBoardEvent(ctx: Ctx, event: BoardEventKind): void {
  const player = activePlayer(ctx);
  ctx.events.push({ type: 'board-event', slot: player.slot, event });
  switch (event) {
    case 'coin-rain':
      for (const p of ctx.d.players) changeCoins(ctx, p.slot, COIN_RAIN_AMOUNT, 'event');
      return;
    case 'lucky-find':
      changeCoins(ctx, player.slot, LUCKY_FIND_AMOUNT, 'event');
      return;
    case 'gust':
      gustForward(ctx, player.slot, ctx.rng.int(GUST_MIN_STEPS, GUST_MAX_STEPS));
      return;
    case 'swap': {
      const others = ctx.d.players.filter((p) => p.slot !== player.slot);
      if (others.length === 0) return;
      swapPlaces(ctx, player.slot, pickOne(ctx.rng, others).slot);
      return;
    }
    case 'trophy-shuffle':
      wanderTrophy(ctx);
      return;
  }
}

/**
 * Phase `space-event` betreten: auf Eis erst rutschen (CHAOS-198), dann Falle und Feldwirkung
 * des Felds, auf dem die Figur steht, dann Anzeige-Pause (gerutscht: so viel länger, wie die
 * Rutschpartie läuft).
 */
export function enterSpaceEvent(ctx: Ctx, t: number): void {
  const { rules } = ctx;
  const slid = slideOnIce(ctx, activePlayer(ctx).slot);
  triggerTrap(ctx);
  const player = activePlayer(ctx);
  const space = spaceOf(ctx, player.spaceId);
  switch (space.kind) {
    case 'coins-plus':
      changeCoins(ctx, player.slot, rules.economy.coinsPlus, 'space');
      break;
    case 'coins-minus':
      changeCoins(ctx, player.slot, -rules.economy.coinsMinus, 'space');
      break;
    case 'item':
      gainRandomItem(ctx, player.slot);
      break;
    case 'event':
      applyBoardEvent(ctx, pickOne(ctx.rng, BOARD_EVENT_KINDS));
      break;
    case 'start':
    case 'trophy':
      break;
  }
  schedule(ctx, 'space-event', t, rules.pacing.spaceEventMs + slid * rules.pacing.stepMs);
}
