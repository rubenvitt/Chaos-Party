/**
 * Feste Spielerplätze (Slots) 1–4 mit Farbe, Bezeichnung und Symbol.
 *
 * Die Farben stammen aus der Okabe-Ito-Palette und bleiben auch bei
 * Rot-Grün-Schwäche unterscheidbar; das Symbol ist eine zweite, farbunabhängige
 * Kennung für Controller-Zonen und Host-Anzeigen.
 */

export const MIN_SLOT = 1;
export const MAX_SLOT = 4;

/** Höchstzahl gleichzeitiger Spielerplätze einer Session (VISION: 2–4 Personen). */
export const MAX_PLAYERS = MAX_SLOT;

export type SlotNumber = 1 | 2 | 3 | 4;

export const SLOT_NUMBERS: readonly SlotNumber[] = [1, 2, 3, 4];

export interface PlayerSlotStyle {
  /** Hex-Farbe `#RRGGBB`. */
  readonly color: string;
  /** Standardbezeichnung (Farbname), solange kein Name gewählt wurde. */
  readonly label: string;
  /** Farbunabhängige Kennung (Form). */
  readonly symbol: string;
}

export const PLAYER_SLOTS: Readonly<Record<SlotNumber, PlayerSlotStyle>> = {
  1: { color: '#0072B2', label: 'Blau', symbol: '●' },
  2: { color: '#E69F00', label: 'Orange', symbol: '▲' },
  3: { color: '#009E73', label: 'Grün', symbol: '■' },
  4: { color: '#CC79A7', label: 'Rosa', symbol: '★' },
};
