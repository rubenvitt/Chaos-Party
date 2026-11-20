/**
 * Minispiel-Rotation für einen großen Katalog (CHAOS-85, docs/minigames/README.md §5.5, §6).
 *
 * Grundprinzip bleibt der „Beutel“ aus M3: Die erlaubten Minispiele werden per Seed gemischt
 * und der Reihe nach gezogen, bis alle dran waren. Darauf setzen drei Schichten:
 *
 * 1. **Filter** beim Füllen des Beutels: Spielerzahl, „nur iPhone“ bei iPad-Zonen, Sperrliste,
 *    keine Mikro-Spiele (die gehören zur Schnellfeuer-Runde, CHAOS-90).
 *    Bliebe danach nichts übrig, fällt der jeweilige Filter weg (lieber ein unpassendes Spiel
 *    als gar keins).
 * 2. **Gewichte** beim Mischen: Favoriten öfter, geheime Wahl bei iPad-Zonen deutlich seltener.
 *    Spiele der letzten Partie kommen ans Ende des Beutels.
 * 3. **Mischen über Achsen** beim Ziehen: Aus den nächsten `ROTATION_LOOKAHEAD` Spielen im
 *    Beutel gewinnt das erste mit den wenigsten Überschneidungen zu den zuletzt gespielten
 *    (Kategorie, Bedienung, Team-Form, Familie). Gleiche Familie oder gleiches Kernverb direkt hintereinander gibt es nur, wenn der
 *    ganze Beutel nichts anderes mehr hat.
 *
 * Ohne Achsen, Gewichte und Filter verhält sich alles genau wie vor CHAOS-85: dieselben
 * Zufallszahlen, dieselbe Reihenfolge.
 */
import { shuffled, type Rng } from '../rng.ts';
import type { MinigameRotationOptions, MinigameSpec } from '../types.ts';

/**
 * So viele Spiele vorn im Beutel kommen beim Ziehen in Frage. Großzügig, weil zurückgestellte
 * Spiele vorn liegen bleiben; ein kleines Fenster würde mit ihnen volllaufen.
 */
export const ROTATION_LOOKAHEAD = 64;
/** Gewicht eines Favoriten beim Mischen. */
export const FAVORITE_WEIGHT = 2;
/** Gewicht eines Spiels mit geheimer Wahl, wenn jemand an einer iPad-Zone spielt. */
export const SECRET_CHOICE_IPAD_WEIGHT = 0.2;

/** Strafpunkte für Überschneidungen; ab `HARD_CONFLICT` gilt die Regel „nie hintereinander“. */
const HARD_CONFLICT = 1000;
const PENALTY = {
  sameId: HARD_CONFLICT * 4,
  family: HARD_CONFLICT,
  verb: HARD_CONFLICT,
  category: 4,
  controls: 4,
  /** Gleiche Team-Spielform (1v3, 2v2, Koop) hintereinander; `ffa` ist der Normalfall. */
  teamForm: 4,
} as const;
/** Überschneidungen mit dem vorletzten Spiel zählen schwächer (Faktor). */
const PREVIOUS_FACTOR = 0.5;
/**
 * Strafpunkte, wenn die Familie kürzlich schon dran war (Familien reihum). „Kürzlich“ heißt:
 * innerhalb der letzten (Zahl der Familien im Vorrat − 1) Spiele. Mehr als die weichen
 * Achsen zusammen, damit eine neue Familie vor einer frischen Kategorie geht.
 */
const RECENT_FAMILY = 10;
/**
 * Gewichte wirken auch beim Ziehen: je Verdopplung des Gewichts so viele Strafpunkte weniger
 * (Favorit −5, geheime Wahl am iPad ≈ +12). Sonst würde „Familien reihum“ sie wieder
 * ausgleichen, weil Familie 12 fast nur aus geheimer Wahl besteht.
 */
const WEIGHT_BONUS = 5;
/** So viele zuletzt gespielte Minispiele merkt sich die Rotation (neuestes zuerst). */
export const ROTATION_MEMORY = 24;

