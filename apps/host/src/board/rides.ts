/**
 * Bewegung der Fahrgeschäfte auf dem Rummelplatz (CHAOS-199), ohne Babylon: Karussell und
 * Riesenrad im PC-Host (`createBoardScene.ts`) und im nativen Apple-Host (`renderState().board
 * .rides`, `apps/apple-host/src/boardDirection.ts`) drehen sich gleich.
 *
 * - **Karussell:** Der Drehteil zeigt mit seiner Ausfahrt (lokal +z) auf den Ausgang, der in der
 *   gezeigten Runde gilt (`rotationExit`, ADR-020). Wechselt die Runde, fährt es in
 *   {@link CAROUSEL_TURN_MS} eine volle Runde plus den Weg zum neuen Ausgang, immer vorwärts.
 * - **Riesenrad:** dreht sich langsam und gleichmäßig.
 *
 * Winkel in Babylon-Koordinaten (linkshändig, y oben): `rotation.y = yaw` richtet lokal +z auf
 * `(sin yaw, 0, cos yaw)`. Der Apple-Host spiegelt x (Export), dort gilt der negative Winkel.
 */
import { rotationExit, type BoardDefinition, type BoardRotation } from '@chaos-party/game-core';

/** Knotenname des drehenden Karussell-Teils (USD: `karussell_dreh`). */
export const CAROUSEL_NODE = 'karussell-dreh';
/** Knotenname des Riesenrads (dreht um z; USD: `riesenrad_rad`). */
export const WHEEL_NODE = 'riesenrad-rad';
/** Dauer einer Karussellfahrt beim Rundenwechsel. */
export const CAROUSEL_TURN_MS = 3200;
/** Winkelgeschwindigkeit des Riesenrads (rad/s). */
export const WHEEL_SPEED = 0.12;

const TAU = Math.PI * 2;

/** Richtung (Yaw) vom drehenden Feld zum Ausgang der Runde `round`. */
export function carouselYaw(
  board: BoardDefinition,
  rotation: BoardRotation,
  round: number,
): number {
  const from = board.spaces.find((s) => s.id === rotation.space)?.position;
  const to = board.spaces.find((s) => s.id === rotationExit(rotation, round))?.position;
  if (!from || !to) return 0;
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export interface RideState {
  /** Drehteil des Karussells (`rotation.y`), `null` ohne Karussell. */
  readonly carousel: number | null;
  /** Riesenrad (`rotation.z`). */
  readonly wheel: number;
}

export interface RideMotion {
  /** `ms` weiter; `round` = Runde des gezeigten Stands (`null` ohne Stand). */
  advance(ms: number, round: number | null): void;
  /** Ohne Fahrt auf die Stellung der Runde springen (erster Stand, nach dem Minispiel). */
  settle(round: number | null): void;
  readonly state: RideState;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

/** Fahrgeschäfte eines Bretts (erstes drehendes Feld); ohne Drehung bleibt `carousel` `null`. */
export function createRideMotion(board: BoardDefinition): RideMotion {
  const rotation: BoardRotation | undefined = board.rotations?.[0];
  let elapsed = 0;
  let round: number | null = null;
  let angle = rotation ? carouselYaw(board, rotation, 1) : 0;
  let turn: { from: number; to: number; t: number } | null = null;

  const target = (r: number): number => (rotation ? carouselYaw(board, rotation, r) : 0);

  return {
    advance(ms, shown) {
      elapsed += Math.max(0, ms);
      if (rotation && shown !== null && shown !== round) {
        if (round === null) {
          angle = target(shown);
        } else {
          // Immer vorwärts: eine volle Runde plus der Weg zum neuen Ausgang.
          const wanted = target(shown);
          const delta = (((wanted - angle) % TAU) + TAU) % TAU;
          turn = { from: angle, to: angle + delta + TAU, t: 0 };
        }
        round = shown;
      }
      if (turn) {
        turn.t = Math.min(1, turn.t + Math.max(0, ms) / CAROUSEL_TURN_MS);
        angle = turn.from + (turn.to - turn.from) * easeInOut(turn.t);
        if (turn.t >= 1) {
          angle = ((turn.to % TAU) + TAU) % TAU;
          turn = null;
        }
      }
    },
    settle(shown) {
      turn = null;
      round = shown;
      if (rotation && shown !== null) angle = target(shown);
    },
    get state(): RideState {
      return { carousel: rotation ? angle : null, wheel: (elapsed / 1000) * WHEEL_SPEED };
    },
  };
}
