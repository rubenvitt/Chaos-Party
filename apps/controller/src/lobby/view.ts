/**
 * Lobby mit Charakterwahl am Controller (v4, CHAOS-36, ADR-015). Rein, ohne DOM: dieselbe
 * Ableitung nutzen iPhone (`CharacterLobby`), iPad-Zone (`ZoneBoard`) und die Zonen-Geometrie.
 *
 * Der Server entscheidet, was geht (`actions`: `ready`, `pick-character`) und welche Figuren
 * vergeben sind (`lobby.takenCharacters`). Der Controller zeigt nur: eigene Wahl hervorgehoben
 * (auch eine gerade gesendete, noch unbestätigte), vergebene Figuren ausgegraut – mit Farbe und
 * Symbol des Besitzers laut `lobby.takenBy` (geräteübergreifend, CHAOS-40). Fehlt `takenBy`
 * (älterer Server), hilft das eigene Gerät: Nachbarzonen eines geteilten iPads; sonst neutral.
 */
import {
  CHARACTER_IDS,
  CHARACTER_NAMES,
  type CharacterId,
  type SlotNumber,
} from '@chaos-party/protocol';
import type { SlotContext } from '../state/reducer.ts';

export type CharacterCardState = 'mine' | 'free' | 'taken';

export interface CharacterCard {
  readonly id: CharacterId;
  readonly name: string;
  readonly blurb: string;
  readonly state: CharacterCardState;
  /** Eigene Wahl ist gesendet, aber noch nicht vom Server bestätigt. */
  readonly pending: boolean;
  /** Besitzer einer vergebenen Figur (Server `takenBy` bzw. Nachbarzone), sonst `null`. */
  readonly ownerSlot: SlotNumber | null;
  /** Antippen wählt diese Figur (frei und Wählen erlaubt). */
  readonly selectable: boolean;
}

export interface LobbyView {
  readonly cards: readonly CharacterCard[];
  /** Eigene Figur (inklusive gesendeter Wahl) oder `null`. */
  readonly character: CharacterId | null;
  /** Server hat „bereit“ bestätigt (Layout `wait`). */
  readonly ready: boolean;
  /** „Bereit!“ wird angeboten. */
  readonly canReady: boolean;
  readonly rounds: number;
  /** „5 Runden“ */
  readonly roundsLabel: string;
  /**
   * Gewähltes Brett der nächsten Partie („Wackelwald“, „Zufallsbrett“, CHAOS-197) oder `null`
   * (älterer Server ohne `lobby.board`).
   */
  readonly boardName: string | null;
  /** Kurzer Hinweis unter der Auswahl. */
  readonly hint: string;
}

/** Figur eines anderen Platzes auf demselben Gerät (geteiltes iPad). */
export interface SiblingCharacter {
  readonly slot: SlotNumber;
  readonly character: CharacterId | null;
}

export const LOBBY_TITLE = 'Wähle deine Figur';
export const HINT_PICK = 'Tippe auf eine Figur.';
export const HINT_PICKED = 'Gute Wahl! Jetzt „Bereit!“ tippen.';
export const HINT_READY = 'Du bist bereit! Umwählen geht noch – dann noch mal „Bereit!“.';
export const TAKEN_LABEL = 'vergeben';
export const MINE_LABEL = 'Deine Figur';

export function roundsLabel(rounds: number): string {
  return rounds === 1 ? '1 Runde' : `${String(rounds)} Runden`;
}

/**
 * Lobby-Ansicht eines Slots oder `null`, wenn der Kontext keine Charakterwahl trägt
 * (älterer Server; dann zeigt der Controller nur „Bereit!“).
 */
export function describeLobby(
  context: SlotContext | undefined,
  pending: CharacterId | undefined,
  siblings: readonly SiblingCharacter[] = [],
): LobbyView | null {
  const lobby = context?.lobby;
  if (context?.phase !== 'lobby' || lobby === undefined) return null;
  const canPick = context.actions.includes('pick-character');
  const taken = new Set(lobby.takenCharacters);
  // Eine vorgemerkte Wahl, die inzwischen jemand anderes hat, zählt nicht mehr.
  const mine = pending !== undefined && !taken.has(pending) ? pending : lobby.character;
  const ready = context.layout === 'wait';
  const cards = CHARACTER_IDS.map((id): CharacterCard => {
    const state: CharacterCardState = id === mine ? 'mine' : taken.has(id) ? 'taken' : 'free';
    const owner =
      state !== 'taken'
        ? undefined
        : (lobby.takenBy?.find((entry) => entry.character === id) ??
          siblings.find((s) => s.character === id));
    return {
      id,
      name: CHARACTER_NAMES[id].name,
      blurb: CHARACTER_NAMES[id].blurb,
      state,
      pending: state === 'mine' && pending === id && lobby.character !== id,
      ownerSlot: owner?.slot ?? null,
      selectable: canPick && state === 'free',
    };
  });
  return {
    cards,
    character: mine,
    ready,
    canReady: context.actions.includes('ready'),
    rounds: lobby.rounds,
    roundsLabel: roundsLabel(lobby.rounds),
    boardName: lobby.board?.name ?? null,
    hint: ready ? HINT_READY : mine === null ? HINT_PICK : HINT_PICKED,
  };
}
