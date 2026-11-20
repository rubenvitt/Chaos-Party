/**
 * Brett-Mechaniken des Frostgipfels (CHAOS-198, ADR-022): Eisfelder, Seilbahnen und Lawinen.
 * Reine Funktionen von Brett (und Runde), ohne Zufall: Regelkern, Bots und beide Hosts
 * (Ansage der Lawine, Eis-Optik, Seil statt Wegpfeil) rechnen damit dasselbe.
 *
 * Statische Topologie bleibt `BoardSpace.next`: Die Seilbahn ist eine echte Kante, damit
 * Prüfung, Abstände der Trophäen-Wanderung und Wegsuche der Bots sie sehen.
 */
import type { BoardAvalancheZone, BoardCableCar, BoardDefinition } from '../types.ts';

const iceCache = new WeakMap<BoardDefinition, ReadonlySet<string>>();

function iceSet(board: BoardDefinition): ReadonlySet<string> {
  let set = iceCache.get(board);
  if (!set) {
    set = new Set(board.ice ?? []);
    iceCache.set(board, set);
  }
  return set;
}

/** Ist `spaceId` ein Eisfeld? */
export function isIce(board: BoardDefinition, spaceId: string): boolean {
  return iceSet(board).has(spaceId);
}

/** Seilbahn auf der Kante `from` → `to` oder `undefined`. */
export function cableCarAt(
  board: BoardDefinition,
  from: string,
  to: string,
): BoardCableCar | undefined {
  return board.cableCars?.find((car) => car.from === from && car.to === to);
}

/** Ist `from` → `to` eine Seilbahn-Kante (Host: Seil statt Wegpfeil)? */
export function isCableEdge(board: BoardDefinition, from: string, to: string): boolean {
  return cableCarAt(board, from, to) !== undefined;
}

/**
 * Lawine zu Beginn der Runde `round` oder `undefined`. Sie geht ab, wenn `round > 1` und
 * `(round - 1) % every === 0`; die k-te Lawine (k ab 0) trifft `zones[k % zones.length]`.
 */
export function avalancheAt(board: BoardDefinition, round: number): BoardAvalancheZone | undefined {
  const avalanche = board.avalanche;
  if (!avalanche || avalanche.every < 1 || avalanche.zones.length === 0) return undefined;
  const r = Math.floor(round);
  if (r <= 1 || (r - 1) % avalanche.every !== 0) return undefined;
  const index = ((r - 1) / avalanche.every - 1) % avalanche.zones.length;
  return avalanche.zones[index];
}

/**
 * Warnung in Runde `round`: die Zone der Lawine, die zu Beginn der **nächsten** Runde abgeht
 * (wer am Ende dieser Runde dort steht, verliert Münzen), sonst `undefined`. In der letzten
 * Runde (`round >= rounds`) kommt keine mehr.
 */
export function avalancheWarning(
  board: BoardDefinition,
  round: number,
  rounds: number,
): BoardAvalancheZone | undefined {
  if (round >= rounds) return undefined;
  return avalancheAt(board, round + 1);
}
