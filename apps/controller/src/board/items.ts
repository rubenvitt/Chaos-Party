/**
 * Items der Brettphase: kurze deutsche Namen und Symbole für den Controller (CHAOS-22).
 * Rein, ohne DOM. Unbekannte Items (neue Server-Version) bekommen ein neutrales Symbol.
 */
import { ITEM_KINDS, type ItemKindName } from '@chaos-party/protocol';

/** Symbole, die `ui/icons.tsx` zeichnen kann. */
export type IconName =
  | 'coin'
  | 'trophy'
  | 'dice'
  | 'double-dice'
  | 'coin-steal'
  | 'trap'
  | 'shield'
  | 'brace'
  | 'arrow'
  | 'skip'
  | 'cancel'
  | 'star';

export interface ItemInfo {
  /** Kurzer Anzeigename (passt auf einen kleinen Chip). */
  readonly name: string;
  readonly icon: IconName;
}

export const ITEM_INFO: Readonly<Record<ItemKindName, ItemInfo>> = {
  'double-dice': { name: 'Doppelwürfel', icon: 'double-dice' },
  'coin-steal': { name: 'Münzklau', icon: 'coin-steal' },
  trap: { name: 'Falle', icon: 'trap' },
  shield: { name: 'Schild', icon: 'shield' },
};

export function isItemKind(value: string): value is ItemKindName {
  return (ITEM_KINDS as readonly string[]).includes(value);
}

/** Item hinter einer Prompt-Option `item:<kind>` (sonst `null`). */
export function itemOfOption(optionId: string): ItemKindName | null {
  if (!optionId.startsWith('item:')) return null;
  const kind = optionId.slice('item:'.length);
  return isItemKind(kind) ? kind : null;
}
