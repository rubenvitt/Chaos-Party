/**
 * Vielfalts-Steckbrief (rein, README §5.5, ADR-020): Merkmale, in denen sich Minispiele
 * unterscheiden sollen. Ein neues Spiel muss sich vom ähnlichsten bestehenden in mindestens
 * `MIN_DIFFERENCES` Merkmalen unterscheiden; der gemeinsame Vertragstest (CHAOS-84) rechnet das
 * mit `mostSimilar` aus und nennt das ähnlichste Spiel.
 */
import type { MinigameControls } from '@chaos-party/minigame-sdk';

/** Was man hauptsächlich tut. */
export const KERNVERBEN = [
  'fangen',
  'sammeln',
  'ausweichen',
  'rempeln',
  'zielen',
  'werfen',
  'stapeln',
  'balancieren',
  'timen',
  'reagieren',
  'pumpen',
  'rennen',
  'merken',
  'zocken',
  'waehlen',
  'malen',
  'fahren',
  'schaetzen',
  'liefern',
  'verstecken',
] as const;
export type Kernverb = (typeof KERNVERBEN)[number];

/** Woran gewonnen wird. */
export const ZIELE = ['meiste', 'ueberleben', 'zuerst', 'genau', 'mehrheit', 'letzter'] as const;
export type Ziel = (typeof ZIELE)[number];

/** Form der Spielfläche (gleich den Arena-Vorlagen, dazu freie Formen). */
export const ARENA_FORMEN = [
  'rund',
  'eckig',
  'bahnen',
  'insel',
  'eigenbereiche',
  'strecke',
  'buehne',
  'frei',
] as const;
export type ArenaForm = (typeof ARENA_FORMEN)[number];

/** Blick auf das Spiel (gleich den Kamera-Vorlagen). */
export const KAMERAS = ['draufsicht', 'schraeg', 'seite', 'verfolger', 'fest'] as const;
export type Kamera = (typeof KAMERAS)[number];

/** Bedienung wie im Katalog (README §3). */
export const BEDIENUNGEN = ['A', 'AB', 'S', 'SA', 'SAB'] as const;
export type Bedienung = (typeof BEDIENUNGEN)[number];

/** Spielform wie im Katalog (README §3). */
export const SPIELFORMEN = ['FFA', '1v3', '2v2', 'Koop', 'Mikro'] as const;
export type Spielform = (typeof SPIELFORMEN)[number];

export const TEMPI = ['ruhig', 'wechselnd', 'hektisch'] as const;
export type Tempo = (typeof TEMPI)[number];

/** Orte der Arena-Vorlagen (Optik variiert bewusst, README §5.5). */
export const ORTE = [
  'garten',
  'kueche',
  'bad',
  'teich',
  'spielzimmer',
  'wald',
  'dachboden',
] as const;
export type Ort = (typeof ORTE)[number];

export interface Steckbrief {
  readonly kernverb: Kernverb;
  readonly ziel: Ziel;
  readonly arena: ArenaForm;
  readonly kamera: Kamera;
  readonly bedienung: Bedienung;
  readonly spielform: Spielform;
  readonly tempo: Tempo;
  /** Ort der Optik; zählt nicht zum Abstand (Optik allein macht kein neues Spiel). */
  readonly ort?: Ort;
}

/** Merkmale, die für den Mindestabstand zählen. */
export const STECKBRIEF_MERKMALE = [
  'kernverb',
  'ziel',
  'arena',
  'kamera',
  'bedienung',
  'spielform',
  'tempo',
] as const satisfies readonly (keyof Steckbrief)[];

/** Mindestabstand zum ähnlichsten Spiel (README §5.5). */
export const MIN_DIFFERENCES = 3;

/** Bedienungs-Kürzel aus den Controller-Elementen eines Steckbriefs (`MinigameInfo.controls`). */
export function bedienungOf(controls: MinigameControls): Bedienung | null {
  const code = `${controls.joystick ? 'S' : ''}${controls.a ? 'A' : ''}${controls.b ? 'B' : ''}`;
  return (BEDIENUNGEN as readonly string[]).includes(code) ? (code as Bedienung) : null;
}

/** Merkmale, in denen sich zwei Steckbriefe unterscheiden. */
export function differences(a: Steckbrief, b: Steckbrief): (keyof Steckbrief)[] {
  return STECKBRIEF_MERKMALE.filter((field) => a[field] !== b[field]);
}

/** Das ähnlichste andere Spiel (wenigste Unterschiede, bei Gleichstand das erste). */
export function mostSimilar(
  steckbrief: Steckbrief,
  others: readonly { readonly id: string; readonly steckbrief: Steckbrief }[],
): { id: string; differences: (keyof Steckbrief)[] } | null {
  let best: { id: string; differences: (keyof Steckbrief)[] } | null = null;
  for (const other of others) {
    const diff = differences(steckbrief, other.steckbrief);
    if (!best || diff.length < best.differences.length) best = { id: other.id, differences: diff };
  }
  return best;
}
