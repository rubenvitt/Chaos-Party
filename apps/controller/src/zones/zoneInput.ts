/**
 * Vom Server-Kontext einer Zone zu dem, was sie anzeigen soll (rein, ohne DOM).
 */
import type { SlotNumber } from '@chaos-party/protocol';
import { describePrompt, isLocked, ownPrompt } from '../board/prompt.ts';
import type { PendingChoice, SlotContext } from '../state/reducer.ts';
import type { ZoneChoicesInput, ZoneControlsInput } from './geometry.ts';

/** Kennung eines Kontexts; ein neuer Kontext setzt „Bereit gesendet“ zurück (wie `LobbyPanel`). */
export function contextKey(context: SlotContext): string {
  return `${context.phase}:${context.layout}:${context.actions.join(',')}`;
}

/** Wahlknöpfe einer Zone in der Brettphase (CHAOS-22) oder `undefined` ohne eigenen Prompt. */
export function zoneChoicesInput(
  slot: SlotNumber,
  context: SlotContext | undefined,
  pending: PendingChoice | undefined,
): ZoneChoicesInput | undefined {
  const prompt = ownPrompt(context, slot);
  if (!prompt) return undefined;
  const view = describePrompt(prompt.info);
  return {
    promptId: prompt.info.id,
    main: view.main.map((choice) => choice.id),
    extra: view.extra.map((choice) => choice.id),
    instant: view.kind === 'reaction',
    locked: isLocked(prompt, pending),
  };
}

/**
 * Eingabe für {@link layoutZoneControls}. Ohne Kontext wartet die Zone.
 * `readySentFor` ist der Kontext, in dem diese Zone `ready` gesendet hat;
 * `pending` die gesendete, noch unbeantwortete Wahl dieses Slots (Brettphase).
 */
export function zoneControlsInput(
  context: SlotContext | undefined,
  readySentFor: string | undefined,
  slot?: SlotNumber,
  pending?: PendingChoice,
): ZoneControlsInput {
  if (!context) return { layout: 'wait', actions: [] };
  const choices = slot === undefined ? undefined : zoneChoicesInput(slot, context, pending);
  return {
    layout: context.layout,
    actions: context.actions,
    readySent: readySentFor !== undefined && readySentFor === contextKey(context),
    ...(choices !== undefined && { choices }),
  };
}
