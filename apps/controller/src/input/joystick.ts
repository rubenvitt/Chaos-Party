/**
 * Reine Joystick-Mathematik: Fingerversatz (Bildschirmpixel) → normierter Stick-Vektor.
 *
 * Konvention wie in der Host-Szene (ADR-004): `x` nach rechts, `y` nach vorn.
 * „Vorn“ ist auf dem Bildschirm **oben**, daher wird die Bildschirm-y-Achse gespiegelt.
 */

export interface Stick {
  readonly x: number;
  readonly y: number;
}

export const ZERO_STICK: Stick = { x: 0, y: 0 };

/** Anteil des Radius, in dem der Stick als losgelassen gilt (Zittern des Daumens). */
export const DEAD_ZONE = 0.12;

/** Auflösung der gesendeten Werte; kleinere Änderungen lösen keine Nachricht aus. */
export const STICK_RESOLUTION = 0.01;

/**
 * Rechnet einen Versatz vom Ursprung in einen Stick-Vektor um.
 *
 * - Länge wird auf 1 begrenzt (Finger außerhalb des Rings = voller Ausschlag).
 * - Innerhalb der Totzone ist das Ergebnis exakt `{0, 0}`; außerhalb wird die
 *   Länge neu skaliert, damit der Übergang stetig ist (kein Sprung auf 0,12).
 * - Werte werden **zur Null hin** auf {@link STICK_RESOLUTION} abgeschnitten,
 *   damit die Länge nach dem Runden nie über 1 steigt (Server prüft ≤ 1 + 0,001).
 */
export function stickFromOffset(
  dx: number,
  dy: number,
  radius: number,
  deadZone = DEAD_ZONE,
): Stick {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !(radius > 0)) return ZERO_STICK;
  const nx = dx / radius;
  const ny = -dy / radius;
  const length = Math.hypot(nx, ny);
  if (length <= deadZone) return ZERO_STICK;
  const clamped = Math.min(length, 1);
  const scaled = deadZone >= 1 ? 0 : (clamped - deadZone) / (1 - deadZone);
  const factor = scaled / length;
  return { x: quantize(nx * factor), y: quantize(ny * factor) };
}

/** Schneidet zur Null hin auf die Stick-Auflösung ab und vermeidet `-0`. */
export function quantize(value: number, step = STICK_RESOLUTION): number {
  const steps = Math.trunc(value / step + (value >= 0 ? 1e-9 : -1e-9));
  const result = Number((steps * step).toFixed(6));
  return result === 0 ? 0 : result;
}

export function sticksEqual(a: Stick, b: Stick): boolean {
  return a.x === b.x && a.y === b.y;
}

export function isZeroStick(stick: Stick): boolean {
  return stick.x === 0 && stick.y === 0;
}

/** Position des Knopfs relativ zum Ursprung in Pixeln (für die Anzeige, auf den Radius begrenzt). */
export function knobOffset(dx: number, dy: number, radius: number): { dx: number; dy: number } {
  const length = Math.hypot(dx, dy);
  if (length <= radius || length === 0) return { dx, dy };
  const factor = radius / length;
  return { dx: dx * factor, dy: dy * factor };
}
