/**
 * Welche Client-Nachrichten in welcher Phase erlaubt sind. Der Server prüft
 * das nach dem Schema; Verstöße beantwortet er mit `out-of-phase`.
 */
import type { ClientMessageType, InputIntentType, Phase } from './types.ts';

const ALLOWED: Readonly<Record<Phase, ReadonlySet<ClientMessageType>>> = {
  lobby: new Set<ClientMessageType>([
    'join',
    'reconnect',
    'ready',
    'heartbeat',
    'host-hello',
    'start',
  ]),
  play: new Set<ClientMessageType>([
    'reconnect',
    'move',
    'press',
    'release',
    'gesture',
    'reaction',
    'heartbeat',
    'host-hello',
  ]),
  board: new Set<ClientMessageType>(['reconnect', 'choose', 'heartbeat', 'host-hello']),
};

/** `true`, wenn eine Nachricht dieses Typs in der Phase angenommen werden darf. */
export function isIntentAllowed(phase: Phase, type: ClientMessageType): boolean {
  return ALLOWED[phase].has(type);
}

/** Spieleingaben, die der Server an den Host weiterleitet (`input`). */
export const INPUT_INTENT_TYPES: readonly InputIntentType[] = [
  'move',
  'press',
  'release',
  'gesture',
  'reaction',
];

const INPUT_INTENTS: ReadonlySet<string> = new Set(INPUT_INTENT_TYPES);

export function isInputIntentType(type: string): type is InputIntentType {
  return INPUT_INTENTS.has(type);
}
