/**
 * Deutsche Anzeigetexte für Prompts. Das Protokoll prüft: Optionstext ≤ 32 Zeichen,
 * Titel/Detail ≤ 48 Zeichen, kein Leerraum am Rand, keine Steuerzeichen.
 */
import type { ItemKind, Slot } from '../types.ts';

export const MAX_OPTION_LABEL = 32;
export const MAX_TITLE = 48;
export const MAX_DETAIL = 48;

/** Steuerzeichen (C0, DEL, C1) und Bidi-Steuerzeichen, wie im Protokoll verboten. */
function isForbiddenCodePoint(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/**
 * Text protokollfest machen: verbotene Zeichen entfernen, Rand-Leerraum kürzen, auf
 * `max` Zeichen kürzen (mit „…“). Leerer Rest → `fallback`.
 */
export function displayText(text: string, max: number, fallback: string): string {
  let clean = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (!isForbiddenCodePoint(code)) clean += char;
  }
  clean = clean.trim();
  if (clean.length === 0) clean = fallback;
  if (clean.length > max) clean = `${clean.slice(0, max - 1).trimEnd()}…`;
  return clean;
}

export function coinsText(amount: number): string {
  return amount === 1 ? '1 Münze' : `${String(amount)} Münzen`;
}

export function playerLabel(name: string, slot: Slot): string {
  return displayText(name, MAX_OPTION_LABEL, `Spieler ${String(slot)}`);
}

export const ITEM_LABELS: Readonly<Record<ItemKind, string>> = {
  'double-dice': 'Doppelwürfel',
  'coin-steal': 'Münzklau',
  trap: 'Falle legen',
  shield: 'Schild',
};

export const TEXT = {
  rollTitle: 'Du bist dran!',
  rollTitleDouble: 'Zwei Würfel bereit!',
  rollOption: 'Würfeln',
  rollDetailDouble: 'Mit zwei Würfeln',
  targetTitle: 'Wen willst du beklauen?',
  cancelOption: 'Zurück',
  pathTitle: 'Welchen Weg nimmst du?',
  trophyTitle: 'Trophäe kaufen?',
  trophyBuy: 'Kaufen',
  trophySkip: 'Weiterlaufen',
  shieldOption: 'Schild!',
  shieldDetail: 'Klau komplett abwehren',
  braceOption: 'Festhalten!',
  braceDetail: 'Nur halber Verlust',
} as const;

/**
 * Zusatzzeile eines Items im Würfel-Prompt. `grows`: Der Wert kann bis zum Auslösen noch
 * steigen (wachsende Sabotage, CHAOS-120) – dann „ab“ (nur bei der Falle).
 */
export function itemDetail(item: ItemKind, amount: number, grows = false): string {
  switch (item) {
    case 'double-dice':
      return 'Zwei Würfel statt einem';
    case 'coin-steal':
      return `Bis zu ${coinsText(amount)} klauen`;
    case 'trap':
      return `Kostet andere ${grows ? 'ab ' : ''}${coinsText(amount)}`;
    case 'shield':
      return 'Schützt vor Münzklau';
  }
}

export function pathLabel(label: string | undefined, index: number): string {
  const fallback = `Weg ${String(index + 1)}`;
  return label === undefined ? fallback : displayText(label, MAX_OPTION_LABEL, fallback);
}

export function reactionTitle(attackerName: string, attacker: Slot): string {
  const name = displayText(attackerName, 24, `Spieler ${String(attacker)}`);
  return displayText(`${name} klaut dir Münzen!`, MAX_TITLE, 'Münzklau!');
}
