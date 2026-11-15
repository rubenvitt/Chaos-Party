/**
 * Reine Regeln für Pause und vorzeitiges Ende am PC (CHAOS-36, ADR-014). Ohne React/DOM.
 *
 * - Pausieren geht in der Brettphase zwischen Spielstart und Endstand (auch im Minispiel).
 * - Tasten: **P** oder **Esc** pausiert; in der Pause setzt **P** fort, **Esc** schließt erst
 *   die Rückfrage „Partie beenden?“ und setzt sonst fort.
 * - Maßgeblich ist immer `view.paused` des Servers (auch nach dem Neuladen des Hosts); der Host
 *   zeigt die Pause erst, wenn der Server sie bestätigt.
 */
import type { BoardView } from '@chaos-party/protocol';

export type PauseAction = 'pause' | 'resume' | 'close-confirm';

/** Darf der Host gerade pausieren (Knopf und Taste)? */
export function canPause(view: Pick<BoardView, 'gamePhase' | 'paused'> | null): boolean {
  if (!view || view.paused) return false;
  return view.gamePhase !== 'setup' && view.gamePhase !== 'game-results';
}

/** Taste → Aktion (oder `null`, wenn die Taste hier nichts bedeutet). */
export function pauseKeyAction(
  code: string,
  state: {
    readonly view: Pick<BoardView, 'gamePhase' | 'paused'> | null;
    readonly confirming: boolean;
  },
): PauseAction | null {
  if (code !== 'KeyP' && code !== 'Escape') return null;
  const { view, confirming } = state;
  if (view?.paused) {
    if (code === 'Escape' && confirming) return 'close-confirm';
    return 'resume';
  }
  return canPause(view) ? 'pause' : null;
}