/** Kopie der Optionen ohne fremde Felder (für den Partie-Zustand). */
export function copyRotationOptions(options: MinigameRotationOptions): MinigameRotationOptions {
  return {
    ...(options.ipadZones === undefined ? {} : { ipadZones: options.ipadZones }),
    ...(options.recent === undefined ? {} : { recent: [...options.recent] }),
    ...(options.blocked === undefined ? {} : { blocked: [...options.blocked] }),
    ...(options.favorites === undefined ? {} : { favorites: [...options.favorites] }),
  };
}

/** Taugt das Spiel für diese Spielerzahl und Aufstellung? */
function suits(spec: MinigameSpec, players: number, ipadZones: boolean): boolean {
  // Mikro-Spiele gehören zur Schnellfeuer-Runde (CHAOS-90), nicht zur normalen Auswahl.
  if (spec.form === 'mikro') return false;
  if (players < (spec.minPlayers ?? 1) || players > (spec.maxPlayers ?? 4)) return false;
  return !(ipadZones && spec.ipadZone === false);
}

/**
 * Minispiele, aus denen die Partie ziehen darf. Reihenfolge wie in `specs` (der Seed mischt
 * erst beim Füllen des Beutels).
 */
export function eligibleMinigames(
  specs: readonly MinigameSpec[],
  players: number,
  options: MinigameRotationOptions = {},
): MinigameSpec[] {
  const suitable = specs.filter((spec) => suits(spec, players, options.ipadZones ?? false));
  const base = suitable.length > 0 ? suitable : [...specs];
  const blocked = new Set(options.blocked ?? []);
  const allowed = base.filter((spec) => !blocked.has(spec.id));
  return allowed.length > 0 ? allowed : base;
}

/** Gewicht eines Spiels beim Mischen (1 = normal). */
export function minigameWeight(spec: MinigameSpec, options: MinigameRotationOptions = {}): number {
  let weight = 1;
  if (options.favorites?.includes(spec.id) === true) weight *= FAVORITE_WEIGHT;
  if (options.ipadZones === true && spec.secretChoice === true) weight *= SECRET_CHOICE_IPAD_WEIGHT;
  return weight;
}

/**
 * Gewichtetes Mischen ohne Zurücklegen (Efraimidis–Spirakis): Schlüssel `u^(1/w)`, absteigend.
 * Schwere Spiele landen eher vorn. Verbraucht je Spiel eine Zufallszahl.
 */
function weightedOrder(rng: Rng, specs: readonly MinigameSpec[], weights: number[]): string[] {
  return specs
    .map((spec, index) => ({
      id: spec.id,
      index,
      key: Math.pow(rng.next(), 1 / (weights[index] ?? 1)),
    }))
    .sort((a, b) => b.key - a.key || a.index - b.index)
    .map((entry) => entry.id);
}

/**
 * Neuen Beutel füllen: gemischt (bei lauter Gewicht 1 genau wie bisher per Fisher-Yates),
 * Spiele der letzten Partie ans Ende, und nie direkt dasselbe wie zuletzt vorn.
 */
export function fillMinigameBag(
  rng: Rng,
  pool: readonly MinigameSpec[],
  options: MinigameRotationOptions = {},
  last: string | null = null,
): string[] {
  const weights = pool.map((spec) => minigameWeight(spec, options));
  let bag = weights.every((weight) => weight === 1)
    ? shuffled(
        rng,
        pool.map((spec) => spec.id),
      )
    : weightedOrder(rng, pool, weights);
  const recent = new Set(options.recent ?? []);
  if (recent.size > 0) {
    bag = [...bag.filter((id) => !recent.has(id)), ...bag.filter((id) => recent.has(id))];
  }
  if (bag.length > 1 && bag[0] === last) bag.push(...bag.splice(0, 1));
  return bag;
}

