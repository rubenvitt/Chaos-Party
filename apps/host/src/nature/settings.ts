/**
 * Welche Stimmung und welche Grafikstufe eine Natur-Szene bekommt (CHAOS-62).
 *
 * - Stimmung: nach Runde (`moodForRound`, Lichtverlauf CHAOS-63), ohne bekannte Runde fest je
 *   Brett (`moodForBoard`). Lobby und Siegerehrung haben eine feste Stimmung (`SCENE_MOODS`,
 *   CHAOS-77). `?stimmung=<id>` setzt sie fest, auch über Rundenwechsel hinweg (Ansehen,
 *   Lesbarkeit prüfen, Screenshots).
 * - Grafikstufe: `?qualitaet=hoch|mittel|niedrig|minimal` fest; ohne Angabe `hoch` (bzw. die
 *   in dieser Sitzung schon erreichte Stufe) mit Automatik (stuft bei niedriger Bildrate ab).
 *   Im Testmodus immer `minimal`, bei Software-Rendering ohne Angabe ebenfalls
 *   (`isSoftwareRenderer`).
 */
import {
  LIGHT_MOOD_IDS,
  LIGHT_MOODS,
  moodForBoard,
  moodForRound,
  SCENE_MOODS,
  type LightMood,
  type LightMoodId,
} from '../lighting/moods.ts';
import {
  isSoftwareRenderer,
  parseQualityLevel,
  QUALITY,
  renderScalingLevel,
  sessionQuality,
  type QualityLevel,
} from './quality.ts';

export interface LookSettings {
  readonly mood: LightMood;
  /** Stimmung per `?stimmung=` festgelegt: kein Lichtverlauf je Runde. */
  readonly fixedMood: boolean;
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

/** Szenen außerhalb der Partie mit fester Stimmung (`SCENE_MOODS`). */
export type FixedMoodScene = keyof typeof SCENE_MOODS;

/**
 * Stimmung für eine Szene: `?stimmung=` fest, sonst die feste Stimmung der Szene (Lobby,
 * Siegerehrung), sonst nach Runde, ohne Runde fest je Brett. Auch der HUD liest sie (helle
 * Schrift in Dämmerung und Nacht).
 */
export function lookMood(
  search: string,
  boardId: string,
  round: { readonly round: number; readonly rounds: number } | null | undefined,
  scene?: FixedMoodScene,
): { readonly mood: LightMood; readonly fixed: boolean } {
  const moodParam = new URLSearchParams(search).get('stimmung') ?? '';
  if ((LIGHT_MOOD_IDS as readonly string[]).includes(moodParam)) {
    return { mood: LIGHT_MOODS[moodParam as LightMoodId], fixed: true };
  }
  if (scene) return { mood: LIGHT_MOODS[SCENE_MOODS[scene]], fixed: true };
  const id =
    round && round.rounds > 0
      ? moodForRound(round.round, round.rounds, boardId)
      : moodForBoard(boardId);
  return { mood: LIGHT_MOODS[id], fixed: false };
}

export function parseLookSettings(
  search: string,
  context: {
    readonly testMode: boolean;
    readonly boardId: string;
    /** Runde (1-basiert) und Rundenzahl der Partie, falls bekannt (Lichtverlauf). */
    readonly round?: { readonly round: number; readonly rounds: number } | null;
    /** WebGL-Renderer (`engine.getGlInfo().renderer`), erkennt Software-Rendering. */
    readonly renderer?: string;
    /** Von der Automatik in dieser Sitzung erreichte Stufe (Startwert statt `hoch`). */
    readonly sessionQuality?: QualityLevel | null;
    /** Lobby oder Siegerehrung: feste Stimmung aus `SCENE_MOODS` statt Runde bzw. Brett. */
    readonly scene?: FixedMoodScene;
  },
): LookSettings {
  const params = new URLSearchParams(search);
  const chosen = lookMood(search, context.boardId, context.round, context.scene);
  const base = { mood: chosen.mood, fixedMood: chosen.fixed };
  if (context.testMode) return { ...base, quality: 'minimal', automatic: false, software: false };
  const software = isSoftwareRenderer(context.renderer ?? '');
  const fixed = parseQualityLevel(params.get('qualitaet'));
  if (fixed) return { ...base, quality: fixed, automatic: false, software };
  if (software) return { ...base, quality: 'minimal', automatic: false, software };
  return { ...base, quality: context.sessionQuality ?? 'hoch', automatic: true, software };
}

/** Einstellungen aus der aktuellen Seiten-URL. */
export function currentLookSettings(
  testMode: boolean,
  boardId: string,
  renderer: string,
  round: { readonly round: number; readonly rounds: number } | null = null,
): LookSettings {
  return parseLookSettings(typeof location === 'undefined' ? '' : location.search, {
    testMode,
    boardId,
    round,
    renderer,
    sessionQuality: sessionQuality(),
  });
}

/** Einstellungen für Lobby bzw. Siegerehrung (feste Stimmung, CHAOS-77). */
export function sceneLookSettings(
  testMode: boolean,
  scene: FixedMoodScene,
  renderer: string,
): LookSettings {
  return parseLookSettings(typeof location === 'undefined' ? '' : location.search, {
    testMode,
    boardId: '',
    scene,
    renderer,
    sessionQuality: sessionQuality(),
  });
}

/**
 * Renderauflösung der Stufe setzen; beim Aufbau, nach jedem Stufenwechsel und bei Größenänderung
 * aufrufen. Software-Rendering: halbe Auflösung (ein Viertel der Pixel). Spielbar ist es dort
 * ohnehin nicht; so bleibt mehr Rechenzeit für Regie, Minispiel-Uhr und Controller-Seiten.
 * Sonst begrenzt `maxRenderPixels` die Pixelzahl (4K, HiDPI; CHAOS-73).
 */
export function applyRenderScale(
  engine: {
    setHardwareScalingLevel(level: number): void;
    getHardwareScalingLevel(): number;
    getRenderingCanvas(): HTMLCanvasElement | null;
  },
  settings: LookSettings,
  level: QualityLevel = settings.quality,
): void {
  if (settings.software && level === 'minimal') {
    engine.setHardwareScalingLevel(2);
    return;
  }
  const maxPixels = QUALITY[level].maxRenderPixels;
  const canvas = engine.getRenderingCanvas();
  // Unbegrenzt (minimal, Testmodus): Babylons eigene Einstellung bleibt unangetastet.
  if (!Number.isFinite(maxPixels) || !canvas) return;
  const scaling = renderScalingLevel(
    canvas.clientWidth,
    canvas.clientHeight,
    window.devicePixelRatio,
    maxPixels,
  );
  // setHardwareScalingLevel ruft resize() auf; nur bei echter Änderung.
  if (Math.abs(scaling - engine.getHardwareScalingLevel()) > 1e-3) {
    engine.setHardwareScalingLevel(scaling);
  }
}
