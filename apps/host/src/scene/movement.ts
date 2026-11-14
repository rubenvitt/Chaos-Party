/**
 * Reine Bewegungsmathematik der Spielfiguren (ohne Babylon), damit sie
 * ohne Browser getestet werden kann.
 */

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export const MOVEMENT = {
  /** Höchstgeschwindigkeit am Boden in m/s bei vollem Stick-Ausschlag. */
  maxSpeed: 6,
  /** Wie schnell die Ist- auf die Sollgeschwindigkeit zieht (1/s). */
  responsiveness: 10,
  /** Obergrenze der Lenkbeschleunigung in m/s²; kleiner = mehr Rutschen und Schubsen. */
  maxAcceleration: 45,
  /** Geschwindigkeitszuwachs durch einen Dash in m/s. */
  dashSpeed: 11,
  /** Wartezeit zwischen zwei Dashes in s. */
  dashCooldown: 0.6,
  /** So lange nach einem Dash wird nicht gelenkt, damit der Stoß wirkt (s). */
  dashSteerPause: 0.25,
  /** Drehgeschwindigkeit des Gesichts in rad/s. */
  turnSpeed: 12,
} as const;

/** Kürzt einen Stick-Vektor auf Länge ≤ 1 und ersetzt ungültige Werte durch 0. */
export function clampStick(x: number, y: number): { x: number; y: number } {
  const sx = Number.isFinite(x) ? x : 0;
  const sy = Number.isFinite(y) ? y : 0;
  const len = Math.hypot(sx, sy);
  if (len <= 1) {
    return { x: sx, y: sy };
  }
  return { x: sx / len, y: sy / len };
}

/**
 * Geschwindigkeitsänderung (m/s) für einen Physikschritt: zieht die horizontale
 * Geschwindigkeit Richtung Stick × Höchstgeschwindigkeit, begrenzt durch
 * `maxAcceleration`. Stick-`y` (vorn) entspricht Welt-`+z`.
 */
export function steeringDeltaV(
  velocity: Vec2,
  stick: { x: number; y: number },
  dt: number,
  params: Pick<typeof MOVEMENT, 'maxSpeed' | 'responsiveness' | 'maxAcceleration'> = MOVEMENT,
): Vec2 {
  const target = { x: stick.x * params.maxSpeed, z: stick.y * params.maxSpeed };
  const blend = Math.min(1, params.responsiveness * dt);
  let dx = (target.x - velocity.x) * blend;
  let dz = (target.z - velocity.z) * blend;
  const maxDelta = params.maxAcceleration * dt;
  const len = Math.hypot(dx, dz);
  if (len > maxDelta && len > 0) {
    dx = (dx / len) * maxDelta;
    dz = (dz / len) * maxDelta;
  }
  return { x: dx, z: dz };
}

/** Normiert einen Winkel auf (−π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}

/** Dreht `current` auf kürzestem Weg höchstens `maxDelta` Richtung `target`. */
export function approachAngle(current: number, target: number, maxDelta: number): number {
  const diff = wrapAngle(target - current);
  if (Math.abs(diff) <= maxDelta) {
    return wrapAngle(target);
  }
  return wrapAngle(current + Math.sign(diff) * maxDelta);
}

/**
 * Gierwinkel, unter dem das Gesicht (lokal −z, also Richtung Kamera) in die
 * Bewegungsrichtung `(x, z)` schaut.
 */
export function yawForDirection(x: number, z: number): number {
  return Math.atan2(-x, -z);
}
