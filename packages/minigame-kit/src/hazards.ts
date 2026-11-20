/**
 * Gefahrenzonen mit Vorwarnung (rein): Eine Zone wird angekündigt (`warn`), ist dann eine Weile
 * scharf (`active`) und verschwindet (`over`). Formen: Kreis, Rechteck, Ring. Treffer prüft das
 * Spiel selbst mit `contains` – was ein Treffer bedeutet (benommen, raus, Punktabzug), ist
 * Sache des Spiels.
 */
import type { Point } from './geometry.ts';

export type HazardShape =
  | { readonly kind: 'circle'; readonly x: number; readonly z: number; readonly radius: number }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly z: number;
      readonly halfX: number;
      readonly halfZ: number;
    }
  | {
      readonly kind: 'ring';
      readonly x: number;
      readonly z: number;
      readonly inner: number;
      readonly outer: number;
    };

export type HazardPhase = 'warn' | 'active' | 'over';

export interface Hazard<K extends string = string> {
  readonly id: number;
  readonly kind: K;
  readonly shape: HazardShape;
  readonly warnAt: number;
  readonly activeAt: number;
  readonly overAt: number;
  phase: HazardPhase;
}

export type HazardEvent<K extends string = string> =
  | { readonly type: 'warn'; readonly hazard: Hazard<K> }
  | { readonly type: 'active'; readonly hazard: Hazard<K> }
  | { readonly type: 'over'; readonly hazard: Hazard<K> };

export function shapeContains(shape: HazardShape, point: Point, margin = 0): boolean {
  const dx = point.x - shape.x;
  const dz = point.z - shape.z;
  switch (shape.kind) {
    case 'circle':
      return Math.hypot(dx, dz) <= shape.radius + margin;
    case 'rect':
      return Math.abs(dx) <= shape.halfX + margin && Math.abs(dz) <= shape.halfZ + margin;
    case 'ring': {
      const r = Math.hypot(dx, dz);
      return r >= shape.inner - margin && r <= shape.outer + margin;
    }
  }
}

export class HazardField<K extends string = string> {
  readonly hazards: Hazard<K>[] = [];
  private nextId = 1;

  /** Kündigt eine Zone an: `warnS` Vorwarnung, dann `activeS` scharf. */
  add(kind: K, shape: HazardShape, now: number, warnS: number, activeS: number): Hazard<K> {
    const hazard: Hazard<K> = {
      id: this.nextId++,
      kind,
      shape,
      warnAt: now,
      activeAt: now + warnS,
      overAt: now + warnS + activeS,
      phase: 'warn',
    };
    this.hazards.push(hazard);
    return hazard;
  }

  /** Phasen weiterschalten; liefert Wechsel (die Ankündigung kommt beim `add` als `warn`). */
  update(now: number): HazardEvent<K>[] {
    const events: HazardEvent<K>[] = [];
    for (const hazard of this.hazards) {
      if (hazard.phase === 'warn' && now >= hazard.activeAt) {
        hazard.phase = 'active';
        events.push({ type: 'active', hazard });
      }
      if (hazard.phase === 'active' && now >= hazard.overAt) {
        hazard.phase = 'over';
        events.push({ type: 'over', hazard });
      }
    }
    for (let index = this.hazards.length - 1; index >= 0; index--) {
      if (this.hazards[index]?.phase === 'over') this.hazards.splice(index, 1);
    }
    return events;
  }

  /** Scharfe Zonen, die `point` berühren. */
  activeAt(point: Point, margin = 0): Hazard<K>[] {
    return this.hazards.filter(
      (hazard) => hazard.phase === 'active' && shapeContains(hazard.shape, point, margin),
    );
  }

  /** Angekündigte Zonen an `point` (Bots weichen aus). */
  warnedAt(point: Point, margin = 0): Hazard<K>[] {
    return this.hazards.filter(
      (hazard) => hazard.phase === 'warn' && shapeContains(hazard.shape, point, margin),
    );
  }

  clear(): void {
    this.hazards.length = 0;
  }
}
