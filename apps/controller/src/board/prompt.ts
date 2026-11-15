/**
 * Offene Entscheidungen der Brettphase → Knöpfe (CHAOS-22). Rein, ohne DOM.
 *
 * Der Server bestimmt Titel, Optionen und Texte (`context.prompt`); der Controller
 * entscheidet nur, **wie** sie aussehen: Hauptknöpfe (groß) und Zusatzknöpfe (klein,
 * z. B. Items oder „Abbrechen“), Ton/Farbe und Symbol je Option. Unbekannte Arten
 * oder Optionen werden als einfache Knopfliste gezeigt – so kann der Server neue
 * Optionen anbieten, ohne dass der Controller angepasst werden muss.
 */
import type { PromptOptionInfo, SlotNumber } from '@chaos-party/protocol';
import type { SlotIntent } from '../net/client.ts';
import type { PendingChoice, SlotContext } from '../state/reducer.ts';
import type { ActivePrompt } from './countdown.ts';
import { ITEM_INFO, itemOfOption, type IconName } from './items.ts';

/** Darstellungsart eines Knopfs (CSS-Klasse `tone-<tone>`). */
export type ChoiceTone =
  'roll' | 'item' | 'path' | 'buy' | 'skip' | 'target' | 'cancel' | 'reaction' | 'plain';

export interface ChoiceView {
  /** Options-ID, wie sie in `choose { option }` zurückgeht. */
  readonly id: string;
  readonly label: string;
  readonly detail: string | null;
  readonly tone: ChoiceTone;
  readonly icon: IconName | null;
  /** Ziel-Spieler (Farbe/Symbol des Knopfs) oder `null`. */
  readonly slot: SlotNumber | null;
}

/** Aufbau der Bedienfläche für einen Prompt. */
export interface PromptView {
  /** Bekannte Art oder `other` (einfache Knopfliste). */
  readonly kind: 'roll' | 'target' | 'path' | 'trophy' | 'reaction' | 'other';
  /** Große Knöpfe. */
  readonly main: readonly ChoiceView[];
  /** Kleine Knöpfe darunter (Items, Abbrechen). */
  readonly extra: readonly ChoiceView[];
}

/** Was `describePrompt` von einem Prompt braucht (Art bewusst als `string`: zukunftssicher). */
export interface PromptShape {
  readonly kind: string;
  readonly options: readonly PromptOptionInfo[];
}

function view(
  option: PromptOptionInfo,
  tone: ChoiceTone,
  icon: IconName | null,
  withSlot = false,
): ChoiceView {
  return {
    id: option.id,
    label: option.label,
    detail: option.detail ?? null,
    tone,
    icon,
    slot: withSlot ? (option.slot ?? null) : null,
  };
}

function plain(option: PromptOptionInfo): ChoiceView {
  return view(option, option.slot === undefined ? 'plain' : 'target', null, true);
}

/** Item-Option (`item:<kind>`) mit Symbol, sonst `null`. */
function itemView(option: PromptOptionInfo): ChoiceView | null {
  const item = itemOfOption(option.id);
  return item === null ? null : view(option, 'item', ITEM_INFO[item].icon);
}

/**
 * Ordnet die Optionen eines Prompts Knöpfen zu.
 * - `roll`: Hauptknopf `roll` (Würfel), Items `item:*` und Unbekanntes als Zusatzknöpfe.
 * - `path`: alle Optionen als große Wegknöpfe (Label + Detail).
 * - `trophy`: `buy` (Trophäe, Preis im Detail) und `skip` als zwei große Knöpfe.
 * - `target`: Spielerknöpfe in der Farbe von `option.slot`, `cancel` als Zusatzknopf.
 * - `reaction`: alle Optionen als große, auffällige Knöpfe (`shield`, `brace`).
 * - Sonst: einfache Liste großer Knöpfe.
 */
export function describePrompt(prompt: PromptShape): PromptView {
  const { options } = prompt;
  switch (prompt.kind) {
    case 'roll': {
      const roll = options.filter((o) => o.id === 'roll');
      if (roll.length === 0) return { kind: 'roll', main: options.map(plain), extra: [] };
      return {
        kind: 'roll',
        main: roll.map((o) => view(o, 'roll', 'dice')),
        extra: options.filter((o) => o.id !== 'roll').map((o) => itemView(o) ?? plain(o)),
      };
    }
    case 'path':
      return { kind: 'path', main: options.map((o) => view(o, 'path', 'arrow')), extra: [] };
    case 'trophy':
      return {
        kind: 'trophy',
        main: options.map((o) => {
          if (o.id === 'buy') return view(o, 'buy', 'trophy');
          if (o.id === 'skip') return view(o, 'skip', 'skip');
          return plain(o);
        }),
        extra: [],
      };
    case 'target': {
      const isCancel = (o: PromptOptionInfo) => o.id === 'cancel';
      return {
        kind: 'target',
        main: options
          .filter((o) => !isCancel(o))
          .map((o) => (o.slot === undefined ? plain(o) : view(o, 'target', null, true))),
        extra: options.filter(isCancel).map((o) => view(o, 'cancel', 'cancel')),
      };
    }
    case 'reaction':
      return {
        kind: 'reaction',
        main: options.map((o) => {
          if (o.id === 'shield') return view(o, 'reaction', 'shield');
          if (o.id === 'brace') return view(o, 'reaction', 'brace');
          return view(o, 'reaction', null, true);
        }),
        extra: [],
      };
    default:
      return { kind: 'other', main: options.map(plain), extra: [] };
  }
}

/** Alle Knöpfe eines Prompts (Haupt- und Zusatzknöpfe) nach Options-ID. */
export function choiceById(promptView: PromptView, id: string): ChoiceView | undefined {
  return [...promptView.main, ...promptView.extra].find((choice) => choice.id === id);
}

/**
 * Eigener Prompt eines Slots: nur in Layout `board` und nur, wenn der Prompt diesem
 * Slot gilt. Ein Prompt eines anderen Slots wird nie als Knöpfe gezeigt.
 */
export function ownPrompt(
  context: SlotContext | undefined,
  slot: SlotNumber,
): ActivePrompt | undefined {
  if (context?.layout !== 'board') return undefined;
  const prompt = context.prompt;
  return prompt?.info.slot === slot ? prompt : undefined;
}

/** Wahl für diesen Prompt ist gesendet und noch unbeantwortet (Knöpfe gesperrt). */
export function isLocked(prompt: ActivePrompt, pending: PendingChoice | undefined): boolean {
  return pending?.promptId === prompt.info.id;
}

/**
 * Intent für eine Wahl – oder `null`, wenn sie nicht (mehr) passt: kein eigener Prompt,
 * Option gehört nicht zum Prompt oder für diesen Prompt wurde schon gewählt.
 */
export function chooseIntent(
  slot: SlotNumber,
  context: SlotContext | undefined,
  pending: PendingChoice | undefined,
  option: string,
  promptId?: number,
): SlotIntent | null {
  const prompt = ownPrompt(context, slot);
  if (!prompt) return null;
  if (promptId !== undefined && promptId !== prompt.info.id) return null;
  if (isLocked(prompt, pending)) return null;
  if (!prompt.info.options.some((o) => o.id === option)) return null;
  return { type: 'choose', slot, promptId: prompt.info.id, option };
}
