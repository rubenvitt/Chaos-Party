/**
 * Höhepunkte für die Ergebnisanzeige von Sockenregen (rein, testbar). 0–4 Zeilen à höchstens
 * 64 Zeichen, mit Spielernamen. Vorlagen und Textgrenzen aus dem Baukasten (ADR-020).
 */
import { buildHighlights, type HighlightRule } from '@chaos-party/minigame-kit';
import type { Slot } from '@chaos-party/minigame-sdk';
import type { Runner, SockenregenLogic } from './logic.ts';

const RULES: readonly HighlightRule[] = [
  { kind: 'top', stat: 'score', text: (name, n) => `${name} holt ${n} Socken – Sockenkönig!` },
  {
    kind: 'top',
    stat: 'hits',
    min: 2,
    text: (name, n) => `${name} wurde ${n}× vom Bügeleisen geplättet.`,
  },
  {
    kind: 'top',
    stat: 'golds',
    text: (name, n) =>
      n === 1 ? `${name} schnappt sich eine Goldsocke.` : `${name} schnappt sich ${n} Goldsocken.`,
  },
  {
    kind: 'top',
    stat: 'dashes',
    min: 6,
    text: (name, n) => `${name} hechtet ${n}× durch die Wäsche.`,
  },
  { kind: 'last', stat: 'collect', text: (name) => `${name} fängt die letzte Socke.` },
];

const STATS = ['score', 'hits', 'golds', 'dashes'] as const;

export function sockenregenHighlights(
  logic: Pick<SockenregenLogic, 'runners' | 'lastCollector'>,
  names: ReadonlyMap<Slot, string>,
): string[] {
  const bySlot = new Map<Slot, Runner>(logic.runners.map((runner) => [runner.slot, runner]));
  return buildHighlights(RULES, {
    slots: logic.runners.map((runner) => runner.slot),
    names,
    value: (slot, stat) => {
      const runner = bySlot.get(slot);
      return runner && (STATS as readonly string[]).includes(stat)
        ? runner[stat as (typeof STATS)[number]]
        : 0;
    },
    last: (stat) => (stat === 'collect' ? logic.lastCollector : null),
  });
}
