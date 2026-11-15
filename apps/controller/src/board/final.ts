/**
 * Pause und Endstand am Controller (M4, CHAOS-36/37). Rein, ohne DOM.
 *
 * Der Server liefert im Endstand (`game-results`) Platz, Gleichstand (`tied`), vorzeitiges
 * Ende (`endedEarly`) sowie Münzen, Trophäen und Minispiel-Siege im eigenen Stand. Die
 * Revanche startet der PC; der Controller zeigt nur, wo es weitergeht.
 */
import type { CharacterId, ControllerBoardInfo } from '@chaos-party/protocol';

export const PAUSE_TITLE = 'Pause';
export const PAUSE_LEAD = 'Der PC hat angehalten.';
export const PAUSE_HINT = 'Gleich geht’s weiter – deine Eingaben zählen gerade nicht.';

export const REMATCH_HINT = 'Nochmal? Am PC „Nochmal spielen“ wählen.';
export const ENDED_EARLY_NOTE = 'Die Partie wurde am PC vorzeitig beendet.';

export interface FinalView {
  /** Platz im Endstand oder `null`, solange der Server keinen schickt. */
  readonly place: number | null;
  readonly tied: boolean;
  /** „Platz 2“ bzw. „Geteilter Platz 2“; `null` ohne Platz. */
  readonly placeLabel: string | null;
  readonly headline: string;
  readonly endedEarly: boolean;
  readonly character: CharacterId;
  readonly trophies: number;
  readonly coins: number;
  readonly minigameWins: number;
}

/** Text zum Endplatz (mit Gleichstand). */
export function finalHeadline(place: number | null, tied: boolean): string {
  if (place === null) return 'Spiel vorbei!';
  if (place === 1) return tied ? 'Gemeinsam gewonnen!' : 'Du hast gewonnen!';
  return 'Gut gespielt!';
}

export function placeLabel(place: number | null, tied: boolean): string | null {
  if (place === null) return null;
  return tied ? `Geteilter Platz ${String(place)}` : `Platz ${String(place)}`;
}

export function describeFinal(board: ControllerBoardInfo): FinalView {
  const place = board.place ?? null;
  const tied = place !== null && board.tied === true;
  return {
    place,
    tied,
    placeLabel: placeLabel(place, tied),
    headline: finalHeadline(place, tied),
    endedEarly: board.endedEarly === true,
    character: board.character,
    trophies: board.trophies,
    coins: board.coins,
    minigameWins: board.minigameWins,
  };
}

/** „1 Trophäe“, „3 Münzen“, „2 Minispiele gewonnen“ – für Bildschirmleser und Tests. */
export function countLabel(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}
