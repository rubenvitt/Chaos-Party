/**
 * Prüfung einer Brett-Definition (CHAOS-18). Ein Brett ist gültig, wenn jedes Feld
 * erreichbar ist, man nirgends steckenbleibt und der Host es lesbar zeichnen kann.
 * Die Regeln laufen auf jedem Brett in `BOARDS` als Unit-Test und lassen sich vom Server
 * beim Start erneut aufrufen.
 */
import type { BoardDefinition, BoardSpace } from '../types.ts';
import { activeNext, isChoiceFork } from './rotation.ts';

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

/** So viele Runden prüft `checkRotations` höchstens (kleinstes gemeinsames Vielfaches der Drehungen). */
const MAX_ROTATION_ROUNDS = 60;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Drehende Felder (CHAOS-199): bekanntes Feld, je Feld höchstens eine Drehung, mindestens zwei
 * verschiedene Ausgänge, als Menge gleich `next`. Dazu muss in **jeder** Stellung von jedem Feld
 * aus ein Weg zurück zum Start offen sein (niemand bleibt in einer Runde gefangen).
 */
function checkRotations(
  board: BoardDefinition,
  byId: ReadonlyMap<string, BoardSpace>,
  errors: string[],
) {
  const rotations = board.rotations ?? [];
  if (rotations.length === 0) return;
  const seen = new Set<string>();
  let rounds = 1;
  for (const rotation of rotations) {
    const space = byId.get(rotation.space);
    if (!space) {
      errors.push(`Drehung an unbekanntem Feld „${rotation.space}“`);
      continue;
    }
    if (seen.has(space.id)) errors.push(`Feld ${space.id} dreht sich doppelt`);
    seen.add(space.id);
    const exits = new Set(rotation.exits);
    if (rotation.exits.length < 2)
      errors.push(`Drehung an ${space.id} braucht mindestens zwei Ausgänge`);
    if (exits.size !== rotation.exits.length)
      errors.push(`Drehung an ${space.id} nennt einen Ausgang doppelt`);
    const next = new Set(space.next);
    if (exits.size !== next.size || [...exits].some((id) => !next.has(id))) {
      errors.push(`Ausgänge der Drehung an ${space.id} passen nicht zu „next“`);
    }
    const count = Math.max(1, rotation.exits.length);
    rounds = (rounds * count) / gcd(rounds, count);
  }
  if (!byId.has(board.start)) return;
  for (let round = 1; round <= Math.min(rounds, MAX_ROTATION_ROUNDS); round++) {
    const backward = new Map<string, string[]>();
    for (const space of board.spaces) {
      for (const target of activeNext(board, space.id, round)) {
        const list = backward.get(target) ?? [];
        list.push(space.id);
        backward.set(target, list);
      }
    }
    const toStart = reachable(board.start, backward);
    const stuck = board.spaces.filter((space) => !toStart.has(space.id)).map((space) => space.id);
    if (stuck.length > 0) {
      errors.push(
        `In Runde ${String(round)} führt von ${stuck.join(', ')} kein Weg zurück zum Start`,
      );
    }
  }
}

/**
 * Eisfelder (CHAOS-198): bekanntes Feld, nicht doppelt, kein Start-, Trophäen- oder drehendes
 * Feld, genau ein Nachfolger. Wo eine Rutschpartie endet, liegt kein Trophäenfeld (dort gäbe es
 * kein Kaufangebot). Eis im Kreis wäre eine Endlos-Rutschpartie.
 */
function checkIce(board: BoardDefinition, byId: ReadonlyMap<string, BoardSpace>, errors: string[]) {
  const ice = board.ice ?? [];
  if (ice.length === 0) return;
  const set = new Set<string>();
  for (const id of ice) {
    const space = byId.get(id);
    if (!space) {
      errors.push(`Eisfeld „${id}“ existiert nicht`);
      continue;
    }
    if (set.has(id)) errors.push(`Eisfeld ${id} ist doppelt`);
    set.add(id);
    if (space.kind === 'start' || space.kind === 'trophy') {
      errors.push(`Eisfeld ${id} darf kein Start- oder Trophäenfeld sein`);
    }
    if (space.next.length !== 1) errors.push(`Eisfeld ${id} braucht genau einen Nachfolger`);
    if (board.rotations?.some((rotation) => rotation.space === id)) {
      errors.push(`Eisfeld ${id} darf sich nicht drehen`);
    }
  }
  for (const id of set) {
    let current = id;
    const seen = new Set<string>();
    while (set.has(current) && !seen.has(current)) {
      seen.add(current);
      current = byId.get(current)?.next[0] ?? current;
    }
    if (set.has(current)) errors.push(`Eis ab ${id} läuft im Kreis`);
    else if (byId.get(current)?.kind === 'trophy') {
      errors.push(`Rutschpartie ab ${id} endet auf dem Trophäenfeld ${current}`);
    }
  }
}

