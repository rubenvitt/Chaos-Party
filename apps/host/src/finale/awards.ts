/**
 * Bonus-Titel für den Siegerbildschirm (CHAOS-37) aus `BoardPlayer.stats` und `minigameWins`.
 * Nur Anzeige, ohne Einfluss auf die Wertung (ADR-015). Rein, unit-getestet.
 *
 * Je Titel gewinnt der höchste Wert; bei Gleichstand teilen sich alle den Titel. Titel mit
 * Wert 0 entfallen (niemand hat etwas geklaut → kein „Pechvogel“).
 */
import type { BoardPlayer, SlotNumber } from '@chaos-party/protocol';

export type AwardId = 'coin-magnet' | 'minigame-ace' | 'globetrotter' | 'trickster' | 'unlucky';

export interface Award {
  readonly id: AwardId;
  readonly title: string;
  /** „17 Münzen eingesammelt“ */
  readonly detail: string;
  readonly slots: readonly SlotNumber[];
  readonly value: number;
}

interface AwardRule {
  readonly id: AwardId;
  readonly title: string;
  readonly value: (player: BoardPlayer) => number;
  readonly detail: (value: number) => string;
}

const plural = (value: number, one: string, many: string) =>
  `${String(value)} ${value === 1 ? one : many}`;

const RULES: readonly AwardRule[] = [
  {
    id: 'coin-magnet',
    title: 'Münzmagnet',
    value: (p) => p.stats.coinsEarned,
    detail: (v) => `${plural(v, 'Münze', 'Münzen')} eingesammelt`,
  },
  {
    id: 'minigame-ace',
    title: 'Minispiel-Ass',
    value: (p) => p.minigameWins,
    detail: (v) => `${plural(v, 'Minispiel', 'Minispiele')} gewonnen`,
  },
  {
    id: 'globetrotter',
    title: 'Weltenbummler',
    value: (p) => p.stats.spacesMoved,
    detail: (v) => `${plural(v, 'Feld', 'Felder')} gelaufen`,
  },
  {
    id: 'trickster',
    title: 'Trickkiste',
    value: (p) => p.stats.itemsUsed,
    detail: (v) => `${plural(v, 'Item', 'Items')} eingesetzt`,
  },
  {
    id: 'unlucky',
    title: 'Pechvogel',
    value: (p) => p.stats.coinsLost,
    detail: (v) => `${plural(v, 'Münze', 'Münzen')} verloren`,
  },
];

export function bonusAwards(players: readonly BoardPlayer[]): Award[] {
  const awards: Award[] = [];
  for (const rule of RULES) {
    const best = Math.max(0, ...players.map(rule.value));
    if (best <= 0) continue;
    const slots = players
      .filter((player) => rule.value(player) === best)
      .map((player) => player.slot)
      .sort((a, b) => a - b);
    awards.push({ id: rule.id, title: rule.title, detail: rule.detail(best), slots, value: best });
  }
  return awards;
}
