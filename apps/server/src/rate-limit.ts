/**
 * Token-Bucket für das Nachrichtenbudget einer Verbindung (CHAOS-9, ADR-005).
 *
 * Rein und zeitgesteuert über einen übergebenen Zeitstempel (ms), damit Tests
 * ohne echte Uhr auskommen.
 */

export interface RateLimitOptions {
  /** Nachfüllrate je gehaltenem Slot (mindestens ein Slot) in Nachrichten pro Sekunde. */
  ratePerSecond: number;
  /** Puffer in Sekunden: Kapazität = Rate × burstSeconds. */
  burstSeconds: number;
  /** Höchstens eine `rate-limited`-Fehlermeldung je Intervall (ms). */
  errorIntervalMs: number;
  /** Verbindung schließen, wenn sie ununterbrochen so lange (ms) über dem Budget liegt. */
  maxOverBudgetMs: number;
  /** Verbindung schließen nach so vielen insgesamt abgewiesenen Nachrichten. */
  maxRejected: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitOptions = {
  ratePerSecond: 60,
  burstSeconds: 2,
  errorIntervalMs: 1000,
  maxOverBudgetMs: 5000,
  maxRejected: 1000,
};

export class TokenBucket {
  private tokens: number;
  private capacity: number;
  private refillPerMs: number;
  private last: number;

  constructor(ratePerSecond: number, burstSeconds: number, now: number) {
    this.refillPerMs = ratePerSecond / 1000;
    this.capacity = ratePerSecond * burstSeconds;
    this.tokens = this.capacity;
    this.last = now;
  }

  /** Ändert Rate und Kapazität (z. B. wenn eine Verbindung mehrere Slots übernimmt). */
  setRate(ratePerSecond: number, burstSeconds: number, now: number): void {
    this.refill(now);
    const capacity = ratePerSecond * burstSeconds;
    // Beim Vergrößern den Zuwachs gutschreiben, beim Verkleinern kappen.
    this.tokens = Math.min(capacity, this.tokens + Math.max(0, capacity - this.capacity));
    this.capacity = capacity;
    this.refillPerMs = ratePerSecond / 1000;
  }

  /** Verbraucht ein Token; `false`, wenn das Budget erschöpft ist. */
  take(now: number): boolean {
    this.refill(now);
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  get available(): number {
    return this.tokens;
  }

  private refill(now: number): void {
    const elapsed = Math.max(0, now - this.last);
    this.last = Math.max(this.last, now);
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerMs);
  }
}
