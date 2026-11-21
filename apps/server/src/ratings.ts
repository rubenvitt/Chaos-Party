/**
 * Daumen-Stimmen nach Minispielen (CHAOS-87, README §5.4). Rein und ohne Dateisystem, damit die
 * Session auch im Apple-Host (JavaScriptCore) läuft; `ratingsFile.ts` speichert unter Node in
 * eine Datei.
 *
 * Eine Stimme gehört zu einem Lauf (`play`: Partie + Runde) und einem Slot. Erneutes Abstimmen
 * im selben Lauf ersetzt die Stimme, statt eine zweite zu zählen.
 */
import { getMinigameInfo } from '@chaos-party/minigames/catalog';
import { galleryEntries, suggestsRemoval } from '@chaos-party/minigames/gallery';
import type { MinigameRating, SlotNumber, Vote } from '@chaos-party/protocol';

export interface RatingVote {
  /** Kennung des Laufs (Partie und Runde); gleich für alle Stimmen desselben Minispiel-Laufs. */
  readonly play: string;
  readonly slot: SlotNumber;
  readonly minigameId: string;
  readonly vote: Vote;
  /** Aus einer Übungsrunde der Galerie statt aus einer Partie. */
  readonly practice: boolean;
}

export interface StoredRatingVote extends RatingVote {
  /** Zeitpunkt der (letzten) Abgabe, ISO 8601. */
  readonly at: string;
}

export interface RatingStore {
  /** Speichert eine Stimme; dieselbe Kombination aus `play` und `slot` wird ersetzt. */
  record(vote: RatingVote): void;
  /** Alle gespeicherten Stimmen in Abgabe-Reihenfolge. */
  votes(): readonly StoredRatingVote[];
}

/** Stimmen im Speicher (Standard der Session; Apple-Host, Tests). */
export function createMemoryRatingStore(
  initial: readonly StoredRatingVote[] = [],
  options: {
    readonly clock?: () => Date;
    readonly onChange?: (votes: readonly StoredRatingVote[]) => void;
  } = {},
): RatingStore {
  const votes: StoredRatingVote[] = [...initial];
  const clock = options.clock ?? (() => new Date());
  return {
    record(vote) {
      const index = votes.findIndex(
        (entry) => entry.play === vote.play && entry.slot === vote.slot,
      );
      if (index !== -1) votes.splice(index, 1);
      votes.push({ ...vote, at: clock().toISOString() });
      options.onChange?.(votes);
    },
    votes() {
      return votes;
    },
  };
}

/** Zählt Stimmen je Minispiel (nur Minispiele mit Stimmen, nach Kennung sortiert). */
export function summarizeRatings(votes: readonly RatingVote[]): MinigameRating[] {
  const counts = new Map<string, { up: number; down: number }>();
  for (const vote of votes) {
    const count = counts.get(vote.minigameId) ?? { up: 0, down: 0 };
    count[vote.vote] += 1;
    counts.set(vote.minigameId, count);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, count]) => ({ id, up: count.up, down: count.down }));
}

/** Format der Export-Datei (`/ratings.json`) für den Katalog. */
export const RATINGS_EXPORT_FORMAT = 'chaos-party-minigame-ratings';
export const RATINGS_EXPORT_VERSION = 1;

export interface RatingsExport {
  readonly format: typeof RATINGS_EXPORT_FORMAT;
  readonly version: typeof RATINGS_EXPORT_VERSION;
  readonly exportedAt: string;
  /** Je Minispiel des Katalogs (auch ohne Stimmen) plus Kennungen, die nur Stimmen haben. */
  readonly games: readonly {
    readonly id: string;
    readonly title: string | null;
    readonly status: string | null;
    readonly up: number;
    readonly down: number;
    /** Galerie schlägt vor, das Spiel aus der Rotation zu nehmen (Entscheidung bei Ruben). */
    readonly suggestRemoval: boolean;
  }[];
  readonly votes: readonly StoredRatingVote[];
}

export function ratingsExport(votes: readonly StoredRatingVote[], now: Date): RatingsExport {
  const counts = new Map(summarizeRatings(votes).map((rating) => [rating.id, rating]));
  const entries = galleryEntries();
  const known = new Set(entries.map((entry) => entry.info.id));
  const games = [
    ...entries.map((entry) => {
      const count = counts.get(entry.info.id) ?? { up: 0, down: 0 };
      return {
        id: entry.info.id,
        title: entry.info.title,
        status: entry.status,
        up: count.up,
        down: count.down,
        suggestRemoval: entry.status === 'rotation' && suggestsRemoval(count),
      };
    }),
    // Stimmen zu Spielen, die es im Katalog nicht mehr gibt, gehen nicht verloren.
    ...[...counts.values()]
      .filter((rating) => !known.has(rating.id))
      .map((rating) => ({
        id: rating.id,
        title: getMinigameInfo(rating.id)?.title ?? null,
        status: null,
        up: rating.up,
        down: rating.down,
        suggestRemoval: false,
      })),
  ];
  return {
    format: RATINGS_EXPORT_FORMAT,
    version: RATINGS_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    games,
    votes: [...votes],
  };
}
