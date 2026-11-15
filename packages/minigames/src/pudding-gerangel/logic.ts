/**
 * Reine Spiellogik von „Pudding-Gerangel“ (ohne Babylon): Stellschrauben, Neigung des
 * Puddings, Kirschfleck, Punkte, Führung, Lenkung und Höhepunkte. Alles hier ist
 * deterministisch und ohne Physik testbar; `index.ts` verbindet es mit Havok.
 *
 * Werte aus EXP-006 (Variante A5 „Kirschfleck + Wackelkrone“).
 */
import type { MinigameRng, Slot } from '@chaos-party/minigame-sdk';

export const TUNING = {
  /** Radius der Puddingoberfläche (m). */
  radius: 6,
  /** Dicke des Puddings (Hitbox, m); die Oberseite liegt bei y = 0. */
  thickness: 1,
  /** Reibung des Puddings: glitschig, ab ≈ 7° Neigung rutscht man. */
  friction: 0.12,
  /** Neigung je Figur am Rand (rad), Richtung Gewicht. */
  tiltPerPawn: 0.09,
  maxTilt: 0.3,
  /** Wie schnell die Neigung dem Ziel folgt (1/s). */
  tiltFollow: 1.5,
  /** Eigenes Schwabbeln, wächst über die Spielzeit (rad). */
  wobbleStart: 0.05,
  wobbleEnd: 0.15,
  /** Rührlöffel: Arm von innen nach außen, Höhe, Drehtempo (rad/s) Anfang → Ende. */
  spoonInner: 1.6,
  spoonOuter: 6.4,
  spoonHeight: 0.7,
  spoonDepth: 0.35,
  spoonSpeedStart: 0.8,
  spoonSpeedEnd: 1.8,
  /** Kirschfleck: Radius, Abstand zur Mitte, Wechsel und Vorwarnung (ms). */
  zoneRadius: 1.7,
  zoneMinR: 1.2,
  zoneMaxR: 3.8,
  zoneMoveMs: 4000,
  zoneWarnMs: 1000,
  /** Punkte je Sekunde auf dem Fleck. */
  zoneRate: 4,
  /** Darunter gilt eine Figur als in die Sahne gefallen (m). */
  killY: -3,
  respawnMs: 1500,
  /** Ein Sturz zählt als Schubser, wenn der letzte Rempler höchstens so lange her ist. */
  creditMs: 4000,
  /** Rempler gegen die führende Person wirken so viel stärker („Wackelkrone“). */
  leaderBonk: 1.5,
} as const;

/** Bewegung der Spielfiguren (Kapsel-Hitbox, unabhängig vom Figuren-Mesh). */
export const PAWN = {
  radius: 0.45,
  height: 1.5,
  mass: 1,
  friction: 0.35,
  restitution: 0.4,
  maxSpeed: 5.5,
  responsiveness: 8,
  maxAcceleration: 28,
  dashSpeed: 9,
  dashCooldownMs: 1000,
  /** So lange nach einem Rempler wird nicht gelenkt (ms). */
  dashSteerPauseMs: 300,
  /** Rempler-Treffer: so lange nach dem Start des Remplers (ms). */
  dashHitMs: 350,
  bonkSpeed: 6 * 1.3,
  bonkLift: 2.5,
  /** Harte Obergrenze der Geschwindigkeit (m/s). */
  speedLimit: 22,
} as const;

export interface Vec2 {
  readonly x: number;
  readonly z: number;
}

export interface Tilt {
  /** Drehung um X (positiv senkt die +Z-Seite). */
  readonly pitch: number;
  /** Drehung um Z (positiv hebt die +X-Seite). */
  readonly roll: number;
}

/** Wackelstärke nach Spielfortschritt 0–1. */
export function wobbleAt(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return TUNING.wobbleStart + (TUNING.wobbleEnd - TUNING.wobbleStart) * p;
}

/** Drehtempo des Rührlöffels nach Spielfortschritt 0–1 (rad/s). */
export function spoonSpeedAt(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return TUNING.spoonSpeedStart + (TUNING.spoonSpeedEnd - TUNING.spoonSpeedStart) * p;
}

/**
 * Ziel-Neigung: Der Pudding sackt zum Gewicht der Figuren (Positionen in Puddingkoordinaten),
 * dazu ein Eigen-Schwabbeln. Begrenzung auf `maxTilt`. Die Seite mit dem Gewicht sinkt.
 */
export function targetTilt(
  positions: readonly Vec2[],
  timeSeconds: number,
  wobble: number,
  phase: number,
): Tilt {
  let sx = 0;
  let sz = 0;
  for (const p of positions) {
    sx += p.x / TUNING.radius;
    sz += p.z / TUNING.radius;
  }
  let pitch = TUNING.tiltPerPawn * sz + wobble * Math.sin(timeSeconds * 1.7 + phase);
  let roll = -TUNING.tiltPerPawn * sx + wobble * Math.cos(timeSeconds * 1.3 + phase);
  const magnitude = Math.hypot(pitch, roll);
  if (magnitude > TUNING.maxTilt) {
    pitch *= TUNING.maxTilt / magnitude;
    roll *= TUNING.maxTilt / magnitude;
  }
  return { pitch, roll };
}

/** Neigung einen Schritt Richtung Ziel nachziehen. */
export function followTilt(current: Tilt, target: Tilt, dt: number): Tilt {
  const k = Math.min(1, TUNING.tiltFollow * dt);
  return {
    pitch: current.pitch + (target.pitch - current.pitch) * k,
    roll: current.roll + (target.roll - current.roll) * k,
  };
}

/**
 * Neuer Kirschfleck (Puddingkoordinaten): im Ring `zoneMinR`–`zoneMaxR` und mindestens 60°
 * vom alten entfernt, damit alle umziehen müssen.
 */
