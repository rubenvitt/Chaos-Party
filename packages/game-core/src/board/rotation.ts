/**
 * Drehende Felder (CHAOS-199, ADR-022): Der Ausgang eines Felds wie des Karussells wechselt
 * jede Runde reihum. Reine Funktionen von Brett und Runde, ohne Zufall: Regelkern, Bots und
 * beide Hosts (Karussell-Stellung) rechnen damit dasselbe aus `BoardView.round`.
 *
 * Statische Topologie bleibt `BoardSpace.next` (alle Ausgänge): Prüfung, Wegpfeile, Gras und
 * Abstände für die Trophäen-Wanderung sehen das ganze Netz. Laufen, Windstoß und Wegwahl nehmen
 * dagegen {@link activeNext}.
 */
import type { BoardDefinition, BoardRotation, BoardSpace } from '../types.ts';

const spaceCache = new WeakMap<BoardDefinition, ReadonlyMap<string, BoardSpace>>();

function spaceById(board: BoardDefinition, id: string): BoardSpace | undefined {
  let map = spaceCache.get(board);
  if (!map) {
    map = new Map(board.spaces.map((space) => [space.id, space]));
    spaceCache.set(board, map);
  }
  return map.get(id);
}

const rotationCache = new WeakMap<BoardDefinition, ReadonlyMap<string, BoardRotation>>();

function rotationMap(board: BoardDefinition): ReadonlyMap<string, BoardRotation> {
  let map = rotationCache.get(board);
  if (!map) {
    map = new Map((board.rotations ?? []).map((rotation) => [rotation.space, rotation]));
    rotationCache.set(board, map);
  }
  return map;
}

/** Drehung des Felds `spaceId` oder `undefined` (festes Feld). */
export function rotationAt(board: BoardDefinition, spaceId: string): BoardRotation | undefined {
  return rotationMap(board).get(spaceId);
}

/** Index des Ausgangs, der in Runde `round` (ab 1) gilt. */
export function rotationIndex(rotation: BoardRotation, round: number): number {
  const count = rotation.exits.length;
  if (count === 0) return 0;
  const step = Math.max(0, Math.floor(round) - 1);
  return step % count;
}

/** Ausgang, der in Runde `round` gilt. */
export function rotationExit(rotation: BoardRotation, round: number): string {
  return rotation.exits[rotationIndex(rotation, round)] ?? rotation.exits[0] ?? rotation.space;
}

/**
 * Nachfolger, die in Runde `round` wirklich offen sind: bei einem drehenden Feld genau der
 * aktuelle Ausgang, sonst `next` des Felds. Unbekanntes Feld: leer.
 */
export function activeNext(
  board: BoardDefinition,
  spaceId: string,
  round: number,
): readonly string[] {
  const rotation = rotationAt(board, spaceId);
  if (rotation) return [rotationExit(rotation, round)];
  return spaceById(board, spaceId)?.next ?? [];
}

/** Ist das Feld eine echte Gabel mit Wegwahl (mehrere Nachfolger und nicht drehend)? */
export function isChoiceFork(board: BoardDefinition, spaceId: string): boolean {
  if (rotationAt(board, spaceId)) return false;
  return (spaceById(board, spaceId)?.next.length ?? 0) >= 2;
}
