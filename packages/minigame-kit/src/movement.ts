/**
 * Figuren-Grundbewegung ohne Physik-Engine (rein, aus Sockenregen herausgelöst): Laufen mit
 * dem Stick, Hechten mit Abklingzeit, Benommenheit, Rempeln zwischen Figuren und Greifen/Tragen/
 * Werfen von Dingen. Die Funktionen arbeiten auf schlichten, veränderlichen Zustandsobjekten,
 * damit Spiele eigene Felder (Punkte, Treffer) daneben führen können.
 *
 * Wer Havok braucht (Schubsen mit echter Physik, Pudding-Gerangel), nimmt
 * `steeringDeltaV` und `clampHorizontalSpeed` als Grundlage und baut seine Körper selbst.
 */
import type { Slot } from '@chaos-party/minigame-sdk';
import { clampToBounds, type Bounds } from './geometry.ts';

export interface WalkerState {
  x: number;
  z: number;
  /** Blickrichtung (Radiant um y, 0 = +z). */
  heading: number;
  stickX: number;
  stickY: number;
  stunUntil: number;
  dashUntil: number;
  dashReadyAt: number;
  dashes: number;
}

export interface WalkRules {
  /** Laufgeschwindigkeit (Einheiten/s) bei vollem Stick. */
  readonly speed: number;
  /** Hechten: Vielfaches der Laufgeschwindigkeit, Dauer und Abklingzeit in s. */
  readonly dashFactor: number;
  readonly dashS: number;
  readonly dashCooldownS: number;
}

/** Ab dieser Stick-Auslenkung dreht die Figur beim Laufen bzw. zielt das Hechten. */
export const TURN_DEADZONE = 0.15;
export const DASH_AIM_DEADZONE = 0.2;

export function createWalker(x: number, z: number, heading = 0): WalkerState {
  return {
    x,
    z,
    heading,
    stickX: 0,
    stickY: 0,
    stunUntil: 0,
    dashUntil: 0,
    dashReadyAt: 0,
    dashes: 0,
  };
}

/** Stick-Stellung (Achsen −1…1, y > 0 = nach hinten/+z), Länge höchstens 1. */
export function setWalkerStick(walker: WalkerState, x: number, y: number): void {
  const length = Math.hypot(x, y);
  const scale = length > 1 ? 1 / length : 1;
  walker.stickX = x * scale;
  walker.stickY = y * scale;
}

export function isStunned(walker: WalkerState, now: number): boolean {
  return now < walker.stunUntil;
}

export function isDashing(walker: WalkerState, now: number): boolean {
  return now < walker.dashUntil;
}

export function isMoving(walker: WalkerState): boolean {
  return Math.hypot(walker.stickX, walker.stickY) > TURN_DEADZONE;
}

/** Zustand für die Animationswahl (`pickAnimation`, `SlotFigure.show`). */
export function walkerFigureState(
  walker: WalkerState,
  now: number,
): { stunned: boolean; dashing: boolean; moving: boolean } {
  return {
    stunned: isStunned(walker, now),
    dashing: isDashing(walker, now),
    moving: isMoving(walker),
  };
}

/** Hechtsprung in Stick- bzw. Blickrichtung. Liefert `true`, wenn er ausgelöst wurde. */
export function tryDash(walker: WalkerState, now: number, rules: WalkRules): boolean {
  if (isStunned(walker, now) || now < walker.dashReadyAt) return false;
  if (Math.hypot(walker.stickX, walker.stickY) > DASH_AIM_DEADZONE) {
    walker.heading = Math.atan2(walker.stickX, walker.stickY);
  }
  walker.dashUntil = now + rules.dashS;
  walker.dashReadyAt = now + rules.dashCooldownS;
  walker.dashes++;
  return true;
}

/** Benommen bis `now + seconds`; ein laufendes Hechten endet. */
export function stunWalker(walker: WalkerState, now: number, seconds: number): void {
  walker.stunUntil = now + seconds;
  walker.dashUntil = 0;
}

