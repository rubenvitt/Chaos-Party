/**
 * Statistik je Spieler für Bonus-Anzeigen am Ende (M4, CHAOS-37). Reine Anzeige, ohne
 * Einfluss auf die Wertung; darum am Ende jedes `step` aus den neuen Ereignissen gezählt.
 */
import type { CoinReason } from '../types.ts';
import { playerOf, type Ctx } from './internal.ts';

/**
 * Verluste, die als Pech zählen (`coinsLost`, Titel „Pechvogel“, CHAOS-123): Minus-Felder,
 * Münzklau und Fallen. Trophäenkäufe sind Ausgaben und zählen nicht.
 */
const BAD_LUCK_REASONS: ReadonlySet<CoinReason> = new Set(['space', 'steal', 'trap']);

export function tallyStats(ctx: Ctx): void {
  for (const event of ctx.events) {
    switch (event.type) {
      case 'coins-changed': {
        const stats = playerOf(ctx, event.slot).stats;
        if (event.delta > 0) stats.coinsEarned += event.delta;
        else if (BAD_LUCK_REASONS.has(event.reason)) stats.coinsLost -= event.delta;
        break;
      }
      case 'moved':
        playerOf(ctx, event.slot).stats.spacesMoved += event.path.length;
        break;
      case 'item-used':
        playerOf(ctx, event.slot).stats.itemsUsed += 1;
        break;
      default:
        break;
    }
  }
}
