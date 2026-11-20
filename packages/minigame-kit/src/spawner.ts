/**
 * Spawner mit Vorwarnung (rein, aus Sockenregen herausgelöst): Etwas erscheint in festen
 * Abständen, in der Endphase schneller. Jeder Spawn wird `warnS` vorher angekündigt
 * (Schatten, Zielring, Blinken), damit niemand von etwas getroffen wird, das er nicht sehen
 * konnte. Was erst nach dem Spielende ankäme, entfällt.
 */

export interface SpawnerRules {
  /** Erster Spawn nach so vielen Sekunden Spielzeit. */
  readonly firstS: number;
  /** Abstand zwischen zwei Spawns. */
  readonly everyS: number;
  /** Abstand in der Endphase (Standard wie `everyS`). */
  readonly finaleEveryS?: number;
  /** Vorwarnzeit: so lange vor dem Eintreffen wird angekündigt (Flugzeit, Schatten). */
  readonly warnS: number;
}

export interface SpawnTiming {
  /** Ab jetzt sichtbar (Schatten, Ring). */
  readonly warnAt: number;
  /** Trifft ein (landet, schlägt ein, ist einsammelbar). */
  readonly arriveAt: number;
}

export class Spawner {
  private nextAt: number;

  constructor(readonly rules: SpawnerRules) {
    this.nextAt = rules.firstS;
  }

  /**
   * Wie viele Spawns in diesem Schritt fällig sind (meist 0 oder 1). `limitS` = Spielzeit;
   * Spawns, die nicht vor dem Ende ankämen, zählen nicht mit (der Takt läuft trotzdem weiter).
   */
  poll(time: number, finale: boolean, limitS: number): number {
    let count = 0;
    while (time >= this.nextAt) {
      this.nextAt += finale ? (this.rules.finaleEveryS ?? this.rules.everyS) : this.rules.everyS;
      if (time + this.rules.warnS < limitS) count++;
    }
    return count;
  }

  /** Zeitpunkte eines jetzt ausgelösten Spawns. */
  timing(time: number): SpawnTiming {
    return { warnAt: time, arriveAt: time + this.rules.warnS };
  }

  /** Nächster geplanter Spawn (Spielzeit in s). */
  get next(): number {
    return this.nextAt;
  }
}

/** Fortschritt einer Vorwarnung 0–1 (0 = gerade angekündigt, 1 = trifft ein). */
export function warningProgress(timing: SpawnTiming, time: number): number {
  const span = Math.max(1e-6, timing.arriveAt - timing.warnAt);
  return Math.min(1, Math.max(0, (time - timing.warnAt) / span));
}
