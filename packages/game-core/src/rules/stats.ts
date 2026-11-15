/**
 * Statistik je Spieler für Bonus-Anzeigen am Ende (M4, CHAOS-37). Reine Anzeige, ohne
 * Einfluss auf die Wertung; darum am Ende jedes `step` aus den neuen Ereignissen gezählt.
 */
import { playerOf, type Ctx } from './internal.ts';

export function tallyStats(ctx: Ctx): void {
  for (const event of ctx.events) {
    switch (event.type) {
      case 'coins-changed': {
        const stats = playerOf(ctx, event.slot).stats;
        if (event.delta > 0) stats.coinsEarned += event.delta;
        else stats.coinsLost -= event.delta;
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