/** Weiche Strafpunkte, wenn `spec` nach `before` käme (Kategorie, Bedienung, Team-Form). */
function softOverlap(spec: MinigameSpec, before: MinigameSpec): number {
  let penalty = 0;
  if (same(spec.category, before.category)) penalty += PENALTY.category;
  if (same(spec.controls, before.controls)) penalty += PENALTY.controls;
  if (spec.form !== undefined && spec.form !== 'ffa' && same(spec.form, before.form)) {
    penalty += PENALTY.teamForm;
  }
  return penalty;
}

function same(a: string | undefined, b: string | undefined): boolean {
  return a !== undefined && a === b;
}

/** Strafpunkte, wenn `spec` direkt nach `before` käme (harte und weiche Regeln). */
function overlap(spec: MinigameSpec, before: MinigameSpec): number {
  let penalty = softOverlap(spec, before);
  if (spec.id === before.id) penalty += PENALTY.sameId;
  if (same(spec.family, before.family)) penalty += PENALTY.family;
  if (same(spec.verb, before.verb)) penalty += PENALTY.verb;
  return penalty;
}

/** Zuletzt gespielte Minispiele nach dem Ziehen von `id` (neuestes zuerst, gekürzt). */
export function rememberMinigame(history: readonly string[], id: string): string[] {
  return [id, ...history].slice(0, ROTATION_MEMORY);
}

/**
 * Index des nächsten Spiels im Beutel: im Vorausblick das erste mit den wenigsten
 * Strafpunkten gegenüber `history` (zuletzt gespielte, neuestes zuerst). Hart: gleiche Familie
 * oder gleiches Kernverb direkt nach dem letzten Spiel. Weich: gleiche Kategorie, Bedienung
 * oder Team-Form wie das letzte (das vorletzte zählt halb), Familie kürzlich schon dran;
 * Gewichte (Favorit, geheime Wahl am iPad) verschieben die Punkte. Verletzt jeder Kandidat im
 * Vorausblick eine harte Regel, wird der Rest des Beutels nach einem Ausweg durchsucht. Ohne Geschichte oder Achsen ist es immer 0.
 */
export function pickMinigameIndex(
  bag: readonly string[],
  byId: ReadonlyMap<string, MinigameSpec>,
  history: readonly string[],
  options: MinigameRotationOptions = {},
): number {
  const before = history.flatMap((id) => {
    const spec = byId.get(id);
    return spec ? [spec] : [];
  });
  const [last, previous] = before;
  if (!last || bag.length <= 1) return 0;
  // Familien reihum: Wie viele gibt es im Vorrat (Beutel + schon gespielt)?
  const families = new Set<string>();
  for (const spec of before) if (spec.family !== undefined) families.add(spec.family);
  for (const id of bag) {
    const family = byId.get(id)?.family;
    if (family !== undefined) families.add(family);
  }
  const recentFamilies = new Set(
    before
      .slice(1, Math.max(1, families.size - 1))
      .flatMap((spec) => (spec.family === undefined ? [] : [spec.family])),
  );
  const score = (id: string): number => {
    const spec = byId.get(id);
    if (!spec) return 0;
    let value = overlap(spec, last);
    if (previous) value += softOverlap(spec, previous) * PREVIOUS_FACTOR;
    if (spec.family !== undefined && recentFamilies.has(spec.family)) value += RECENT_FAMILY;
    return value - Math.log2(minigameWeight(spec, options)) * WEIGHT_BONUS;
  };
  let best = 0;
  let bestScore = Number.POSITIVE_INFINITY;
  const window = Math.min(ROTATION_LOOKAHEAD, bag.length);
  for (let i = 0; i < window; i++) {
    const value = score(bag[i] ?? '');
    if (value < bestScore) {
      best = i;
      bestScore = value;
    }
  }
  if (bestScore < HARD_CONFLICT) return best;
  for (let i = window; i < bag.length; i++) {
    if (score(bag[i] ?? '') < HARD_CONFLICT) return i;
  }
  return best;
}
