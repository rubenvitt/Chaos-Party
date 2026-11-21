/**
 * Minispiel-Galerie in der PC-Lobby (CHAOS-87): reine Ableitung der Zeilen aus Katalog und
 * Daumen-Übersicht des Servers. Ohne React, unit-getestet.
 */
import {
  GALLERY_STATUS_LABELS,
  galleryEntries,
  suggestsRemoval,
  type GalleryEntry,
  type GalleryStatus,
} from '@chaos-party/minigames/gallery';
import type { MinigameCategory } from '@chaos-party/minigame-sdk';
import type { MinigameRating } from '@chaos-party/protocol';

export const CATEGORY_LABELS: Readonly<Record<MinigameCategory, string>> = {
  arcade: 'Arcade',
  physics: 'Physik',
  hybrid: 'Hybrid',
};

export interface GalleryRow {
  readonly id: string;
  readonly title: string;
  readonly tagline: string;
  readonly status: GalleryStatus;
  readonly statusLabel: string;
  readonly category: string;
  /** Familie (sobald der Steckbrief sie trägt) oder `null`. */
  readonly family: string | null;
  readonly controls: string;
  /** Spielzeit in ganzen Sekunden. */
  readonly seconds: number;
  readonly up: number;
  readonly down: number;
  /** Rotation, genug Stimmen, überwiegend Daumen runter: Rauswurf vorschlagen (Ruben entscheidet). */
  readonly suggestRemoval: boolean;
}

export function galleryRows(
  ratings: readonly MinigameRating[],
  entries: readonly GalleryEntry[] = galleryEntries(),
): GalleryRow[] {
  const byId = new Map(ratings.map((rating) => [rating.id, rating]));
  return entries.map((entry) => {
    const rating = byId.get(entry.info.id) ?? { up: 0, down: 0 };
    return {
      id: entry.info.id,
      title: entry.info.title,
      tagline: entry.info.tagline,
      status: entry.status,
      statusLabel: GALLERY_STATUS_LABELS[entry.status],
      category: CATEGORY_LABELS[entry.info.category],
      family: entry.family,
      controls: entry.controls,
      seconds: Math.round(entry.info.durationMs / 1000),
      up: rating.up,
      down: rating.down,
      suggestRemoval: entry.status === 'rotation' && suggestsRemoval(rating),
    };
  });
}

/** Kurzer Text zu den Stimmen eines Spiels. */
export function votesText(row: Pick<GalleryRow, 'up' | 'down'>): string {
  const total = row.up + row.down;
  if (total === 0) return 'Noch keine Stimmen';
  return total === 1 ? '1 Stimme' : `${String(total)} Stimmen`;
}
