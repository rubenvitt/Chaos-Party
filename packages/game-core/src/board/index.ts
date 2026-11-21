/**
 * Brett-Topologie als Daten und ihre Validierung (CHAOS-18, ADR-011), dazu das Brett-Register
 * für die Lobby-Auswahl (CHAOS-197).
 * Exporte: `DEFAULT_BOARD`, `BOARDS`, `getBoard`, `validateBoard`, `BOARD_REGISTRY`,
 * `getBoardInfo`, `randomBoard`; drehende Felder (CHAOS-199): `activeNext`, `rotationExit` u. a.;
 * Eis, Seilbahn und Lawinen (CHAOS-198): `isIce`, `cableCarAt`, `avalancheAt` u. a.
 */
import type { BoardDefinition } from '../types.ts';
import { BOARD_REGISTRY } from './registry.ts';
import { WACKELWALD } from './wackelwald.ts';

export {
  MAX_SPACE_LABEL_LENGTH,
  MIN_SPACE_DISTANCE,
  validateBoard,
  type BoardValidation,
} from './validate.ts';
export {
  BOARD_REGISTRY,
  getBoardInfo,
  MAX_BOARD_TAGLINE_LENGTH,
  randomBoard,
  type BoardInfo,
  type BoardTheme,
} from './registry.ts';
export { WACKELWALD } from './wackelwald.ts';
export { CAROUSEL_SPACE, RUMMELPLATZ } from './rummelplatz.ts';
export { FROSTGIPFEL, MOUNTAIN_STATION, VALLEY_STATION } from './frostgipfel.ts';
export { avalancheAt, avalancheWarning, cableCarAt, isCableEdge, isIce } from './hazards.ts';
export { activeNext, isChoiceFork, rotationAt, rotationExit, rotationIndex } from './rotation.ts';

/** Standardbrett jeder Partie. */
export const DEFAULT_BOARD: BoardDefinition = WACKELWALD;

/** Alle bekannten Bretter nach ID (aus dem Register). */
export const BOARDS: Readonly<Record<string, BoardDefinition>> = Object.fromEntries(
  BOARD_REGISTRY.map((info) => [info.id, info.board]),
);

/** Brett zu einer ID (z. B. aus `BoardView.boardId`) oder `undefined`. */
export function getBoard(id: string): BoardDefinition | undefined {
  return Object.hasOwn(BOARDS, id) ? BOARDS[id] : undefined;
}
