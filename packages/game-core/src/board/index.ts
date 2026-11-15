/**
 * Brett-Topologie als Daten und ihre Validierung (CHAOS-18, ADR-011).
 * Exporte: `DEFAULT_BOARD`, `BOARDS`, `getBoard`, `validateBoard`.
 */
import type { BoardDefinition } from '../types.ts';
import { WACKELWALD } from './wackelwald.ts';

export {
  MAX_SPACE_LABEL_LENGTH,
  MIN_SPACE_DISTANCE,
  validateBoard,
  type BoardValidation,
} from './validate.ts';
export { WACKELWALD } from './wackelwald.ts';

/** Standardbrett jeder Partie. */
export const DEFAULT_BOARD: BoardDefinition = WACKELWALD;

/** Alle bekannten Bretter nach ID. */
export const BOARDS: Readonly<Record<string, BoardDefinition>> = {
  [WACKELWALD.id]: WACKELWALD,
};

/** Brett zu einer ID (z. B. aus `BoardView.boardId`) oder `undefined`. */
export function getBoard(id: string): BoardDefinition | undefined {
  return Object.hasOwn(BOARDS, id) ? BOARDS[id] : undefined;
}
