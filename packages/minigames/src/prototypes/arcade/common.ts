/**
 * Gemeinsame Bausteine der Arcade-Prototypen (EXP-005, CHAOS-29/30): Bot-Profile,
 * Zufallsverteilungen, Spielprotokoll und Kennzahlen.
 *
 * Die Prototypen sind **reine Logik ohne Babylon**: grobe Modelle der Spielideen, gerade
 * genau genug, um Konzepte mit Bots zu vergleichen. Zahlen daraus sind Näherungen, kein
 * Beweis für Spaß.
 */
import {
  BOT_PROFILES,
  LeadTracker,
  gaussian,
  lineup,
  matchMetrics,
  reactionSample,
  uniqueLeaderIndex,
  type BotProfile,
  type GameRecord,
  type MatchMetrics,
  type PlayerCount,
} from '@chaos-party/minigame-kit';

// Bot-Profile, Protokoll und Kennzahlen liegen seit CHAOS-83 im Baukasten (ADR-021); hier unter
// den alten Namen weitergereicht, damit die Experimente unverändert laufen.
export { BOT_PROFILES, LeadTracker, gaussian, lineup, reactionSample };
export type { BotProfile, GameRecord, PlayerCount };
export type ConceptMetrics = MatchMetrics;
export const metrics = matchMetrics;
export const uniqueLeader = uniqueLeaderIndex;

export interface Table {
  readonly title: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export function toMarkdown(table: Table): string {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  return [
    `**${table.title}**`,
    '',
    line(table.headers),
    line(table.headers.map(() => '---')),
    ...table.rows.map(line),
  ].join('\n');
}

/** Deutsche Zahl mit fester Nachkommazahl. */
export function num(value: number, digits = 1): string {
  return value.toFixed(digits).replace('.', ',');
}

export function pct(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/** `count` aufeinanderfolgende Seeds ab `first`. */
export function seedRange(count: number, first = 1): number[] {
  return Array.from({ length: count }, (_, index) => first + index);
}

/** Abstand zwischen zwei Punkten in der Ebene. */
export function distance(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
