/**
 * Reine Geometrie der Brett-Darstellung (CHAOS-18/19): Figur-Versatz bei mehreren Figuren
 * auf einem Feld, Hüpfbahn, Kameraziel, Brettgrenzen. Ohne Babylon – unit-getestet.
 */
import type { BoardDefinition } from '@chaos-party/game-core';

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

export interface BoardBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly center: Point2;
}

/** Abstand der Figuren vom Feldmittelpunkt, wenn sich mehrere ein Feld teilen. */
export const PAWN_SPREAD = 0.45;
/** Sprunghöhe beim Hüpfen von Feld zu Feld (Welt-Einheiten). */
export const HOP_HEIGHT = 0.9;

/**
 * Versatz je Figur auf einem Feld mit `count` Figuren (Reihenfolge = aufsteigender Slot):
 * 1 → Mitte, 2 → nebeneinander, 3 → Dreieck, 4 → Quadrat. Alle Punkte liegen auf dem Feld.
 */
export function pawnOffsets(count: number): Point2[] {
  const r = PAWN_SPREAD;
  switch (count) {
    case 0:
      return [];
    case 1:
      return [{ x: 0, z: 0 }];
    case 2:
      return [
        { x: -r, z: 0 },
        { x: r, z: 0 },
      ];
    case 3:
      // Spitze nach hinten, zwei vorn: keine Figur verdeckt die andere aus Kamerasicht.
      return [
        { x: 0, z: r },
        { x: -r, z: -r * 0.6 },
        { x: r, z: -r * 0.6 },
      ];
    default: {
      const square: Point2[] = [
        { x: -r, z: r },
        { x: r, z: r },
        { x: -r, z: -r },
        { x: r, z: -r },
      ];
      // Mehr als vier kommt nicht vor (2–4 Spieler); sicherheitshalber in die Mitte.
      return Array.from({ length: Math.max(0, count) }, (_, i) => square[i] ?? { x: 0, z: 0 });
    }
  }
}

/**
 * Platzierung aller Figuren, die auf Feldern stehen (nicht hüpfen): je Feld nach Slot sortiert
 * und versetzt. Liefert Slot → Versatz.
 */
export function spreadPawns<S extends number>(
  standing: readonly { readonly slot: S; readonly spaceId: string }[],
): Map<S, Point2> {
  const bySpace = new Map<string, S[]>();
  for (const pawn of standing) {
    const list = bySpace.get(pawn.spaceId) ?? [];
    list.push(pawn.slot);
    bySpace.set(pawn.spaceId, list);
  }
  const result = new Map<S, Point2>();
  for (const slots of bySpace.values()) {
    slots.sort((a, b) => a - b);
    const offsets = pawnOffsets(slots.length);
    slots.forEach((slot, i) => {
      result.set(slot, offsets[i] ?? { x: 0, z: 0 });
    });
  }
  return result;
}

/** Punkt auf der Hüpfbahn von `from` nach `to` bei Fortschritt `t` (0…1): Parabel nach oben. */
export function hopPoint(from: Point2, to: Point2, t: number): { x: number; y: number; z: number } {
  const k = Math.min(1, Math.max(0, t));
  return {
    x: from.x + (to.x - from.x) * k,
    y: 4 * HOP_HEIGHT * k * (1 - k),
    z: from.z + (to.z - from.z) * k,
  };
}

export function boardBounds(board: BoardDefinition): BoardBounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const { position } of board.spaces) {
    minX = Math.min(minX, position.x);
    maxX = Math.max(maxX, position.x);
    minZ = Math.min(minZ, position.z);
    maxZ = Math.max(maxZ, position.z);
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 0, minZ: 0, maxZ: 0, center: { x: 0, z: 0 } };
  return { minX, maxX, minZ, maxZ, center: { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 } };
}

/**
 * Anteil, um den die Kamera von der Brettmitte zum aktiven Spieler rückt – seitlich stärker
 * als in der Tiefe, weil oben und unten HUD-Leisten liegen und das Brett dort knapp ist.
 */
export const CAMERA_FOLLOW: Readonly<Point2> = { x: 0.12, z: 0.04 };

/**
 * Blickpunkt der Kamera: Brettmitte, sanft zum aktiven Spieler verschoben (`follow` je Achse
 * 0…1). Ohne aktiven Spieler die Mitte. Die Übersicht bleibt erhalten, weil nur ein kleiner
 * Teil des Wegs gefahren wird.
 */
export function cameraFocus(
  bounds: BoardBounds,
  active: Point2 | null,
  follow: Readonly<Point2> = CAMERA_FOLLOW,
): Point2 {
  if (!active) return bounds.center;
  return {
    x: bounds.center.x + (active.x - bounds.center.x) * follow.x,
    z: bounds.center.z + (active.z - bounds.center.z) * follow.z,
  };
}

/**
 * Exponentielles Nachziehen: Wert nach `dtMs` Richtung `target`, Halbwertszeit `halfLifeMs`.
 * Bildratenunabhängig; mit festen Schritten (Testmodus) deterministisch.
 */
export function approach(
  current: number,
  target: number,
  dtMs: number,
  halfLifeMs: number,
): number {
  if (halfLifeMs <= 0 || dtMs <= 0) return dtMs <= 0 ? current : target;
  const keep = Math.pow(0.5, dtMs / halfLifeMs);
  return target + (current - target) * keep;
}

/**
 * Lage eines Wegweisers zum beschrifteten Zielfeld `target` einer Verzweigung: neben dem Feld,
 * vom Nachbarweg weg (`sibling` = anderes Zielfeld derselben Gabel).
 */
export function signpostPosition(target: Point2, sibling: Point2 | null, distance = 1.4): Point2 {
  if (!sibling) return { x: target.x, z: target.z + distance };
  const dx = target.x - sibling.x;
  const dz = target.z - sibling.z;
  const len = Math.hypot(dx, dz);
  if (len === 0) return { x: target.x, z: target.z + distance };
  return { x: target.x + (dx / len) * distance, z: target.z + (dz / len) * distance };
}
