/**
 * Ebene Geometrie für Minispiel-Logik (rein). Koordinaten wie in allen Minispielen: Ebene x/z,
 * +z = vom Fernseher weg („Stick nach oben“), Mitte der Spielfläche (0, 0).
 */

export interface Point {
  readonly x: number;
  readonly z: number;
}

/** Spielfeldgrenze: Kreis um die Mitte oder Rechteck um die Mitte. */
export type Bounds =
  | { readonly kind: 'circle'; readonly radius: number }
  | { readonly kind: 'rect'; readonly halfX: number; readonly halfZ: number };

/** Schiebt einen Punkt außerhalb des Kreises auf den Rand (aus Sockenregen herausgelöst). */
export function clampToRadius(x: number, z: number, radius: number): { x: number; z: number } {
  const r = Math.hypot(x, z);
  if (r <= radius) return { x, z };
  return { x: (x / r) * radius, z: (z / r) * radius };
}

export function clampToRect(
  x: number,
  z: number,
  halfX: number,
  halfZ: number,
): { x: number; z: number } {
  return { x: Math.max(-halfX, Math.min(halfX, x)), z: Math.max(-halfZ, Math.min(halfZ, z)) };
}

export function clampToBounds(x: number, z: number, bounds: Bounds): { x: number; z: number } {
  return bounds.kind === 'circle'
    ? clampToRadius(x, z, bounds.radius)
    : clampToRect(x, z, bounds.halfX, bounds.halfZ);
}

export function insideBounds(x: number, z: number, bounds: Bounds, margin = 0): boolean {
  return bounds.kind === 'circle'
    ? Math.hypot(x, z) <= bounds.radius - margin
    : Math.abs(x) <= bounds.halfX - margin && Math.abs(z) <= bounds.halfZ - margin;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Blickrichtung (Radiant um y, 0 = +z) zu einer Bewegung in x/z. */
export function headingOf(x: number, z: number): number {
  return Math.atan2(x, z);
}

/**
 * Punkt auf einer Wurfparabel von `from` (mit Höhe `fromY`) nach `to` (Boden). `progress` 0–1,
 * `apex` = Scheitelhöhe über der Verbindungslinie. Für Anzeige von Würfen und Schattenwurf.
 */
export function arcPosition(
  from: Point & { readonly y: number },
  to: Point,
  progress: number,
  apex: number,
): { x: number; y: number; z: number } {
  const p = Math.min(1, Math.max(0, progress));
  return {
    x: from.x + (to.x - from.x) * p,
    z: from.z + (to.z - from.z) * p,
    y: from.y * (1 - p) + 4 * apex * p * (1 - p),
  };
}

/** Zufälliger Punkt, gleichverteilt in der Kreisfläche (Würfe, Spawns). */
export function randomInCircle(next: () => number, radius: number): { x: number; z: number } {
  const r = Math.sqrt(next()) * radius;
  const a = next() * Math.PI * 2;
  return { x: Math.cos(a) * r, z: Math.sin(a) * r };
}

/** Zufälliger Punkt in der Grenze, mit Abstand `margin` zum Rand. */
export function randomInBounds(
  next: () => number,
  bounds: Bounds,
  margin = 0,
): { x: number; z: number } {
  if (bounds.kind === 'circle') return randomInCircle(next, Math.max(0, bounds.radius - margin));
  return {
    x: (next() * 2 - 1) * Math.max(0, bounds.halfX - margin),
    z: (next() * 2 - 1) * Math.max(0, bounds.halfZ - margin),
  };
}

/** Das nächste Element innerhalb `radius` um `target` (optional gefiltert), sonst `null`. */
export function nearestWithin<T extends Point>(
  items: readonly T[],
  target: Point,
  radius: number,
  accept: (item: T) => boolean = () => true,
): T | null {
  let best: T | null = null;
  let bestDistance = radius;
  for (const item of items) {
    if (!accept(item)) continue;
    const d = Math.hypot(item.x - target.x, item.z - target.z);
    if (d <= bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  return best;
}
