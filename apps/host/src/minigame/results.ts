/**
 * Anzeigedaten der Minispiel-Ergebnisse (M3, CHAOS-26). Quelle ist immer der autoritative
 * Stand des Servers (`view.minigame.placements`), nie der lokale Runner. Rein, unit-getestet.
 */
import type { MinigameInfo, MinigameResult } from '@chaos-party/minigame-sdk';
import { PLAYER_SLOTS, type BoardView, type SlotNumber } from '@chaos-party/protocol';
import { playerName } from '../board/texts.ts';
import type { MinigameResultPayload } from '../net/hostConnection.ts';
import { characterName } from './plan.ts';

export interface ResultRow {
  readonly slot: SlotNumber;
  readonly place: number;
  readonly score: number;
  /** „7 Pumpstöße“ */
  readonly scoreText: string;
  readonly name: string;
  readonly character: string;
  readonly color: string;
  readonly symbol: string;
  /** Gewonnene Münzen laut Server-Ereignis oder `null`, wenn unbekannt (z. B. nach Neuladen). */
  readonly coins: number | null;
  /** Teilt sich den Platz mit mindestens einem anderen Spieler. */
  readonly tied: boolean;
}

export interface ResultsDisplay {
  readonly aborted: boolean;
  /** Überschrift: „Blau gewinnt!“, „Gleichstand: Blau und Orange!“, Abbruch-Hinweis. */
  readonly headline: string;
  readonly rows: readonly ResultRow[];
  readonly highlights: readonly string[];
}

export const ABORTED_TEXT = 'Minispiel abgebrochen – keine Münzen';

/** Punkte mit Einheit aus dem Steckbrief („7 Pumpstöße“). */
export function scoreText(score: number, unit: string): string {
  return `${String(score)} ${unit}`;
}

/** Namen als Aufzählung: „A“, „A und B“, „A, B und C“. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} und ${names[names.length - 1] ?? ''}`;
}

export function resultsDisplay(
  view: BoardView,
  info: Pick<MinigameInfo, 'scoreUnit'>,
  rewards: Readonly<Partial<Record<SlotNumber, number>>> | null,
): ResultsDisplay {
  const minigame = view.minigame;
  const placements = minigame?.placements ?? [];
  const aborted = minigame?.aborted === true || placements.length === 0;
  const rows: ResultRow[] = [...placements]
    .sort((a, b) => a.place - b.place || a.slot - b.slot)
    .map((entry) => ({
      slot: entry.slot,
      place: entry.place,
      score: entry.score,
      scoreText: scoreText(entry.score, info.scoreUnit),
      name: playerName(view, entry.slot),
      character: characterName(entry.slot),
      color: PLAYER_SLOTS[entry.slot].color,
      symbol: PLAYER_SLOTS[entry.slot].symbol,
      coins: rewards?.[entry.slot] ?? null,
      tied: placements.some((other) => other.slot !== entry.slot && other.place === entry.place),
    }));
  const winners = rows.filter((row) => row.place === 1).map((row) => row.name);
  let headline: string;
  if (aborted) headline = ABORTED_TEXT;
  else if (winners.length === 1) headline = `${winners[0] ?? ''} gewinnt!`;
  else if (winners.length === rows.length) headline = `Gleichstand: alle auf Platz 1!`;
  else headline = `Gleichstand: ${joinNames(winners)}!`;
  return {
    aborted,
    headline,
    rows: aborted ? [] : rows,
    highlights: aborted ? [] : [...(minigame?.highlights ?? [])],
  };
}

/** `minigame-result` für den Server aus dem Ergebnis des Runners (Höhepunkte bereinigt). */
export function resultPayload(result: MinigameResult, round: number): MinigameResultPayload {
  const highlights = sanitizeHighlights(result.highlights);
  return {
    minigameId: result.minigameId,
    round,
    placements: result.placements.map((entry) => ({
      slot: entry.slot,
      place: entry.place,
      score: entry.score,
    })),
    ...(highlights.length > 0 ? { highlights } : {}),
  };
}

/**
 * Höhepunkte protokollfest machen: getrimmt, ohne Steuerzeichen, 1–64 Zeichen, höchstens 4.
 * Der Server würde sonst die ganze `minigame-result`-Nachricht als ungültig verwerfen.
 */
export function sanitizeHighlights(lines: readonly string[] | undefined): string[] {
  const cleaned: string[] = [];
  for (const line of lines ?? []) {
    let visible = '';
    for (const char of line) if (!isControl(char.codePointAt(0) ?? 0)) visible += char;
    const text = visible.trim().slice(0, 64).trim();
    if (text.length > 0) cleaned.push(text);
    if (cleaned.length === 4) break;
  }
  return cleaned;
}

function isControl(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}
