/**
 * Reine Geometrie der Brett-Darstellung (CHAOS-18/19): Figur-Versatz bei mehreren Figuren
 * auf einem Feld, Hüpfbahn, Projektion, Brettgrenzen (Kamera-Regie: `camera.ts`). Ohne Babylon – unit-getestet.
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

/**
 * Form eines Flugs (Windstoß, Platztausch, CHAOS-52): Scheitelhöhe, seitliche Auswölbung
 * (positiv = links der Flugrichtung, in Welt-Einheiten) und Verlauf über die Zeit.
 */
export interface FlightShape {
  readonly height: number;
  readonly bulge: number;
  /** `out`: schnell weg, sanft landen (weggeweht); `in-out`: ruhig an, ruhig ab. */
  readonly ease: 'out' | 'in-out';
}

/** Windstoß: flach und schnell weggeweht, leicht seitlich verweht. */
export const GUST_FLIGHT: FlightShape = { height: 1.7, bulge: 0.7, ease: 'out' };
/**
 * Platztausch: hoher Bogen. Beide Figuren nutzen dieselbe Form; weil ihre Flugrichtungen
 * entgegengesetzt sind, wölben sie sich zu verschiedenen Seiten und kreuzen sich nicht.
 */
export const SWAP_FLIGHT: FlightShape = { height: 2.6, bulge: 1.4, ease: 'in-out' };

export function easeFlight(t: number, ease: FlightShape['ease']): number {
  const k = Math.min(1, Math.max(0, t));
  return ease === 'out' ? 1 - Math.pow(1 - k, 3) : k * k * (3 - 2 * k);
}

/**
 * Punkt auf einer Flugbahn von `from` nach `to` bei Zeit-Fortschritt `t` (0…1): Weg nach
 * `shape.ease`, Höhe als Parabel über dem Weg-Fortschritt, seitlich ausgewölbt.
 */
export function flightPoint(
  from: Point2,
  to: Point2,
  t: number,
  shape: FlightShape,
): { x: number; y: number; z: number } {
  const e = easeFlight(t, shape.ease);
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  const arc = 4 * e * (1 - e);
  // Links der Flugrichtung (Draufsicht, x nach rechts, z nach hinten): (−dz, dx).
  const side = len > 0 ? (shape.bulge * arc) / len : 0;
  return {
    x: from.x + dx * e - dz * side,
    y: shape.height * arc,
    z: from.z + dz * e + dx * side,
  };
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Lage der Brettkamera: Standort und Blickpunkt (Welt-Einheiten, y = oben). */
export interface ViewCamera {
  readonly position: Point3;
  readonly target: Point3;
}

/**
 * Perspektivische Projektion ohne Bildwinkel: x nach rechts, y nach oben, geteilt durch die
 * Tiefe. Für Überlappungen genügt das (beide Seiten im selben Maßstab). Linkshändig wie
 * Babylon: Blick nach +z heißt rechts = +x.
 */
export function projectToView(
  camera: ViewCamera,
  p: Point3,
): { readonly x: number; readonly y: number; readonly depth: number } {
  const f = normalize(sub(camera.target, camera.position));
  const r = normalize(cross({ x: 0, y: 1, z: 0 }, f));
  const u = cross(f, r);
  const d = sub(p, camera.position);
  const depth = dot(d, f);
  return { x: dot(d, r) / depth, y: dot(d, u) / depth, depth };
}

/** Kamerazugewandte Fläche (Billboard): Mitte und halbe Breite/Höhe in Welt-Einheiten. */
export interface Billboard {
  readonly center: Point3;
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** Überdecken sich zwei Billboards im Bild? `margin` (Welt-Einheiten) vergrößert `a`. */
export function billboardsOverlap(
  camera: ViewCamera,
  a: Billboard,
  b: Billboard,
  margin = 0,
): boolean {
  const pa = projectToView(camera, a.center);
  const pb = projectToView(camera, b.center);
  const dx = Math.abs(pa.x - pb.x);
  const dy = Math.abs(pa.y - pb.y);
  return (
    dx < (a.halfWidth + margin) / pa.depth + b.halfWidth / pb.depth &&
    dy < (a.halfHeight + margin) / pa.depth + b.halfHeight / pb.depth
  );
}

/**
 * Rückt einen Wegweiser seitlich (x, weg vom Pfeil) so weit, dass sein Schild den Zug-Pfeil
 * über der Gabel im Bild nicht überdeckt (CHAOS-52). Beim Wegwählen steht die Figur am Zug
 * auf der Gabel, die Kamera schaut auf sie (`camera`), der Pfeil schwebt über ihr (`arrow`).
 * `sign` gibt Höhe und Größe des Schilds an; seine Mitte steht über `post`.
 */
export function signpostClearOfArrow(
  post: Point2,
  sign: { readonly y: number; readonly halfWidth: number; readonly halfHeight: number },
  arrow: Billboard,
  camera: ViewCamera,
  margin = 0.3,
): Point2 {
  const at = (x: number): Billboard => ({ ...sign, center: { x, y: sign.y, z: post.z } });
  if (!billboardsOverlap(camera, at(post.x), arrow, margin)) return post;
  const side = post.x < arrow.center.x ? -1 : 1;
  const step = 0.05;
  for (let shift = step; shift <= 8; shift += step) {
    const x = post.x + side * shift;
    if (!billboardsOverlap(camera, at(x), arrow, margin)) return { x, z: post.z };
  }
  return post;
}

function sub(a: Point3, b: Point3): Point3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: Point3, b: Point3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Point3, b: Point3): Point3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function normalize(a: Point3): Point3 {
  const len = Math.hypot(a.x, a.y, a.z);
  return len === 0 ? a : { x: a.x / len, y: a.y / len, z: a.z / len };
}
