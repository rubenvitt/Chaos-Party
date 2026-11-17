/**
 * Feld-Anker für den Brett-Export (CHAOS-140, ADR-019 §5): Der native Apple-Host findet die
 * Felder in `brett.usdz` über benannte, leere Knoten. USD erlaubt in Prim-Namen nur Buchstaben,
 * Ziffern und `_` und keinen führenden Ziffern; die Namen müssen deshalb umgeschrieben werden,
 * ohne dass zwei Felder denselben Anker bekommen.
 */
import type { BoardDefinition } from '@chaos-party/game-core';

/** Vorsilbe der Anker-Knoten (`feld_s01`). */
export const FIELD_ANCHOR_PREFIX = 'feld_';
/** Elternknoten aller Anker. */
export const FIELD_ANCHOR_GROUP = 'felder';

/** USD-tauglicher Anker-Name für eine Feld-ID aus game-core. */
export function fieldAnchorName(spaceId: string): string {
  return FIELD_ANCHOR_PREFIX + spaceId.replace(/[^A-Za-z0-9_]/g, '_');
}

export interface FieldAnchor {
  readonly id: string;
  readonly anchor: string;
  readonly kind: string;
  readonly next: readonly string[];
  /** Feldmitte auf der Feldoberfläche, Babylon-Koordinaten (linkshändig). */
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
}

/** Alle Anker eines Bretts; wirft, wenn zwei Felder nach dem Umschreiben gleich heißen. */
export function fieldAnchors(board: BoardDefinition, surfaceY: number): FieldAnchor[] {
  const seen = new Map<string, string>();
  return board.spaces.map((space) => {
    const anchor = fieldAnchorName(space.id);
    const other = seen.get(anchor);
    if (other !== undefined) {
      throw new Error(`Feld-Anker „${anchor}“ doppelt: Felder „${other}“ und „${space.id}“`);
    }
    seen.set(anchor, space.id);
    return {
      id: space.id,
      anchor,
      kind: space.kind,
      next: space.next,
      position: { x: space.position.x, y: surfaceY, z: space.position.z },
    };
  });
}
