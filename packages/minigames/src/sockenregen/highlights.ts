/**
 * Höhepunkte für die Ergebnisanzeige von Sockenregen (rein, testbar). 0–4 Zeilen à höchstens
 * 64 Zeichen, mit Spielernamen.
 */
import { MINIGAME_TEXT_LIMITS, type Slot } from '@chaos-party/minigame-sdk';
import type { Runner, SockenregenLogic } from './logic.ts';

export function sockenregenHighlights(
  logic: Pick<SockenregenLogic, 'runners' | 'lastCollector'>,
  names: ReadonlyMap<Slot, string>,
): string[] {
  const name = (runner: Runner) => names.get(runner.slot) ?? `Spieler ${String(runner.slot)}`;
  const lines: string[] = [];
  const top = uniqueMax(logic.runners, (runner) => runner.score);
  if (top && top.score > 0) {
    lines.push(`${name(top)} holt ${String(top.score)} Socken – Sockenkönig!`);
  }
  const flattened = uniqueMax(logic.runners, (runner) => runner.hits);
  if (flattened && flattened.hits >= 2) {
    lines.push(`${name(flattened)} wurde ${String(flattened.hits)}× vom Bügeleisen geplättet.`);
  }
  const golden = uniqueMax(logic.runners, (runner) => runner.golds);
  if (golden && golden.golds >= 1) {
    lines.push(
      golden.golds === 1
        ? `${name(golden)} schnappt sich eine Goldsocke.`
        : `${name(golden)} schnappt sich ${String(golden.golds)} Goldsocken.`,
    );
  }
  const diver = uniqueMax(logic.runners, (runner) => runner.dashes);
  if (diver && diver.dashes >= 6) {
    lines.push(`${name(diver)} hechtet ${String(diver.dashes)}× durch die Wäsche.`);
  }
  const last = logic.runners.find((runner) => runner.slot === logic.lastCollector);
  if (last) lines.push(`${name(last)} fängt die letzte Socke.`);
  return lines.slice(0, MINIGAME_TEXT_LIMITS.highlights).map(fit);
}

/** Der eine Spitzenreiter nach `value`, bei Gleichstand keiner. */
function uniqueMax(runners: readonly Runner[], value: (runner: Runner) => number): Runner | null {
  let best: Runner | null = null;
  let tie = false;
  for (const runner of runners) {
    if (!best || value(runner) > value(best)) {
      best = runner;
      tie = false;
    } else if (value(runner) === value(best)) {
      tie = true;
    }
  }
  return tie ? null : best;
}

function fit(line: string): string {
  const max = MINIGAME_TEXT_LIMITS.highlight;
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}
