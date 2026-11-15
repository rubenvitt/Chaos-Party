/**
 * Gelände der Natur-Insel (CHAOS-62): Umriss als Superellipse mit leichtem Wellenrand,
 * sanfte Hügel aus Rauschen, ebene Stellflächen (Felder, Wege, Arena) und Mulden (Teiche).
 * Rein und ohne Babylon, damit Brett und Minispiel-Kulisse dasselbe Gelände teilen und Tests
 * die Form prüfen können.
 */
import { fbm, smooth } from './noise.ts';

export interface IslandShape {
  readonly centerX: number;
  readonly centerZ: number;
  /** Halbe Ausdehnung in x bzw. z (ohne Wellenrand). */
  readonly halfX: number;
  readonly halfZ: number;
  /** Exponent der Superellipse: 2 = Ellipse, größer = eckiger (abgerundetes Rechteck). */
  readonly squareness: number;
}

/** Ebene Stelle: Höhe 0 im Kreis `radius`, weicher Übergang bis `radius + blend`. */
export interface FlatSpot {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  readonly blend?: number;
}

/** Mulde (Teich): Ellipse mit Halbachsen `rx`/`rz`, Tiefe in der Mitte. */
export interface Hollow {
  readonly x: number;
  readonly z: number;
  readonly rx: number;
  readonly rz: number;
  readonly depth: number;
}

export interface TerrainOptions {
  readonly shape: IslandShape;
  readonly flats?: readonly FlatSpot[];
  readonly hollows?: readonly Hollow[];
  /** Hügelhöhe (Spitze zu Tal etwa doppelt so viel). */
  readonly relief?: number;
  /** Grundhöhe der Wiese (Standard 0), z. B. tiefer unter einer erhöhten Spielfläche. */
  readonly baseY?: number;
}

export interface Terrain {
  readonly shape: IslandShape;
  /** Grundhöhe (Stellflächen liegen genau hier). */
  readonly baseY: number;
  /** Abstand vom Mittelpunkt zum Rand in Richtung `angle` (Bogenmaß, 0 = +x). */
  rim(angle: number): number;
  /** Liegt (x, z) auf der Insel, mindestens `margin` vom Rand entfernt? */
  inside(x: number, z: number, margin?: number): boolean;
  /** Höhe der Grasdecke an (x, z). */
  height(x: number, z: number): number;
}

/** Wellenrand: wenige Prozent Abweichung, damit die Insel nicht wie ausgestanzt wirkt. */
function wobble(angle: number): number {
  return (
    1 +
    0.045 * Math.sin(3 * angle + 0.5) +
    0.03 * Math.sin(5 * angle + 2.1) +
    0.02 * Math.sin(9 * angle + 1)
  );
}

export function rimRadius(shape: IslandShape, angle: number): number {
  const n = shape.squareness;
  const c = Math.abs(Math.cos(angle)) / shape.halfX;
  const s = Math.abs(Math.sin(angle)) / shape.halfZ;
  return Math.pow(Math.pow(c, n) + Math.pow(s, n), -1 / n) * wobble(angle);
}

export function createTerrain(options: TerrainOptions): Terrain {
  const { shape } = options;
  const flats = options.flats ?? [];
  const hollows = options.hollows ?? [];
  const relief = options.relief ?? 0.45;
  const baseY = options.baseY ?? 0;
  const rim = (angle: number): number => rimRadius(shape, angle);
  const polar = (x: number, z: number): { r: number; a: number } => {
    const dx = x - shape.centerX;
    const dz = z - shape.centerZ;
    return { r: Math.hypot(dx, dz), a: Math.atan2(dz, dx) };
  };
  const inside = (x: number, z: number, margin = 0): boolean => {
    const { r, a } = polar(x, z);
    return r < rim(a) - margin;
  };
  const height = (x: number, z: number): number => {
    const { r, a } = polar(x, z);
    const edge = r / rim(a);
    let h = (fbm(x * 0.12 + 3, 0, z * 0.12) - 0.45) * 2 * relief;
    for (const spot of flats) {
      const d = Math.hypot(spot.x - x, spot.z - z) - spot.radius;
      if (d < 0) {
        h = 0;
        break;
      }
      const blend = spot.blend ?? 1.2;
      if (d < blend) h *= smooth(d / blend);
    }
    for (const hollow of hollows) {
      const d = Math.hypot((x - hollow.x) / hollow.rx, (z - hollow.z) / hollow.rz);
      if (d < 1) h -= hollow.depth * (1 - smooth(d));
    }
    // Weiche Kante zum Abhang.
    if (edge > 0.9) h -= smooth(Math.min(1, (edge - 0.9) / 0.1)) * 0.35;
    return baseY + h;
  };
  return { shape, baseY, rim, inside, height };
}
