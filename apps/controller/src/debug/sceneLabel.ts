/**
 * Szenenname für die RTT je Szene der Messanzeige (CHAOS-39), passend zu den Szenen des
 * Hosts: `lobby`, `arena`, `brett`, `minispiel` (Spiel) bzw. `minispiel:intro`/`:results`,
 * `endstand`. Rein, aus dem Kontext des (ersten) Platzes.
 */
import type { SlotContext } from '../state/reducer.ts';

export function controllerScene(context: SlotContext | undefined): string | null {
  if (!context) return null;
  if (context.phase === 'lobby') return 'lobby';
  if (context.phase === 'play') return 'arena';
  if (context.minigame) {
    return context.minigame.stage === 'play' ? 'minispiel' : `minispiel:${context.minigame.stage}`;
  }
  if (context.board?.gamePhase === 'game-results') return 'endstand';
  return 'brett';
}