/** Ein Bewegungsschritt: benommen = still, hechtend = schnell geradeaus, sonst laufen. */
export function stepWalker(
  walker: WalkerState,
  dt: number,
  now: number,
  rules: WalkRules,
  bounds: Bounds,
): void {
  if (isStunned(walker, now)) return;
  let vx: number;
  let vz: number;
  if (isDashing(walker, now)) {
    const speed = rules.speed * rules.dashFactor;
    vx = Math.sin(walker.heading) * speed;
    vz = Math.cos(walker.heading) * speed;
  } else {
    vx = walker.stickX * rules.speed;
    vz = walker.stickY * rules.speed;
    if (isMoving(walker)) walker.heading = Math.atan2(walker.stickX, walker.stickY);
  }
  ({ x: walker.x, z: walker.z } = clampToBounds(walker.x + vx * dt, walker.z + vz * dt, bounds));
}

// ---------------------------------------------------------------------------
// Rempeln
// ---------------------------------------------------------------------------

export interface BumpRules {
  /** Radius der Figur für Berührungen (Figuren passen in r = 0,5). */
  readonly bodyRadius: number;
  /** So weit schiebt ein Hechtender sein Opfer weg. */
  readonly knockback: number;
  /** So lange ist das Opfer benommen (0 = gar nicht). */
  readonly stunS: number;
}

export interface BumpEvent {
  readonly attacker: Slot;
  readonly victim: Slot;
}

/**
 * Figuren schieben sich auseinander; wer hechtend in jemanden rennt, der nicht hechtet,
 * rempelt ihn weg (und betäubt ihn kurz). Paare werden in fester Reihenfolge geprüft
 * (deterministisch).
 */
