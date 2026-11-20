/**
 * Höhepunkte für die Ergebnisanzeige von Kuckucks-Klatsche (rein, testbar). 0–4 Zeilen à
 * höchstens 64 Zeichen, mit Spielernamen.
 */
import { fitLine, uniqueMax } from '@chaos-party/minigame-kit';
import { MINIGAME_TEXT_LIMITS, type Slot } from '@chaos-party/minigame-sdk';
import type { KuckucksKlatscheLogic } from './logic.ts';

export function kuckucksKlatscheHighlights(
  logic: Pick<KuckucksKlatscheLogic, 'clappers' | 'thefts' | 'lastScorer'>,
  names: ReadonlyMap<Slot, string>,
): string[] {
  const name = (slot: Slot) => names.get(slot) ?? `Spieler ${String(slot)}`;
  const lines: string[] = [];
  const top = uniqueMax(logic.clappers, (clapper) => clapper.own);
  if (top && top.own >= 3) {
    lines.push(`${name(top.slot)} klatscht ${String(top.own)} eigene Kuckucke rechtzeitig.`);
  }
  const rivalry = biggestTheft(logic.thefts);
  if (rivalry && rivalry.count >= 2) {
    lines.push(
      `${name(rivalry.thief)} klaut ${name(rivalry.victim)} ${String(rivalry.count)} Kuckucke.`,
    );
  } else {
    const thief = uniqueMax(logic.clappers, (clapper) => clapper.steals);
    if (thief && thief.steals >= 1) {
      lines.push(
        thief.steals === 1
          ? `${name(thief.slot)} klaut einen Kuckuck nach dem Gong.`
          : `${name(thief.slot)} klaut ${String(thief.steals)} Kuckucke – Langfinger!`,
      );
    }
  }
  const fooled = uniqueMax(logic.clappers, (clapper) => clapper.fintes);
  if (fooled && fooled.fintes >= 2) {
    lines.push(`${name(fooled.slot)} fällt ${String(fooled.fintes)}× auf eine Finte rein.`);
  }
  const dreamer = uniqueMax(logic.clappers, (clapper) => clapper.escaped);
  if (dreamer && dreamer.escaped >= 2) {
    lines.push(`Bei ${name(dreamer.slot)} entwischen ${String(dreamer.escaped)} Kuckucke.`);
  }
  if (logic.lastScorer !== null && lines.length < MINIGAME_TEXT_LIMITS.highlights) {
    lines.push(`${name(logic.lastScorer)} klatscht den letzten Kuckuck.`);
  }
  return lines.slice(0, MINIGAME_TEXT_LIMITS.highlights).map((line) => fitLine(line));
}

function biggestTheft(
  thefts: ReadonlyMap<Slot, ReadonlyMap<Slot, number>>,
): { thief: Slot; victim: Slot; count: number } | null {
  let best: { thief: Slot; victim: Slot; count: number } | null = null;
  let tie = false;
  for (const [thief, victims] of thefts) {
    for (const [victim, count] of victims) {
      if (!best || count > best.count) {
        best = { thief, victim, count };
        tie = false;
      } else if (count === best.count) {
        tie = true;
      }
    }
  }
  return tie ? null : best;
}
