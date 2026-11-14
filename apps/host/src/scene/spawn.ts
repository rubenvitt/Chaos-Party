import { createRng } from '@chaos-party/game-core';
import type { PlayerSlot } from './types.ts';

export interface SpawnArea {
  /** Halbe Breite des erlaubten Bereichs (x). */
  readonly halfWidth: number;
  /** Halbe Tiefe des erlaubten Bereichs (z). */
  readonly halfDepth: number;
  /** Mindestabstand zwischen zwei Startpunkten. */
  readonly minDistance: number;
}

export interface SpawnPoint {
  readonly x: number;
  readonly z: number;
}

const MAX_TRIES = 200;

/**
 * Berechnet aus dem Seed vier feste Startpunkte – einen pro Slot. Gleicher Seed
 * ergibt immer dieselben Punkte, unabhängig davon, wann welcher Slot beitritt.
 */
export function computeSpawnPoints(seed: number, area: SpawnArea): Record<PlayerSlot, SpawnPoint> {
  const rng = createRng(seed);
  const points: SpawnPoint[] = [];
  for (let i = 0; i < 4; i++) {
    let candidate: SpawnPoint | undefined;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const p = {
        x: (rng.next() * 2 - 1) * area.halfWidth,
        z: (rng.next() * 2 - 1) * area.halfDepth,
      };
      if (points.every((q) => Math.hypot(p.x - q.x, p.z - q.z) >= area.minDistance)) {
        candidate = p;
        break;
      }
    }
    // Rückfall, falls der Bereich zu eng ist: feste Ecken, garantiert verschieden.
    candidate ??= {
      x: (i % 2 === 0 ? -1 : 1) * area.halfWidth,
      z: (i < 2 ? -1 : 1) * area.halfDepth,
    };
    points.push(candidate);
  }
  const [p1, p2, p3, p4] = points as [SpawnPoint, SpawnPoint, SpawnPoint, SpawnPoint];
  return { 1: p1, 2: p2, 3: p3, 4: p4 };
}
