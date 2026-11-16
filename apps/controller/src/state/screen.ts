/**
 * Welcher Bildschirm ein Slot zeigt (M4, CHAOS-36/37/38): eine Stelle für iPhone
 * (`SlotController`) und iPad-Zone (`ZoneBoard`). Rein, ohne DOM, nur aus dem Server-Kontext –
 * deshalb stellt ein neuer Kontext nach Neuladen/Wiederverbinden (ADR-009) in jeder Phase
 * genau den richtigen Bildschirm wieder her.
 *
 * Vorrang: Pause vor allem (auch vor dem Minispiel), dann Endstand, dann das Layout.
 */
import type { SlotContext } from './reducer.ts';

export type SlotScreen =
  /** Noch kein Kontext oder Warten ohne eigene Rolle. */
  | 'wait'
  /** Lobby mit Charakterwahl (v4), bereit oder nicht. */
  | 'lobby'
  /** Lobby ohne Charakterwahl (älterer Server): nur „Bereit!“. */
  | 'lobby-basic'
  /** Joystick + Knöpfe (Minispiel oder M1-Arena). */
  | 'play'
  /** Partie pausiert (`board.paused`): keine Eingaben. */
  | 'pause'
  /** Endstand (`game-results`): Platz, Trophäen, Münzen. */
  | 'final'
  /** Minispiel-Anleitung oder -Ergebnis. */
  | 'minigame'
  /** Brettphase: eigene Entscheidung oder wer dran ist. */
  | 'board';

export function describeSlotScreen(context: SlotContext | undefined): SlotScreen {
  if (!context) return 'wait';
  if (context.phase === 'lobby') {
    if (context.lobby !== undefined) return 'lobby';
    return context.layout === 'lobby' ? 'lobby-basic' : 'wait';
  }
  if (context.board?.paused === true) return 'pause';
  if (context.board?.gamePhase === 'game-results' && context.layout === 'board') return 'final';
  switch (context.layout) {
    case 'joystick-buttons':
      return 'play';
    case 'board':
      return context.minigame ? 'minigame' : 'board';
    case 'lobby':
      return 'lobby-basic';
    case 'wait':
      return 'wait';
  }
}
