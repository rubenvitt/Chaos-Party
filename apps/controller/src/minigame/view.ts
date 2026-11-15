/**
 * Minispiele am Controller (M3, CHAOS-33): was iPhone und iPad-Zone in Intro, Spiel und
 * Ergebnis zeigen. Rein, ohne DOM – dieselben Funktionen nutzen `SlotController`,
 * `ZoneBoard` und die Zonen-Geometrie.
 *
 * Grundsatz wie in der Brettphase: Der Server entscheidet, was angeboten wird
 * (`actions`); der Steckbrief (`minigame.controls`) liefert nur die Beschriftung und kann
 * ein Element zusätzlich ausblenden (`null`). Fehlt `minigame` (Platzhalter-Minispiel,
 * M1-Arena), bleibt alles wie bisher.
 */
import type {
  Action,
  Button,
  ControllerMinigameInfo,
  MinigameControlsInfo,
} from '@chaos-party/protocol';
import type { SlotContext } from '../state/reducer.ts';

export type MinigameStage = ControllerMinigameInfo['stage'];

/** Schlusszeile im Intro. */
export const INTRO_READY = 'Gleich geht’s los!';
/** Hinweis unter dem Ergebnis: Danach geht es am PC weiter. */
export const RESULTS_LEAD = 'Gleich geht’s auf dem Brett weiter.';
export const ABORTED_HEADLINE = 'Minispiel abgebrochen';
export const ABORTED_LEAD = 'Keine Wertung – gleich geht’s auf dem Brett weiter.';
/** Joystick-Hinweis ohne Minispiel (M1-Arena). */
export const DEFAULT_STICK_HINT = 'Ziehen zum Laufen';

/** Minispiel des Kontexts in einer Stage, sonst `undefined`. */
export function minigameIn(
  context: SlotContext | undefined,
  stage?: MinigameStage,
): ControllerMinigameInfo | undefined {
  const minigame = context?.minigame;
  if (!minigame) return undefined;
  return stage === undefined || minigame.stage === stage ? minigame : undefined;
}

/** Eintrag der Bedienlegende im Intro (nur angebotene Elemente, feste Reihenfolge). */
export interface ControlLegendItem {
  readonly kind: 'stick' | Button;
  readonly label: string;
}

export function controlLegend(controls: MinigameControlsInfo): ControlLegendItem[] {
  const items: ControlLegendItem[] = [];
  if (controls.joystick !== null) items.push({ kind: 'stick', label: controls.joystick });
  if (controls.a !== null) items.push({ kind: 'a', label: controls.a });
  if (controls.b !== null) items.push({ kind: 'b', label: controls.b });
  return items;
}

const BUTTON_ACTION: Readonly<Record<Button, Action>> = { a: 'button-a', b: 'button-b' };

/** Ein Spielknopf mit Beschriftung (`null` = nur Buchstabe, wie in der M1-Arena). */
export interface PlayButton {
  readonly button: Button;
  readonly label: string | null;
}

/** Was das Spiel-Layout (`joystick-buttons`) anzeigt. */
export interface PlayView {
  /** Joystick angeboten; `stickHint` ist dann der Text darunter. */
  readonly stick: boolean;
  readonly stickHint: string;
  readonly buttons: readonly PlayButton[];
  /** Titel für den kleinen Kopf (nur im Minispiel). */
  readonly title: string | null;
}

/**
 * Spiel-Layout aus Kontext: Ein Element erscheint nur, wenn der Server es anbietet
 * (`actions`) **und** der Steckbrief es nicht ausblendet (`controls.* === null`).
 */
export function describePlay(context: Pick<SlotContext, 'actions' | 'minigame'>): PlayView {
  const minigame = context.minigame?.stage === 'play' ? context.minigame : undefined;
  const controls = minigame?.controls;
  const stick = context.actions.includes('move') && controls?.joystick !== null;
  const buttons = (['a', 'b'] as const).flatMap((button): PlayButton[] => {
    if (!context.actions.includes(BUTTON_ACTION[button])) return [];
    if (controls === undefined) return [{ button, label: null }];
    const label = controls[button];
    return label === null ? [] : [{ button, label }];
  });
  return {
    stick,
    stickHint:
      controls?.joystick === undefined || controls.joystick === null
        ? DEFAULT_STICK_HINT
        : `Ziehen: ${controls.joystick}`,
    buttons,
    title: minigame?.title ?? null,
  };
}

/** Aktionen, die das Spiel-Layout tatsächlich zeigt (für die iPad-Geometrie). */
export function offeredActions(context: Pick<SlotContext, 'actions' | 'minigame'>): Action[] {
  const view = describePlay(context);
  const shown = new Set<Action>(view.buttons.map((b) => BUTTON_ACTION[b.button]));
  if (view.stick) shown.add('move');
  return context.actions.filter(
    (action) =>
      !(action === 'move' || action === 'button-a' || action === 'button-b') || shown.has(action),
  );
}

/** Eigenes Ergebnis nach dem Minispiel. */
export type ResultView =
  | {
      readonly kind: 'placed';
      readonly place: number;
      /** „Platz 1!“ */
      readonly headline: string;
      /** Kurzer Zuruf je Platz. */
      readonly cheer: string;
      /** „42 Pumpstöße“ oder `null`, wenn der Server keine Punkte schickt. */
      readonly score: string | null;
    }
  | { readonly kind: 'aborted'; readonly headline: string; readonly lead: string };

const CHEERS: Readonly<Record<number, string>> = {
  1: 'Gewonnen!',
  2: 'Stark gespielt!',
  3: 'Gut gemacht!',
  4: 'Nächstes Mal!',
};

/**
 * Ergebnis aus dem Kontext. Fehlt `place`, wurde das Minispiel abgebrochen (keine Wertung).
 * Gleichstand: Der Server vergibt denselben Platz (1, 1, 3); beide sehen „Platz 1!“.
 */
export function describeResult(minigame: ControllerMinigameInfo): ResultView {
  if (minigame.place === undefined) {
    return { kind: 'aborted', headline: ABORTED_HEADLINE, lead: ABORTED_LEAD };
  }
  return {
    kind: 'placed',
    place: minigame.place,
    headline: `Platz ${String(minigame.place)}!`,
    cheer: CHEERS[minigame.place] ?? 'Gut gespielt!',
    score: minigame.score === undefined ? null : formatScore(minigame.score, minigame.scoreUnit),
  };
}

const NUMBER_FORMAT = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

/** „1.234 Pumpstöße“, „-3 Punkte“ (deutsche Tausenderpunkte). */
export function formatScore(score: number, unit: string): string {
  return `${NUMBER_FORMAT.format(score)} ${unit}`;
}