export function nextZone(rng: MinigameRng, previous: Vec2 | null): Vec2 {
  const previousAngle = previous ? Math.atan2(previous.z, previous.x) : null;
  let angle = rng.next() * Math.PI * 2;
  if (previousAngle !== null) {
    const offset = Math.PI / 3 + rng.next() * ((Math.PI * 4) / 3);
    angle = previousAngle + offset;
  }
  const r = TUNING.zoneMinR + rng.next() * (TUNING.zoneMaxR - TUNING.zoneMinR);
  return { x: Math.cos(angle) * r, z: Math.sin(angle) * r };
}

export function inZone(position: Vec2, zone: Vec2 | null): boolean {
  if (!zone) return false;
  return Math.hypot(position.x - zone.x, position.z - zone.z) < TUNING.zoneRadius;
}

/** Punkte aus der Zeit auf dem Kirschfleck (ganzzahlig, abgerundet). */
export function zonePoints(zoneMs: number): number {
  return Math.floor((Math.max(0, zoneMs) / 1000) * TUNING.zoneRate);
}

/** Alleinige Führung mit mehr als 0 Punkten, sonst `null` (keine Krone bei Gleichstand). */
export function leaderOf(scores: readonly { slot: Slot; score: number }[]): Slot | null {
  let best: { slot: Slot; score: number } | null = null;
  let tie = false;
  for (const entry of scores) {
    if (!best || entry.score > best.score) {
      best = entry;
      tie = false;
    } else if (entry.score === best.score) {
      tie = true;
    }
  }
  return best && !tie && best.score > 0 ? best.slot : null;
}

/**
 * Lenkung als Geschwindigkeitsänderung für einen Schritt: zieht die waagrechte Geschwindigkeit
 * zu Stick × Höchsttempo, begrenzt durch `maxAcceleration`. Stick-y (vorn) = Welt +Z.
 */
export function steeringDeltaV(velocity: Vec2, stick: { x: number; y: number }, dt: number): Vec2 {
  const blend = Math.min(1, PAWN.responsiveness * dt);
  let dx = (stick.x * PAWN.maxSpeed - velocity.x) * blend;
  let dz = (stick.y * PAWN.maxSpeed - velocity.z) * blend;
  const max = PAWN.maxAcceleration * dt;
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

export interface PlayerStats {
  readonly slot: Slot;
  readonly name: string;
  readonly score: number;
  readonly falls: number;
  readonly knockoffs: number;
  readonly zoneMs: number;
}

const MAX_HIGHLIGHT = 64;

function clip(line: string): string {
  return line.length <= MAX_HIGHLIGHT ? line : `${line.slice(0, MAX_HIGHLIGHT - 1)}…`;
}

function top(
  stats: readonly PlayerStats[],
  key: 'falls' | 'knockoffs' | 'zoneMs',
): PlayerStats | null {
  let best: PlayerStats | null = null;
  for (const entry of stats) {
    if (entry[key] > 0 && (!best || entry[key] > best[key])) best = entry;
  }
  return best;
}

/** 0–4 Höhepunkte (≤ 64 Zeichen) für die Ergebnisanzeige. */
export function buildHighlights(stats: readonly PlayerStats[], spoonFalls: number): string[] {
  const lines: string[] = [];
  const pusher = top(stats, 'knockoffs');
  if (pusher) {
    lines.push(
      pusher.knockoffs === 1
        ? `${pusher.name} schubste jemanden in die Sahne`
        : `${pusher.name} schubste ${pusher.knockoffs}-mal jemanden in die Sahne`,
    );
  }
  const faller = top(stats, 'falls');
  if (faller && faller.falls >= 2)
    lines.push(`${faller.name} plumpste ${faller.falls}-mal vom Pudding`);
  const sitter = top(stats, 'zoneMs');
  if (sitter && sitter.zoneMs >= 3000)
    lines.push(`${sitter.name} saß ${Math.round(sitter.zoneMs / 1000)} s auf der Kirsche`);
  if (spoonFalls > 0) {
    lines.push(
      spoonFalls === 1
        ? 'Der Rührlöffel fegte einmal jemanden vom Teller'
        : `Der Rührlöffel fegte ${spoonFalls}-mal jemanden vom Teller`,
    );
  }
  return lines.slice(0, 4).map(clip);
}

/** Kurzer Zustand je Spieler für den HUD (≤ 16 Zeichen). */
export function statusFor(state: {
  out: boolean;
  inZone: boolean;
  leader: boolean;
}): string | undefined {
  if (state.out) return 'Plumps!';
  if (state.inZone) return 'Kirsche!';
  if (state.leader) return 'Wackelkrone';
  return undefined;
}

/** Banner mitten im Spiel (≤ 32 Zeichen) aus Spielzeit und letztem Kirschwechsel. */
export function bannerFor(
  elapsedMs: number,
  limitMs: number,
  lastZoneMoveMs: number,
): string | undefined {
  const remaining = limitMs - elapsedMs;
  if (remaining <= 5000 && remaining > 0) return 'Letzte 5 Sekunden!';
  if (elapsedMs >= limitMs / 2 && elapsedMs < limitMs / 2 + 1500)
    return 'Der Rührlöffel dreht auf!';
  if (lastZoneMoveMs > 0 && elapsedMs - lastZoneMoveMs < 1200) return 'Die Kirsche hüpft!';
  return undefined;
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
  if (Math.abs(diff) <= maxDelta) return wrapAngle(target);
  return wrapAngle(current + Math.sign(diff) * maxDelta);
}

/** Gierwinkel, unter dem eine Figur (Blick +Z) in Richtung `(x, z)` schaut. */
export function yawFor(x: number, z: number): number {
  return Math.atan2(x, z);
}
