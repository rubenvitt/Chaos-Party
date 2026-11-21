/**
 * Zustände mit Ablaufzeit je Slot (rein): Benommenheit, Schutz, Schub, „×2“. Alles auf der
 * Spielzeit-Achse des Minispiels, ohne Uhr.
 */
import type { Slot } from '@chaos-party/minigame-sdk';

export class StatusTimers<K extends string> {
  private readonly until = new Map<string, number>();

  private key(slot: Slot, kind: K): string {
    return `${String(slot)}:${kind}`;
  }

  /** Setzt einen Zustand bis `now + seconds` (verlängert nur, kürzt nie). */
  set(slot: Slot, kind: K, now: number, seconds: number): void {
    const key = this.key(slot, kind);
    this.until.set(key, Math.max(this.until.get(key) ?? 0, now + seconds));
  }

  clear(slot: Slot, kind: K): void {
    this.until.delete(this.key(slot, kind));
  }

  has(slot: Slot, kind: K, now: number): boolean {
    return now < (this.until.get(this.key(slot, kind)) ?? 0);
  }

  remaining(slot: Slot, kind: K, now: number): number {
    return Math.max(0, (this.until.get(this.key(slot, kind)) ?? 0) - now);
  }
}

export interface StunRules {
  /** Dauer der Benommenheit in s. */
  readonly stunS: number;
  /** Danach so lange immun (gegen Dauer-Plätten), 0 = nicht. */
  readonly immuneS?: number;
}

/**
 * Benommenheit: wer getroffen wird, kann eine Weile nichts tun. Optional mit Schonfrist, damit
 * niemand im Dauerfeuer festhängt. Zählt Treffer je Slot (für Höhepunkte).
 */
export class StunTracker {
  private readonly timers = new StatusTimers<'stun' | 'immune'>();
  private readonly counts = new Map<Slot, number>();

  constructor(readonly rules: StunRules) {}

  /** Betäubt `slot`, wenn er nicht schon benommen oder immun ist; liefert, ob es gewirkt hat. */
  stun(slot: Slot, now: number, seconds = this.rules.stunS): boolean {
    if (this.isStunned(slot, now) || this.timers.has(slot, 'immune', now)) return false;
    this.timers.set(slot, 'stun', now, seconds);
    const immune = this.rules.immuneS ?? 0;
    if (immune > 0) this.timers.set(slot, 'immune', now, seconds + immune);
    this.counts.set(slot, this.hits(slot) + 1);
    return true;
  }

  isStunned(slot: Slot, now: number): boolean {
    return this.timers.has(slot, 'stun', now);
  }

  remaining(slot: Slot, now: number): number {
    return this.timers.remaining(slot, 'stun', now);
  }

  hits(slot: Slot): number {
    return this.counts.get(slot) ?? 0;
  }
}
