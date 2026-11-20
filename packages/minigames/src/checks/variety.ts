/**
 * Vielfalts-Prüfung (CHAOS-84, README §5.5, Auflage aus dem Konzept-Gate CHAOS-82): Jedes
 * Minispiel der Rotation muss sich von **jedem** anderen Spiel der Rotation in mindestens
 * `MIN_DIFFERENCES` (3) der sieben Steckbrief-Merkmale unterscheiden. Ausnahmen nur mit
 * Begründung (Satz im Katalog-Eintrag, `docs/minigames/katalog.md`).
 *
 * Steckbrief, Wertelisten und Abstand kommen aus dem Baukasten (`@chaos-party/minigame-kit`,
 * ADR-021), die Daten aus `../steckbriefe.ts`. Hier liegt nur die Regel über alle Paare.
 */
import {
  differences,
  MIN_DIFFERENCES,
  STECKBRIEF_MERKMALE,
  type Steckbrief,
} from '@chaos-party/minigame-kit';

export type Merkmal = (typeof STECKBRIEF_MERKMALE)[number];

/** Begründete Ausnahme: `id` darf `with` näher als erlaubt sein. */
export interface VarietyException {
  readonly id: string;
  readonly with: string;
  readonly reason: string;
}

/**
 * Begründete Ausnahmen vom Mindestabstand innerhalb der Rotation. Jede braucht einen Satz im
 * Katalog-Eintrag, warum sich die Spiele trotzdem verschieden anfühlen.
 */
export const VARIETY_EXCEPTIONS: readonly VarietyException[] = [];

export interface NearestGame {
  readonly id: string;
  readonly distance: number;
  /** Gleiche Merkmale (zur Fehlermeldung). */
  readonly shared: readonly Merkmal[];
}

function compare(own: Steckbrief, otherId: string, other: Steckbrief): NearestGame {
  const diff = differences(own, other);
  return {
    id: otherId,
    distance: diff.length,
    shared: STECKBRIEF_MERKMALE.filter((key) => !diff.includes(key)),
  };
}

/** Ähnlichstes anderes Spiel (kleinster Abstand; bei Gleichstand das erste in der Liste). */
export function nearestGame(
  id: string,
  profiles: ReadonlyMap<string, Steckbrief>,
): NearestGame | null {
  const own = profiles.get(id);
  if (!own) throw new Error(`Kein Steckbrief für ${id}`);
  let nearest: NearestGame | null = null;
  for (const [otherId, other] of profiles) {
    if (otherId === id) continue;
    const candidate = compare(own, otherId, other);
    if (!nearest || candidate.distance < nearest.distance) nearest = candidate;
  }
  return nearest;
}

export interface VarietyViolation {
  readonly id: string;
  readonly nearest: NearestGame;
}

/** Alle Paare unter dem Mindestabstand (ohne begründete Ausnahmen), je Richtung einmal. */
export function checkVariety(
  profiles: ReadonlyMap<string, Steckbrief>,
  exceptions: readonly VarietyException[] = VARIETY_EXCEPTIONS,
  minDistance: number = MIN_DIFFERENCES,
): VarietyViolation[] {
  const violations: VarietyViolation[] = [];
  for (const [id, own] of profiles) {
    // Jedes andere Spiel zählt, nicht nur das ähnlichste: Sonst könnte eine Ausnahme für das
    // ähnlichste ein zweites, ebenso nahes Spiel verdecken.
    for (const [otherId, other] of profiles) {
      if (otherId === id) continue;
      const pair = compare(own, otherId, other);
      if (pair.distance >= minDistance) continue;
      const excused = exceptions.some(
        (exception) =>
          (exception.id === id && exception.with === otherId) ||
          (exception.id === otherId && exception.with === id),
      );
      if (!excused) violations.push({ id, nearest: pair });
    }
  }
  return violations;
}

/** Steckbrief-Tabelle mit ähnlichstem Spiel (für Prüfbericht und Katalog). */
export function varietyTable(profiles: ReadonlyMap<string, Steckbrief>): string {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  const headers = ['Spiel', ...STECKBRIEF_MERKMALE, 'Ort', 'ähnlichstes Spiel', 'Abstand'];
  const rows = [...profiles].map(([id, profile]) => {
    const nearest = nearestGame(id, profiles);
    return line([
      id,
      ...STECKBRIEF_MERKMALE.map((key) => profile[key]),
      profile.ort ?? '–',
      nearest?.id ?? '–',
      nearest ? `${nearest.distance} / ${STECKBRIEF_MERKMALE.length}` : '–',
    ]);
  });
  return [line(headers), line(headers.map(() => '---')), ...rows].join('\n');
}
