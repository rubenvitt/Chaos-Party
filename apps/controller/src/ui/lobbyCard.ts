/**
 * Darstellungshilfen für Figurenkarten (CHAOS-36), gemeinsam für iPhone-Knopf und
 * iPad-Zone. Rein, ohne DOM.
 */
import type { CSSProperties } from 'react';
import { PLAYER_SLOTS } from '@chaos-party/protocol';
import { MINE_LABEL, TAKEN_LABEL, type CharacterCard } from '../lobby/view.ts';
import { readableTextColor } from './color.ts';

/** Farbe des Besitzers einer vergebenen Figur (laut Server `takenBy` oder Nachbarzone). */
export function ownerStyle(card: CharacterCard): CSSProperties | undefined {
  if (card.ownerSlot === null) return undefined;
  const color = PLAYER_SLOTS[card.ownerSlot].color;
  return { '--owner': color, '--on-owner': readableTextColor(color) } as CSSProperties;
}

/** Kleiner Hinweis auf der Karte: eigene Wahl, Besitzer oder „vergeben“; frei = nichts. */
export function cardTag(card: CharacterCard): string | null {
  if (card.state === 'mine') return card.pending ? 'Wird gewählt …' : MINE_LABEL;
  if (card.state === 'taken') {
    return card.ownerSlot === null ? TAKEN_LABEL : `${PLAYER_SLOTS[card.ownerSlot].label} hat sie`;
  }
  return null;
}

/** Gemeinsame Attribute einer Figurenkarte (Test-Hooks, Zustand, Bildschirmleser). */
export function cardData(card: CharacterCard) {
  const tag = cardTag(card);
  return {
    'data-testid': `character-${card.id}`,
    'data-character': card.id,
    'data-state': card.state,
    'data-pending': card.pending ? 'true' : 'false',
    'data-owner': card.ownerSlot ?? '',
    'aria-label': tag === null ? card.name : `${card.name} – ${tag}`,
  } as const;
}
