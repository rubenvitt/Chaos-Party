/**
 * Höhepunkte aus Ereignissen per Vorlage (rein). Ein Spiel zählt mit `EventTally`, was
 * passiert („geplättet“, „Goldsocke“, „Hechtsprung“), und beschreibt seine Höhepunkte als
 * Vorlagen: „wer hat am meisten X (allein, mindestens n)“ → Satz. `buildHighlights` wählt die
 * zutreffenden Zeilen, hält die Textgrenzen (≤ 4 Zeilen, ≤ 64 Zeichen) ein und setzt Namen ein.
 *
 * Die Sätze schreibt jedes Spiel selbst – die Vorlage legt nur fest, wann eine Zeile gilt.
 */
import { MINIGAME_TEXT_LIMITS, type Slot } from '@chaos-party/minigame-sdk';
import { uniqueMax } from './scoreboard.ts';

/** Kürzt eine Zeile auf die Textgrenze (mit „…“). */
export function fitLine(line: string, max: number = MINIGAME_TEXT_LIMITS.highlight): string {
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

/** Name eines Slots für Texte (Rückfall „Spieler n“). */
export function nameOf(names: ReadonlyMap<Slot, string>, slot: Slot): string {
  return names.get(slot) ?? `Spieler ${String(slot)}`;
}

/** Zählt Ereignisse je Slot und Art. */
export class EventTally<K extends string> {
  private readonly counts = new Map<string, number>();
  /** Zuletzt betroffener Slot je Art („fängt die letzte Socke“). */
  private readonly lastSlot = new Map<K, Slot>();

  count(slot: Slot, kind: K, amount = 1): void {
    const key = `${String(slot)}:${kind}`;
    this.counts.set(key, this.get(slot, kind) + amount);
    this.lastSlot.set(kind, slot);
  }

  get(slot: Slot, kind: K): number {
    return this.counts.get(`${String(slot)}:${kind}`) ?? 0;
  }

  last(kind: K): Slot | null {
    return this.lastSlot.get(kind) ?? null;
  }
}

export interface HighlightFacts {
  readonly slots: readonly Slot[];
  readonly names: ReadonlyMap<Slot, string>;
  /** Zahl je Slot und Merkmal (z. B. aus `EventTally.get` oder dem Spielzustand). */
  value(slot: Slot, stat: string): number;
  /** Letzter Slot zu einem Merkmal (z. B. `EventTally.last`). */
  last?(stat: string): Slot | null;
}

/** Eine Vorlage: Wann gilt die Zeile, und wie lautet sie. */
export type HighlightRule =
  | {
      /** Der eine Spitzenreiter bei `stat` mit mindestens `min` (Standard 1). */
      readonly kind: 'top';
      readonly stat: string;
      readonly min?: number;
      readonly text: (name: string, value: number) => string;
    }
  | {
      /** Wer `stat` zuletzt ausgelöst hat. */
      readonly kind: 'last';
      readonly stat: string;
      readonly text: (name: string) => string;
    }
  | {
      /** Eine eigene Zeile oder `null` (Spielverlauf, Gesamtsummen). */
      readonly kind: 'custom';
      readonly line: (facts: HighlightFacts) => string | null;
    };

/** Zeilen aus Vorlagen in Reihenfolge der Regeln, höchstens 4, gekürzt. */
export function buildHighlights(rules: readonly HighlightRule[], facts: HighlightFacts): string[] {
  const lines: string[] = [];
  for (const rule of rules) {
    const line = applyRule(rule, facts);
    if (line) lines.push(line);
  }
  return lines.slice(0, MINIGAME_TEXT_LIMITS.highlights).map((line) => fitLine(line));
}

function applyRule(rule: HighlightRule, facts: HighlightFacts): string | null {
  switch (rule.kind) {
    case 'top': {
      const top = uniqueMax(facts.slots, (slot) => facts.value(slot, rule.stat));
      if (top === null) return null;
      const value = facts.value(top, rule.stat);
      return value >= (rule.min ?? 1) ? rule.text(nameOf(facts.names, top), value) : null;
    }
    case 'last': {
      const slot = facts.last?.(rule.stat) ?? null;
      return slot === null || !facts.slots.includes(slot)
        ? null
        : rule.text(nameOf(facts.names, slot));
    }
    case 'custom':
      return rule.line(facts);
  }
}

/** Fakten aus einer Zählung (`EventTally`) und optional weiteren Werten (z. B. Punkte). */
export function tallyFacts<K extends string>(
  slots: readonly Slot[],
  names: ReadonlyMap<Slot, string>,
  tally: EventTally<K>,
  extra: Readonly<Record<string, (slot: Slot) => number>> = {},
): HighlightFacts {
  return {
    slots,
    names,
    value: (slot, stat) => extra[stat]?.(slot) ?? tally.get(slot, stat as K),
    last: (stat) => tally.last(stat as K),
  };
}
