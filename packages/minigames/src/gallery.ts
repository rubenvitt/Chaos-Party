/**
 * Minispiel-Galerie (CHAOS-87, README §5.4): Einträge mit Trichter-Status und Bedienung, dazu
 * die Schwelle, ab der die Galerie vorschlägt, ein Spiel aus der Rotation zu nehmen. Rein (kein
 * Babylon, kein DOM): Host, Server (Export) und Tests nutzen dasselbe.
 *
 * Die Entscheidung über den Rauswurf bleibt bei Ruben; die Galerie zeigt nur den Vorschlag.
 */
import type { MinigameControls, MinigameFamily, MinigameInfo } from '@chaos-party/minigame-sdk';
import { MINIGAME_INFOS, ROTATION } from './catalog.ts';

/**
 * Trichter-Status, soweit ihn der Code kennt (README §5.4): `rotation` = kommt in echten Partien
 * vor, `spielbar` = hat eine Szene und ist über die Galerie startbar, aber (noch) nicht in der
 * Rotation. Skizzen und Prototypen ohne Szene stehen nur im Katalog-Dokument.
 */
export type GalleryStatus = 'rotation' | 'spielbar';

export const GALLERY_STATUS_LABELS: Readonly<Record<GalleryStatus, string>> = {
  rotation: 'Rotation',
  spielbar: 'Spielbar',
};

export interface GalleryEntry {
  readonly info: MinigameInfo;
  readonly status: GalleryStatus;
  /** Familie aus dem Steckbrief (CHAOS-85) als Anzeigename, `null` ohne Angabe. */
  readonly family: string | null;
  /** Bedienung in Worten, z. B. „Stick: Laufen · A: Springen“. */
  readonly controls: string;
}

/** Bedienung eines Steckbriefs als kurze Zeile. */
export function describeControls(controls: MinigameControls): string {
  const parts: string[] = [];
  if (controls.joystick !== null) parts.push(`Stick: ${controls.joystick}`);
  if (controls.a !== null) parts.push(`A: ${controls.a}`);
  if (controls.b !== null) parts.push(`B: ${controls.b}`);
  return parts.length > 0 ? parts.join(' · ') : 'ohne Eingabe';
}

/** Anzeigenamen der 20 Familien (README §4, Familien-Wellen CHAOS-94 … CHAOS-113). */
export const FAMILY_LABELS: Readonly<Record<MinigameFamily, string>> = {
  'fangen-sammeln': 'Fangen & Sammeln',
  'ausweichen-ueberleben': 'Ausweichen & Überleben',
  'rempeln-schubsen': 'Rempeln & Runterschubsen',
  'timing-rhythmus': 'Timing & Rhythmus',
  'reflex-reaktion': 'Reflex & Reaktion',
  'pumpen-dosieren': 'Pumpen, Kurbeln, Dosieren',
  'zielen-werfen': 'Zielen & Werfen',
  'balance-stapeln': 'Balance & Stapeln',
  'rennen-parcours': 'Rennen & Parcours',
  'gedaechtnis-muster': 'Gedächtnis & Muster',
  zocken: 'Zocken & Push-your-luck',
  'bluff-geheime-wahl': 'Bluff & geheime Wahl',
  'revier-malen': 'Revier & Malen',
  'fahrzeuge-schwung': 'Fahrzeuge & Schwung',
  'schaetzen-wahrnehmung': 'Schätzen & Wahrnehmung',
  'hektik-kueche': 'Hektik-Küche & Laden',
  'einer-gegen-alle': 'Einer gegen alle',
  'zwei-gegen-zwei': 'Zwei gegen zwei',
  'koop-chaos': 'Gemeinsam gegen das Chaos',
  mikro: 'Mikro-Spiele',
};

function familyOf(info: MinigameInfo): string | null {
  return info.family === undefined ? null : FAMILY_LABELS[info.family];
}

/** Alle startbaren Minispiele: zuerst die Rotation, dann die übrigen, je nach Titel. */
export function galleryEntries(infos: readonly MinigameInfo[] = MINIGAME_INFOS): GalleryEntry[] {
  const inRotation = new Set(ROTATION);
  return infos
    .map((info): GalleryEntry => ({
      info,
      status: inRotation.has(info.id) ? 'rotation' : 'spielbar',
      family: familyOf(info),
      controls: describeControls(info.controls),
    }))
    .sort(
      (a, b) =>
        Number(b.status === 'rotation') - Number(a.status === 'rotation') ||
        a.info.title.localeCompare(b.info.title, 'de'),
    );
}

/** Stimmen eines Minispiels. */
export interface RatingCount {
  readonly up: number;
  readonly down: number;
}

/**
 * Rauswurf-Vorschlag erst ab so vielen Stimmen: Eine Partie zu viert liefert bis zu vier
 * Stimmen; ein einzelner schlechter Abend soll ein Spiel nicht kippen.
 */
export const REMOVAL_MIN_VOTES = 6;
/** … und wenn mindestens dieser Anteil Daumen runter ist („viele Daumen runter“, §5.4). */
export const REMOVAL_DOWN_SHARE = 0.6;

/** Schlägt die Galerie vor, das Spiel aus der Rotation zu nehmen? */
export function suggestsRemoval(count: RatingCount): boolean {
  const total = count.up + count.down;
  return total >= REMOVAL_MIN_VOTES && count.down / total >= REMOVAL_DOWN_SHARE;
}
