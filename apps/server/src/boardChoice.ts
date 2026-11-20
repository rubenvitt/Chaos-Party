/**
 * Brett-Wahl der Lobby (CHAOS-197): verbindet das Brett-Register aus `@chaos-party/game-core`
 * mit dem Protokoll. Die Wahl ist eine Brett-ID oder `RANDOM_BOARD` („zufall“); erst beim Start
 * wird daraus ein Brett (`resolveBoardChoice`, Zufall per Seed der Partie).
 */
import {
  BOARD_REGISTRY,
  getBoardInfo,
  randomBoard,
  type BoardDefinition,
} from '@chaos-party/game-core';
import { RANDOM_BOARD, RANDOM_BOARD_NAME, type LobbyBoard } from '@chaos-party/protocol';

/** Ist das eine gültige Wahl (Brett aus dem Register oder Zufall)? */
export function isBoardChoice(choice: string): boolean {
  return choice === RANDOM_BOARD || getBoardInfo(choice) !== undefined;
}

/** Alle gültigen Wahlen (für Hinweise): Brett-IDs in Register-Reihenfolge, dann Zufall. */
export function boardChoices(): string[] {
  return [...BOARD_REGISTRY.map((info) => info.id), RANDOM_BOARD];
}

/** Brett der Partie: die gewählte ID, bei Zufall eins aus dem Register nach Seed. */
export function resolveBoardChoice(choice: string, seed: number): BoardDefinition {
  if (choice === RANDOM_BOARD) return randomBoard(seed);
  const info = getBoardInfo(choice);
  if (!info) throw new Error(`Unbekanntes Brett: ${choice}`);
  return info.board;
}

/** Anzeigename der Wahl („Wackelwald“, „Zufallsbrett“). */
export function boardChoiceName(choice: string): string {
  return choice === RANDOM_BOARD ? RANDOM_BOARD_NAME : (getBoardInfo(choice)?.board.name ?? choice);
}

/** Wählbare Bretter für `lobby.settings.boards`, in Register-Reihenfolge. */
export function lobbyBoards(): LobbyBoard[] {
  return BOARD_REGISTRY.map((info) => ({
    id: info.id,
    name: info.board.name,
    tagline: info.tagline,
    spaces: info.board.spaces.length,
    recommendedRounds: info.recommendedRounds,
  }));
}
