/**
 * Zeit im Minispiel (rein): Spielzeit mit Endphase und Ende, dazu kurze Countdowns und
 * Abklingzeiten. Zeit vergeht nur über `tick(dt)` mit festen Schritten (ADR-012).
 */

/** Toleranz für aufsummierte feste Schritte: 1800 × 1/60 s soll genau 30 s sein. */
export const TIME_EPSILON = 1e-6;

export interface ClockTick {
  /** In diesem Schritt hat die Endphase begonnen. */
  readonly finaleStarted: boolean;
}

/**
 * Spielzeit eines Minispiels. `finaleS` = Länge der Endphase („letzte 8 s“), 0 = keine.
 * Ablauf je Schritt: erst `tick(dt)`, dann Spiellogik, am Ende `expired` prüfen (so lief es
 * in Sockenregen, das Ende kommt im selben Schritt wie die letzte Logik).
 */
export class MatchClock {
  /** Vergangene Spielzeit in s. */
  time = 0;
  finale = false;
  readonly limitS: number;

  constructor(
    timeLimitMs: number,
    readonly finaleS = 0,
  ) {
    this.limitS = timeLimitMs / 1000;
  }

  tick(dt: number): ClockTick {
    this.time += dt;
    if (
      !this.finale &&
      this.finaleS > 0 &&
      this.time >= this.limitS - this.finaleS - TIME_EPSILON
    ) {
      this.finale = true;
      return { finaleStarted: true };
    }
    return { finaleStarted: false };
  }

  /** Spielzeit abgelaufen. */
  get expired(): boolean {
    return this.time >= this.limitS - TIME_EPSILON;
  }

  get remainingS(): number {
    return Math.max(0, this.limitS - this.time);
  }

  /** Restzeit für `MinigameHud.remainingMs`. */
  get remainingMs(): number {
    return Math.max(0, Math.round(this.remainingS * 1000));
  }

  /** Anteil der verstrichenen Spielzeit 0–1 (für steigendes Tempo). */
  get progress(): number {
    if (this.limitS <= 0 || this.expired) return 1;
    return Math.min(1, this.time / this.limitS);
  }

  /** Endet etwas, das jetzt beginnt und `durationS` dauert, noch vor dem Spielende? */
  fitsBeforeEnd(durationS: number): boolean {
    return this.time + durationS < this.limitS;
  }
}

/**
 * Kurzer Countdown (Vorwarnung, Signal „3-2-1“, Wartezeit). `start` setzt ihn, `tick` lässt
 * ihn laufen und meldet einmal `true`, wenn er abläuft.
 */
export class Countdown {
  private left = 0;
  private total = 0;
  private running = false;

  start(seconds: number): void {
    this.left = Math.max(0, seconds);
    this.total = this.left;
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.left = 0;
  }

  /** `true` genau im Schritt, in dem der Countdown abläuft. */
  tick(dt: number): boolean {
    if (!this.running) return false;
    this.left -= dt;
    if (this.left > TIME_EPSILON) return false;
    this.running = false;
    this.left = 0;
    return true;
  }

  get active(): boolean {
    return this.running;
  }

  get remainingS(): number {
    return this.left;
  }

  /** Ganze Sekunden zum Anzeigen (3, 2, 1), 0 wenn aus. */
  get display(): number {
    return this.running ? Math.ceil(this.left - TIME_EPSILON) : 0;
  }

  /** 0 beim Start, 1 beim Ablauf. */
  get progress(): number {
    return this.total > 0 ? 1 - this.left / this.total : 1;
  }
}

/** Abklingzeit auf einer Spielzeit-Achse (Hechten, Rempeln, Werfen). */
export class Cooldown {
  private readyAt = 0;

  constructor(readonly seconds: number) {}

  ready(now: number): boolean {
    return now >= this.readyAt;
  }

  /** Löst aus, wenn bereit; liefert, ob ausgelöst wurde. */
  trigger(now: number): boolean {
    if (!this.ready(now)) return false;
    this.readyAt = now + this.seconds;
    return true;
  }

  /** 0 = gerade ausgelöst, 1 = bereit (für Anzeigen). */
  charge(now: number): number {
    if (this.seconds <= 0) return 1;
    return Math.min(1, Math.max(0, 1 - (this.readyAt - now) / this.seconds));
  }
}
