/**
 * Prüfung einer Brett-Definition (CHAOS-18). Ein Brett ist gültig, wenn jedes Feld
 * erreichbar ist, man nirgends steckenbleibt und der Host es lesbar zeichnen kann.
 * Die Regeln laufen auf jedem Brett in `BOARDS` als Unit-Test und lassen sich vom Server
 * beim Start erneut aufrufen.
 */
import type { BoardDefinition, BoardSpace } from '../types.ts';

export type BoardValidation =
  { readonly ok: true } | { readonly ok: false; readonly errors: string[] };

/** Kleinster Abstand zweier Feldmittelpunkte (Welt-Einheiten), damit Figuren und Symbole Platz haben. */
export const MIN_SPACE_DISTANCE = 1.6;
/** Längster Wegweiser-Text (passt auf Schild und Controller-Knopf). */
export const MAX_SPACE_LABEL_LENGTH = 32;
/** IDs von Brett und Feldern (gleich `SpaceIdSchema` im Protokoll). */
const ID_PATTERN = /^[a-z0-9-]{1,32}$/;

/** Alle von `from` aus über `edges` erreichbaren IDs (einschließlich `from`). */
function reachable(from: string, edges: ReadonlyMap<string, readonly string[]>): Set<string> {
  const seen = new Set<string>([from]);
  const stack = [from];
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    for (const next of edges.get(id) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      stack.push(next);
    }
  }
  return seen;
}

function checkIds(board: BoardDefinition, errors: string[]): Map<string, BoardSpace> {
  if (!ID_PATTERN.test(board.id)) errors.push(`Brett-ID „${board.id}“ ist ungültig`);
  if (board.spaces.length === 0) errors.push('Brett hat keine Felder');
  const byId = new Map<string, BoardSpace>();
  for (const space of board.spaces) {
    if (!ID_PATTERN.test(space.id)) errors.push(`Feld-ID „${space.id}“ ist ungültig`);
    if (byId.has(space.id)) errors.push(`Feld-ID „${space.id}“ ist doppelt`);
    else byId.set(space.id, space);
  }
  if (!byId.has(board.start)) errors.push(`Startfeld „${board.start}“ existiert nicht`);
  else if (byId.get(board.start)?.kind !== 'start') {
    errors.push(`Startfeld „${board.start}“ hat nicht den Typ „start“`);
  }
  const starts = board.spaces.filter((s) => s.kind === 'start').length;
  if (starts !== 1) errors.push(`Brett braucht genau ein Feld vom Typ „start“ (hat ${starts})`);
  return byId;
}

function checkEdges(
  board: BoardDefinition,
  byId: ReadonlyMap<string, BoardSpace>,
  errors: string[],
) {
  for (const space of board.spaces) {
    if (space.next.length === 0)
      errors.push(`Feld ${space.id} ist eine Sackgasse (kein Nachfolger)`);
    if (new Set(space.next).size !== space.next.length) {
      errors.push(`Feld ${space.id} nennt einen Nachfolger doppelt`);
    }
    for (const next of space.next) {
      if (next === space.id) errors.push(`Feld ${space.id} zeigt auf sich selbst`);
      else if (!byId.has(next))
        errors.push(`Feld ${space.id} zeigt auf unbekanntes Feld „${next}“`);
    }
    if (space.label !== undefined) {
      if (space.label.trim() === '' || space.label.length > MAX_SPACE_LABEL_LENGTH) {
        errors.push(
          `Wegweiser von ${space.id} ist leer oder länger als ${MAX_SPACE_LABEL_LENGTH} Zeichen`,
        );
      }
    }
    const { x, z } = space.position;
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      errors.push(`Feld ${space.id} hat keine gültige Position`);
    }
  }
}

function checkConnectivity(
  board: BoardDefinition,
  byId: ReadonlyMap<string, BoardSpace>,
  errors: string[],
) {
  if (!byId.has(board.start)) return;
  const forward = new Map<string, string[]>();
  const backward = new Map<string, string[]>();
  for (const space of board.spaces) {
    const targets = space.next.filter((n) => byId.has(n));
    forward.set(space.id, targets);
    for (const target of targets) {
      const list = backward.get(target) ?? [];
      list.push(space.id);
      backward.set(target, list);
    }
  }
  const fromStart = reachable(board.start, forward);
  const toStart = reachable(board.start, backward);
  for (const space of board.spaces) {
    if (!fromStart.has(space.id))
      errors.push(`Feld ${space.id} ist vom Start aus nicht erreichbar`);
    if (!toStart.has(space.id)) errors.push(`Von Feld ${space.id} führt kein Weg zurück zum Start`);
  }
}

function checkDistances(board: BoardDefinition, errors: string[]) {
  const spaces = board.spaces;
  for (let i = 0; i < spaces.length; i++) {
    for (let j = i + 1; j < spaces.length; j++) {
      const a = spaces[i];
      const b = spaces[j];
      if (!a || !b) continue;
      const distance = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
      if (distance < MIN_SPACE_DISTANCE) {
        errors.push(
          `Felder ${a.id} und ${b.id} liegen zu dicht (${distance.toFixed(2)} < ${MIN_SPACE_DISTANCE})`,
        );
      }
    }
  }
}

/**
 * Prüft eine Brett-Definition und sammelt **alle** Fehler (deutsch, mit Feld-ID):
 * eindeutige und gültige IDs, genau ein Startfeld, bekannte Nachfolger, keine Selbstschleife,
 * keine Sackgasse, stark zusammenhängend (alles vom Start erreichbar und zurück),
 * Mindestabstand, mindestens ein Trophäenfeld und mindestens eine Verzweigung.
 */
export function validateBoard(board: BoardDefinition): BoardValidation {
  const errors: string[] = [];
  const byId = checkIds(board, errors);
  checkEdges(board, byId, errors);
  checkConnectivity(board, byId, errors);
  checkDistances(board, errors);
  if (!board.spaces.some((s) => s.kind === 'trophy')) errors.push('Brett hat kein Trophäenfeld');
  if (!board.spaces.some((s) => s.next.length >= 2)) errors.push('Brett hat keine Verzweigung');
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
