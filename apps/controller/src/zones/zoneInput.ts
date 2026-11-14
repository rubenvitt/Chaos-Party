/**
 * Vom Server-Kontext einer Zone zu dem, was sie anzeigen soll (rein, ohne DOM).
 */
import type { SlotContext } from '../state/reducer.ts';
import type { ZoneControlsInput } from './geometry.ts';

/** Kennung eines Kontexts; ein neuer Kontext setzt „Bereit gesendet“ zurück (wie `LobbyPanel`). */
export function contextKey(context: SlotContext): string {
  return `${context.phase}:${context.layout}:${context.actions.join(',')}`;
}

/**
 * Eingabe für {@link layoutZoneControls}. Ohne Kontext wartet die Zone.
 * `readySentFor` ist der Kontext, in dem diese Zone `ready` gesendet hat.
 */
export function zoneControlsInput(
  context: SlotContext | undefined,
  readySentFor: string | undefined,
): ZoneControlsInput {
  if (!context) return { layout: 'wait', actions: [] };
  return {
    layout: context.layout,
    actions: context.actions,
    readySent: readySentFor !== undefined && readySentFor === contextKey(context),
  };
}