export function resolveBumps(
  walkers: readonly (WalkerState & { readonly slot: Slot })[],
  now: number,
  rules: BumpRules,
  bounds: Bounds,
): BumpEvent[] {
  const events: BumpEvent[] = [];
  const reach = rules.bodyRadius * 2;
  for (let i = 0; i < walkers.length; i++) {
    for (let j = i + 1; j < walkers.length; j++) {
      const a = walkers[i];
      const b = walkers[j];
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d >= reach) continue;
      if (d < 1e-6) {
        // Genau übereinander: entlang der Blickrichtung von a trennen.
        dx = Math.sin(a.heading);
        dz = Math.cos(a.heading);
      }
      const length = Math.hypot(dx, dz);
      const nx = dx / length;
      const nz = dz / length;
      const aDash = isDashing(a, now);
      const bDash = isDashing(b, now);
      if (aDash !== bDash) {
        const attacker = aDash ? a : b;
        const victim = aDash ? b : a;
        const sign = aDash ? 1 : -1;
        victim.x += nx * sign * rules.knockback;
        victim.z += nz * sign * rules.knockback;
        attacker.dashUntil = 0;
        if (rules.stunS > 0) stunWalker(victim, now, rules.stunS);
        events.push({ attacker: attacker.slot, victim: victim.slot });
      } else {
        const push = (reach - d) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;
      }
      ({ x: a.x, z: a.z } = clampToBounds(a.x, a.z, bounds));
      ({ x: b.x, z: b.z } = clampToBounds(b.x, b.z, bounds));
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Greifen, Tragen, Werfen
// ---------------------------------------------------------------------------

export interface Carryable {
  x: number;
  z: number;
  /** Wer es gerade trägt. */
  carrier: Slot | null;
}

/** Punkt vor der Figur in Blickrichtung (Trageposition, Wurfziel). */
export function aheadOf(walker: WalkerState, distance: number): { x: number; z: number } {
  return {
    x: walker.x + Math.sin(walker.heading) * distance,
    z: walker.z + Math.cos(walker.heading) * distance,
  };
}

/** Greift das nächste freie Ding in Reichweite (nicht benommen, Hände frei). */
export function grabNearest<T extends Carryable>(
  walker: WalkerState & { readonly slot: Slot },
  items: readonly T[],
  reach: number,
  now: number,
): T | null {
  if (isStunned(walker, now) || items.some((item) => item.carrier === walker.slot)) return null;
  let best: T | null = null;
  let bestDistance = reach;
  for (const item of items) {
    if (item.carrier !== null) continue;
    const d = Math.hypot(item.x - walker.x, item.z - walker.z);
    if (d <= bestDistance) {
      best = item;
      bestDistance = d;
    }
  }
  if (best) best.carrier = walker.slot;
  return best;
}

/** Getragene Dinge folgen ihrem Träger (vor ihm, `holdDistance` weit). */
export function carryAlong(
  items: readonly Carryable[],
  walkers: readonly (WalkerState & { readonly slot: Slot })[],
  holdDistance: number,
): void {
  for (const item of items) {
    if (item.carrier === null) continue;
    const walker = walkers.find((candidate) => candidate.slot === item.carrier);
    if (!walker) {
      item.carrier = null;
      continue;
    }
    ({ x: item.x, z: item.z } = aheadOf(walker, holdDistance));
  }
}

/**
 * Lässt los: `distance` 0 = fallen lassen, sonst werfen in Blickrichtung. Liefert den
 * Landepunkt (innerhalb `bounds`); das Ding liegt sofort dort – eine Flugbahn zeigt das Spiel
 * mit `arcPosition`.
 */
export function letGo(
  item: Carryable,
  walker: WalkerState,
  distance: number,
  bounds: Bounds,
): { x: number; z: number } {
  item.carrier = null;
  const target = clampToBounds(...xz(aheadOf(walker, distance)), bounds);
  item.x = target.x;
  item.z = target.z;
  return target;
}

function xz(point: { x: number; z: number }): [number, number] {
  return [point.x, point.z];
}

// ---------------------------------------------------------------------------
// Physik-Figuren (Havok): Lenkung als Geschwindigkeitsänderung
// ---------------------------------------------------------------------------

export interface SteeringRules {
  /** Zielgeschwindigkeit bei vollem Stick. */
  readonly maxSpeed: number;
  /** Wie schnell die Geschwindigkeit dem Stick folgt (Anteil je s, 1/s). */
  readonly responsiveness: number;
  /** Höchste Geschwindigkeitsänderung je s. */
  readonly maxAcceleration: number;
}

/**
 * Lenkung als Geschwindigkeitsänderung für einen Schritt (aus Pudding-Gerangel herausgelöst):
 * zieht die waagrechte Geschwindigkeit zu Stick × `maxSpeed`, begrenzt durch
 * `maxAcceleration`. Stick-y (vorn) = Welt +z. Das Spiel wandelt das Ergebnis mit seiner Masse
 * in einen Impuls um.
 */
export function steeringDeltaV(
  velocity: { readonly x: number; readonly z: number },
  stick: { readonly x: number; readonly y: number },
  dt: number,
  rules: SteeringRules,
): { x: number; z: number } {
  const blend = Math.min(1, rules.responsiveness * dt);
  let dx = (stick.x * rules.maxSpeed - velocity.x) * blend;
  let dz = (stick.y * rules.maxSpeed - velocity.z) * blend;
  const max = rules.maxAcceleration * dt;
  const length = Math.hypot(dx, dz);
  if (length > max && length > 0) {
    dx = (dx / length) * max;
    dz = (dz / length) * max;
  }
  return { x: dx, z: dz };
}

/** Kürzt einen Stick auf Länge ≤ 1, ungültige Werte werden 0. */
export function clampStick(x: number, y: number): { x: number; y: number } {
  const sx = Number.isFinite(x) ? x : 0;
  const sy = Number.isFinite(y) ? y : 0;
  const length = Math.hypot(sx, sy);
  return length > 1 ? { x: sx / length, y: sy / length } : { x: sx, y: sy };
}

/** Begrenzt die waagrechte Geschwindigkeit auf `limit` (y bleibt). */
export function clampHorizontalSpeed(
  velocity: { readonly x: number; readonly y: number; readonly z: number },
  limit: number,
): { x: number; y: number; z: number } {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed <= limit || speed === 0) return { x: velocity.x, y: velocity.y, z: velocity.z };
  const scale = limit / speed;
  return { x: velocity.x * scale, y: velocity.y, z: velocity.z * scale };
}