/**
 * Seilbahnen (CHAOS-198): Kante aus `next` einer Gabel mit Wegwahl, nicht der erste Nachfolger
 * (der kostenlose Weg ist die Standardoption), Preis eine ganze Zahl ≥ 1, je Kante höchstens
 * eine Seilbahn und an jeder Gabel mindestens ein kostenloser Weg.
 */
function checkCableCars(
  board: BoardDefinition,
  byId: ReadonlyMap<string, BoardSpace>,
  errors: string[],
) {
  const seen = new Set<string>();
  for (const car of board.cableCars ?? []) {
    const from = byId.get(car.from);
    const key = `${car.from}>${car.to}`;
    if (seen.has(key)) errors.push(`Seilbahn ${car.from} → ${car.to} ist doppelt`);
    seen.add(key);
    if (!from || !byId.has(car.to)) {
      errors.push(`Seilbahn ${car.from} → ${car.to} verbindet unbekannte Felder`);
      continue;
    }
    if (!isChoiceFork(board, from.id) || !from.next.includes(car.to)) {
      errors.push(`Seilbahn ${car.from} → ${car.to} ist keine Kante einer Gabel mit Wegwahl`);
    } else if (from.next[0] === car.to) {
      errors.push(`Seilbahn ${car.from} → ${car.to} darf nicht der erste Weg der Gabel sein`);
    }
    if (!Number.isInteger(car.price) || car.price < 1) {
      errors.push(`Seilbahn ${car.from} → ${car.to} braucht einen Preis ≥ 1`);
    }
  }
}

/**
 * Lawinen (CHAOS-198): Abstand eine ganze Zahl ≥ 1, Verlust ≥ 1, mindestens eine Zone, jede mit
 * Namen (wie ein Wegweiser) und bekannten, nicht doppelten Feldern ohne Startfeld.
 */
function checkAvalanche(
  board: BoardDefinition,
  byId: ReadonlyMap<string, BoardSpace>,
  errors: string[],
) {
  const avalanche = board.avalanche;
  if (!avalanche) return;
  if (!Number.isInteger(avalanche.every) || avalanche.every < 1) {
    errors.push('Lawine braucht einen Abstand von mindestens einer Runde');
  }
  if (!Number.isInteger(avalanche.coins) || avalanche.coins < 1) {
    errors.push('Lawine braucht einen Münzverlust ≥ 1');
  }
  if (avalanche.zones.length === 0) errors.push('Lawine braucht mindestens eine Zone');
  for (const zone of avalanche.zones) {
    if (zone.name.trim() === '' || zone.name.length > MAX_SPACE_LABEL_LENGTH) {
      errors.push(`Lawinenzone „${zone.name}“ hat einen leeren oder zu langen Namen`);
    }
    if (zone.spaces.length === 0) errors.push(`Lawinenzone „${zone.name}“ hat keine Felder`);
    if (new Set(zone.spaces).size !== zone.spaces.length) {
      errors.push(`Lawinenzone „${zone.name}“ nennt ein Feld doppelt`);
    }
    for (const id of zone.spaces) {
      if (!byId.has(id)) errors.push(`Lawinenzone „${zone.name}“: Feld „${id}“ existiert nicht`);
      else if (id === board.start) errors.push(`Lawinenzone „${zone.name}“ enthält den Start`);
    }
  }
}

/**
 * Prüft eine Brett-Definition und sammelt **alle** Fehler (deutsch, mit Feld-ID):
 * eindeutige und gültige IDs, genau ein Startfeld, bekannte Nachfolger, keine Selbstschleife,
 * keine Sackgasse, stark zusammenhängend (alles vom Start erreichbar und zurück),
 * Mindestabstand, mindestens ein Trophäenfeld und mindestens eine Verzweigung mit Wegwahl;
 * drehende Felder wie in `checkRotations`, Eis, Seilbahnen und Lawinen wie in `checkIce`,
 * `checkCableCars` und `checkAvalanche`.
 */
export function validateBoard(board: BoardDefinition): BoardValidation {
  const errors: string[] = [];
  const byId = checkIds(board, errors);
  checkEdges(board, byId, errors);
  checkConnectivity(board, byId, errors);
  checkDistances(board, errors);
  checkRotations(board, byId, errors);
  checkIce(board, byId, errors);
  checkCableCars(board, byId, errors);
  checkAvalanche(board, byId, errors);
  if (!board.spaces.some((s) => s.kind === 'trophy')) errors.push('Brett hat kein Trophäenfeld');
  if (!board.spaces.some((s) => isChoiceFork(board, s.id)))
    errors.push('Brett hat keine Verzweigung');
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
