import { defaultCharacterFor, type CharacterId, type SlotNumber } from '@chaos-party/protocol';
import type { SlotContext } from './reducer.ts';

/**
 * Eigene Figur eines Slots laut Server (Plakette, CHAOS-61 + CHAOS-36): im Spiel
 * `board.character`, in der Lobby die bestätigte Wahl (`lobby.character`), sonst – noch nicht
 * gewählt oder älterer Server – der Vorschlag des Slots (`defaultCharacterFor`, wie die Lobby
 * am PC).
 */
export function ownCharacter(slot: SlotNumber, context: SlotContext | undefined): CharacterId {
  return context?.board?.character ?? context?.lobby?.character ?? defaultCharacterFor(slot);
}
