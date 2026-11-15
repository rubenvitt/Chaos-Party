/**
 * Welche Stimmung und welche Grafikstufe eine Natur-Szene bekommt (CHAOS-62).
 *
 * - Stimmung: zunächst fest je Brett (`moodForBoard`); der Lichtverlauf je Runde folgt in
 *   CHAOS-63. `?stimmung=<id>` überschreibt sie (Ansehen, Lesbarkeit prüfen, Screenshots).
 * - Grafikstufe: `?qualitaet=hoch|mittel|niedrig|minimal` fest; ohne Angabe `hoch` mit
 *   Automatik (stuft bei niedriger Bildrate ab). Im Testmodus immer `minimal`, bei
 *   Software-Rendering ohne Angabe ebenfalls (`isSoftwareRenderer`).
 */
import {
  LIGHT_MOOD_IDS,
  LIGHT_MOODS,
  moodForBoard,
  type LightMood,
  type LightMoodId,
} from '../lighting/moods.ts';
import { isSoftwareRenderer, parseQualityLevel, type QualityLevel } from './quality.ts';

export interface LookSettings {
  readonly mood: LightMood;
  readonly quality: QualityLevel;
  /** Automatisch abstufen, wenn die Bildrate nicht reicht. */
  readonly automatic: boolean;
  /**
   * Der Browser rendert per Software (kein Testmodus): Bilder dauern dort Zehntelsekunden.
   * Brett-Regie und Minispiel-Uhr machen dann größere Zeitschritte, damit das Spiel in
   * Echtzeit bleibt (weniger Bilder, gleiche Spielzeit).
   */
  readonly software: boolean;
}

export function parseLookSettings(
  search: string,
  context: {
    readonly testMode: boolean;
    readonly boardId: string;
    /** WebGL-Renderer (`engine.getGlInfo().renderer`), erkennt Software-Rendering. */
    readonly renderer?: string;
  },
): LookSettings {
  const params = new URLSearchParams(search);
  const moodParam = params.get('stimmung') ?? '';
  const moodId: LightMoodId = (LIGHT_MOOD_IDS as readonly string[]).includes(moodParam)
    ? (moodParam as LightMoodId)
    : moodForBoard(context.boardId);
  const mood = LIGHT_MOODS[moodId];
  if (context.testMode) return { mood, quality: 'minimal', automatic: false, software: false };
  const software = isSoftwareRenderer(context.renderer ?? '');
  const fixed = parseQualityLevel(params.get('qualitaet'));
  if (fixed) return { mood, quality: fixed, automatic: false, software };
  if (software) return { mood, quality: 'minimal', automatic: false, software };
  return { mood, quality: 'hoch', automatic: true, software };
}

/** Einstellungen aus der aktuellen Seiten-URL. */
export function currentLookSettings(
  testMode: boolean,
  boardId: string,
  renderer: string,
): LookSettings {
  return parseLookSettings(typeof location === 'undefined' ? '' : location.search, {
    testMode,
    boardId,
    renderer,
  });
}

/**
 * Software-Rendering: halbe Auflösung (ein Viertel der Pixel). Spielbar ist es dort ohnehin
 * nicht; so bleibt mehr Rechenzeit für Regie, Minispiel-Uhr und Controller-Seiten.
 */
export function applyRenderScale(
  engine: { setHardwareScalingLevel(level: number): void },
  settings: LookSettings,
): void {
  if (settings.software && settings.quality === 'minimal') engine.setHardwareScalingLevel(2);
}
