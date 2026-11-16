/**
 * Natur-Look für Minispiele (CHAOS-62): die gemeinsame Bühnen-Kulisse aus
 * `../nature/stageLook.ts` mit den Werten der Minispiele. Das Minispiel nennt in `prepare` seine
 * Spielfläche (`backdrop`), nach `prepare` (Kamera steht) setzt `finish` Licht, Himmel und
 * Nachbearbeitung der Stimmung.
 */
import type { Scene } from '@babylonjs/core/scene.js';
import type { LookSettings } from '../nature/settings.ts';
import { createStageLook, STAGE_GRASS, type StageLook } from '../nature/stageLook.ts';

/**
 * Höchstzahl fester Schritte je Bild bei Software-Rendering (4 s Spielzeit): Ein Bild dauert
 * dort 0,5–3 s (je nach Last); so bleibt die Minispiel-Uhr bei der echten Zeit und das
 * Ergebnis kommt rechtzeitig beim Server an (Frist: Spielzeit + 15 s).
 */
export const SOFTWARE_MAX_STEPS = 240;

/** Halme bei Grafikstufe `hoch` (kleinere Insel als das Brett). */
export const MINIGAME_GRASS = STAGE_GRASS;

export type HostMinigameLook = StageLook;

export function createMinigameLook(scene: Scene, settings: LookSettings): HostMinigameLook {
  return createStageLook(scene, settings, { grass: MINIGAME_GRASS });
}
