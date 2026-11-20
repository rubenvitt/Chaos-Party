/**
 * Minispiel-Galerie (CHAOS-87, README §5.4): Einträge mit Trichter-Status und Bedienung, dazu
 * die Schwelle, ab der die Galerie vorschlägt, ein Spiel aus der Rotation zu nehmen. Rein (kein
 * Babylon, kein DOM): Host, Server (Export) und Tests nutzen dasselbe.
 *
 * Die Entscheidung über den Rauswurf bleibt bei Ruben; die Galerie zeigt nur den Vorschlag.
 */
import type { MinigameControls, MinigameInfo } from '@chaos-party/minigame-sdk';
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
  /**
   * Familie aus dem Steckbrief, sobald er sie trägt (CHAOS-85 erweitert `MinigameInfo`), sonst
   * `null`.
   */
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

function familyOf(info: MinigameInfo): string | null {
  // Vorwärtskompatibel: CHAOS-85 ergänzt `family` im Steckbrief.
  const family: unknown = (info as { readonly family?: unknown }).family;
  return typeof family === 'string' && family !== '' ? family : null;
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
