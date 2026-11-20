/**
 * Punktestand (rein): Punkte je Slot, Führung, Plätze und Führungswechsel. Die Wertung selbst
 * (`rankByScore`, Gleichstand = gleicher Platz) kommt aus dem SDK.
 */
import {
  rankByScore,
  type MinigameInfo,
  type MinigamePlacement,
  type Slot,
} from '@chaos-party/minigame-sdk';

/**
 * Der eine Spitzenreiter nach `value`, bei Gleichstand an der Spitze keiner. Grundlage für
 * Führung, gezielte Gemeinheiten und Höhepunkte („Rot wurde dreimal geplättet“).
 */
export function uniqueMax<T>(items: readonly T[], value: (item: T) => number): T | null {
  let best: T | null = null;
  let bestValue = 0;
  let tie = false;
  for (const item of items) {
    const v = value(item);
    if (best === null || v > bestValue) {
      best = item;
      bestValue = v;
      tie = false;
    } else if (v === bestValue) {
      tie = true;
    }
  }
  return tie ? null : best;
}

/** Index des alleinigen Führenden mit mehr als 0 Punkten, sonst `null` (für Simulationen). */
export function uniqueLeaderIndex(scores: readonly number[]): number | null {
  const best = uniqueMax(
    scores.map((score, index) => ({ score, index })),
    (entry) => entry.score,
  );
  return best && best.score > 0 ? best.index : null;
}

export class Scoreboard {
  private readonly points = new Map<Slot, number>();

  constructor(
    readonly slots: readonly Slot[],
    private readonly scoring: MinigameInfo['scoring'] = 'higher',
  ) {
    for (const slot of slots) this.points.set(slot, 0);
  }

  get(slot: Slot): number {
    return this.points.get(slot) ?? 0;
  }

  /** Punkte gutschreiben (negativ = abziehen). Nie unter `floor` (Standard 0). */
  add(slot: Slot, delta: number, floor = 0): number {
    if (!this.points.has(slot)) return 0;
    const next = Math.max(floor, this.get(slot) + delta);
    this.points.set(slot, next);
    return next;
  }

  set(slot: Slot, value: number): void {
    if (this.points.has(slot)) this.points.set(slot, value);
  }

  entries(): { slot: Slot; score: number }[] {
    return this.slots.map((slot) => ({ slot, score: this.get(slot) }));
  }

  /** Alleinige Führung mit mindestens `min` Punkten (bei `lower`: wenigste Punkte), sonst `null`. */
  leader(min = 1): Slot | null {
    const sign = this.scoring === 'higher' ? 1 : -1;
    const best = uniqueMax(this.entries(), (entry) => sign * entry.score);
    if (!best) return null;
    return this.scoring === 'higher' && best.score < min ? null : best.slot;
  }

  placements(): MinigamePlacement[] {
    return rankByScore(this.entries(), this.scoring);
  }

  /** Für `MinigameHud.scores`; `status` liefert je Slot optional einen kurzen Zustand. */
  hud(
    status?: (slot: Slot) => string | undefined,
  ): { slot: Slot; score: number; status?: string }[] {
    return this.slots.map((slot) => {
      const text = status?.(slot);
      return { slot, score: this.get(slot), ...(text ? { status: text } : {}) };
    });
  }
}

/** Verfolgt Führungswechsel und die Führung nach 2/3 der Zeit (Bot-Messungen, Spannung). */
export class LeadTracker {
  private leader: number | null = null;
  private atTwoThirds: number | null = null;
  private snapshotTaken = false;
  changes = 0;

  constructor(private readonly twoThirdsMs: number) {}

  update(scores: readonly number[], nowMs: number): void {
    if (!this.snapshotTaken && nowMs >= this.twoThirdsMs) {
      this.snapshotTaken = true;
      this.atTwoThirds = uniqueLeaderIndex(scores);
    }
    const current = uniqueLeaderIndex(scores);
    if (current !== null && current !== this.leader) {
      if (this.leader !== null) this.changes++;
      this.leader = current;
    }
  }

  get leaderAtTwoThirds(): number | null {
    return this.atTwoThirds;
  }
}
