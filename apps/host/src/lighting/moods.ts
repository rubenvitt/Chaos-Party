/**
 * Lichtstimmungen als Daten (CHAOS-60): Himmel (HDRI), Sonne bzw. Mond, Bodenlicht, Dunst,
 * Farbabstimmung und Nachtlichter an einer Stelle, statt verstreut im Szenencode.
 *
 * Das Modul kennt kein Babylon. Es beschreibt nur, *wie* eine Stimmung aussieht und *welche*
 * Stimmung gerade gilt. Drei Zuordnungen stehen zur Wahl (Entscheidung bei Ruben, EXP-010):
 *
 * - `brett`: feste Stimmung je Brett (`BOARD_MOODS`),
 * - `uhr`: echte Uhrzeit des PCs (`CLOCK_SCHEDULE`),
 * - `verlauf`: Spielverlauf, erste Runde morgens, letzte Runde nachts (`ROUND_ARC`).
 *
 * Im Spiel gilt `verlauf` (Rubens Wahl, CHAOS-63): Brett und Minispiele folgen der Runde,
 * `../nature/lighting.ts` setzt eine `LightMood` in Lichter, Himmel und Nachbearbeitung um und
 * blendet beim Rundenwechsel über (`./transition.ts`).
 */

export const LIGHT_MOOD_IDS = [
  'morgen',
  'mittag',
  'wolken',
  'abend',
  'daemmerung',
  'nacht',
] as const;
export type LightMoodId = (typeof LIGHT_MOOD_IDS)[number];

/** Hexfarbe `#rrggbb`. */
export type Hex = `#${string}`;

export interface LightMood {
  readonly id: LightMoodId;
  /** Kurzer Name für Menüs und Entscheidungsseite. */
  readonly title: string;
  readonly blurb: string;
  readonly sky: {
    /** Poly-Haven-ID eines Puresky-HDRI (CC0, Liste in `lookdev/polyhaven.json`). */
    readonly hdri: string;
    /** Stärke des Umgebungslichts aus dem HDRI. */
    readonly intensity: number;
  };
  /** Hauptlicht: tagsüber die Sonne, nachts der Mond. */
  readonly key: {
    readonly intensity: number;
    readonly tint: Hex;
    /** Weichheit der Schatten (Lichtgröße für PCSS). */
    readonly penumbra: number;
    /** Höhe über dem Horizont (Sinus der Elevation), begrenzt für lesbare Schatten. */
    readonly minElevation: number;
    readonly maxElevation: number;
  };
  /** Bodenlicht (Puresky-HDRIs sind unten schwarz). */
  readonly fill: { readonly intensity: number; readonly sky: Hex; readonly ground: Hex };
  readonly haze: { readonly color: Hex; readonly density: number };
  readonly grade: {
    readonly exposure: number;
    readonly contrast: number;
    readonly bloomWeight: number;
    readonly bloomThreshold: number;
  };
  /** Farbstich der Grasspitzen. */
  readonly grassTip: Hex;
  /**
   * Nachtlichter. `tileGlow` lässt Feld-Einlagen und Slot-Ringe von innen leuchten (Anteil der
   * eigenen Farbe), damit Felder und Slot-Farben auch im Dunkeln am Fernseher lesbar bleiben.
   */
  readonly night: {
    readonly lanterns: number;
    readonly lanternColor: Hex;
    readonly lanternIntensity: number;
    readonly lanternRange: number;
    readonly fireflies: number;
    readonly tileGlow: number;
  } | null;
}

export const LIGHT_MOODS: Readonly<Record<LightMoodId, LightMood>> = {
  morgen: {
    id: 'morgen',
    title: 'Morgen',
    blurb: 'klares Vormittagslicht, frisches Grün, kühle Schatten',
    sky: { hdri: 'qwantani_mid_morning_puresky', intensity: 1.0 },
    key: { intensity: 3.2, tint: '#fff3e0', penumbra: 0.03, minElevation: 0.35, maxElevation: 0.8 },
    fill: { intensity: 0.35, sky: '#cfe2f0', ground: '#7d8a52' },
    haze: { color: '#cfe2f0', density: 0.006 },
    grade: { exposure: 1.4, contrast: 1.1, bloomWeight: 0.18, bloomThreshold: 0.85 },
    grassTip: '#b5d86a',
    night: null,
  },
  mittag: {
    id: 'mittag',
    title: 'Mittag',
    blurb: 'hohe Sonne, kurze Schatten, kräftige Farben',
    sky: { hdri: 'qwantani_noon_puresky', intensity: 1.0 },
    key: {
      intensity: 3.4,
      tint: '#fffaf0',
      penumbra: 0.03,
      minElevation: 0.55,
      maxElevation: 0.85,
    },
    fill: { intensity: 0.35, sky: '#d4e6f4', ground: '#7d8a52' },
    haze: { color: '#d4e6f4', density: 0.005 },
    grade: { exposure: 1.3, contrast: 1.12, bloomWeight: 0.16, bloomThreshold: 0.88 },
    grassTip: '#acd462',
    night: null,
  },
  wolken: {
    id: 'wolken',
    title: 'Bewölkt',
    blurb: 'weiches Wolkenlicht, satte Farben, sanfte Schatten',
    sky: { hdri: 'kloofendal_48d_partly_cloudy_puresky', intensity: 1.15 },
    key: { intensity: 2.2, tint: '#fff8f0', penumbra: 0.07, minElevation: 0.35, maxElevation: 0.8 },
    fill: { intensity: 0.35, sky: '#dfe7ec', ground: '#7d8a52' },
    haze: { color: '#dfe7ec', density: 0.007 },
    grade: { exposure: 1.45, contrast: 1.12, bloomWeight: 0.18, bloomThreshold: 0.85 },
    grassTip: '#a8d062',
    night: null,
  },
  abend: {
    id: 'abend',
    title: 'Goldene Stunde',
    blurb: 'tiefe warme Sonne, lange Schatten, Dunst',
    sky: { hdri: 'qwantani_late_afternoon_puresky', intensity: 0.9 },
    key: {
      intensity: 4.0,
      tint: '#ffcf96',
      penumbra: 0.025,
      minElevation: 0.35,
      maxElevation: 0.8,
    },
    fill: { intensity: 0.35, sky: '#f2d2b0', ground: '#7d8a52' },
    haze: { color: '#f2d2b0', density: 0.01 },
    grade: { exposure: 1.35, contrast: 1.15, bloomWeight: 0.18, bloomThreshold: 0.85 },
    grassTip: '#d6d36a',
    night: null,
  },
  daemmerung: {
    id: 'daemmerung',
    title: 'Dämmerung',
    blurb: 'blaue Stunde, Restlicht am Horizont, erste Laternen',
    sky: { hdri: 'qwantani_dusk_2_puresky', intensity: 0.35 },
    key: {
      intensity: 2.2,
      tint: '#ff9a66',
      penumbra: 0.06,
      minElevation: 0.3,
      maxElevation: 0.5,
    },
    fill: { intensity: 0.3, sky: '#6a76b0', ground: '#4c5638' },
    haze: { color: '#565c86', density: 0.012 },
    grade: { exposure: 1.7, contrast: 1.12, bloomWeight: 0.3, bloomThreshold: 0.7 },
    grassTip: '#9fb86a',
    night: {
      lanterns: 4,
      lanternColor: '#ff9c4a',
      lanternIntensity: 5,
      lanternRange: 6,
      fireflies: 24,
      tileGlow: 0.25,
    },
  },
  nacht: {
    id: 'nacht',
    title: 'Nacht',
    blurb: 'Mondlicht, warme Laternen, Glühwürmchen, leuchtende Felder',
    sky: { hdri: 'qwantani_moon_noon_puresky', intensity: 0.5 },
    key: {
      intensity: 0.8,
      tint: '#7f9cff',
      penumbra: 0.05,
      minElevation: 0.45,
      maxElevation: 0.75,
    },
    fill: { intensity: 0.22, sky: '#2c3a70', ground: '#12170f' },
    haze: { color: '#1e2742', density: 0.012 },
    grade: { exposure: 1.9, contrast: 1.2, bloomWeight: 0.4, bloomThreshold: 0.6 },
    grassTip: '#7f9c5e',
    night: {
      lanterns: 4,
      lanternColor: '#ff9c4a',
      lanternIntensity: 14,
      lanternRange: 7,
      fireflies: 70,
      tileGlow: 0.7,
    },
  },
};

// ---------------------------------------------------------------------------------------------
// Welche Stimmung gilt?
// ---------------------------------------------------------------------------------------------

export const LIGHTING_MODES = ['brett', 'uhr', 'verlauf'] as const;
export type LightingMode = (typeof LIGHTING_MODES)[number];

/** Variante A: feste Stimmung je Brett (Brett-ID aus `@chaos-party/game-core`). */
export const BOARD_MOODS: Readonly<Record<string, LightMoodId>> = {
  wackelwald: 'abend',
  // CHAOS-199: Rummelplatz bei Nacht.
  rummelplatz: 'nacht',
  // CHAOS-198: klarer Wintertag am Berg.
  frostgipfel: 'morgen',
};
export const DEFAULT_BOARD_MOOD: LightMoodId = 'abend';

export function moodForBoard(boardId: string): LightMoodId {
  return BOARD_MOODS[boardId] ?? DEFAULT_BOARD_MOOD;
}

/**
 * Variante B: Uhrzeit des PCs. Feste Stunden (ohne Jahreszeit), jeweils ab `from` Uhr bis zum
 * nächsten Eintrag.
 */
export const CLOCK_SCHEDULE: readonly { readonly from: number; readonly mood: LightMoodId }[] = [
  { from: 0, mood: 'nacht' },
  { from: 6, mood: 'morgen' },
  { from: 11, mood: 'mittag' },
  { from: 16, mood: 'abend' },
  { from: 19, mood: 'daemmerung' },
  { from: 21, mood: 'nacht' },
];

export function moodForClock(hour: number): LightMoodId {
  const h = ((hour % 24) + 24) % 24;
  let mood: LightMoodId = 'nacht';
  for (const entry of CLOCK_SCHEDULE) if (h >= entry.from) mood = entry.mood;
  return mood;
}

/** Variante C: Spielverlauf, ein Tag pro Partie. Die letzte Runde spielt nachts. */
export const ROUND_ARC: readonly LightMoodId[] = [
  'morgen',
  'mittag',
  'abend',
  'daemmerung',
  'nacht',
];

/**
 * Eigener Verlauf je Brett (CHAOS-199): Der Rummelplatz spielt bei Nacht, er beginnt in der
 * Dämmerung und ist ab dem ersten Drittel der Partie Nacht. Der Frostgipfel (CHAOS-198) bleibt
 * ein Wintertag vom Morgen bis zum Abend. Bretter ohne Eintrag: `ROUND_ARC`.
 */
export const BOARD_ROUND_ARCS: Readonly<Record<string, readonly LightMoodId[]>> = {
  rummelplatz: ['daemmerung', 'nacht', 'nacht'],
  // CHAOS-198: klarer Morgen, heller Mittag, Schneewolken, Alpenglühen am Abend.
  frostgipfel: ['morgen', 'mittag', 'wolken', 'abend'],
};

/**
 * Stimmung für Runde `round` (1-basiert) von `totalRounds`; Minispiele erben sie. Mit
 * `boardId` gilt der Verlauf des Bretts (`BOARD_ROUND_ARCS`), sonst der Tagesverlauf.
 */
export function moodForRound(round: number, totalRounds: number, boardId?: string): LightMoodId {
  const arc = (boardId !== undefined ? BOARD_ROUND_ARCS[boardId] : undefined) ?? ROUND_ARC;
  const last = arc.length - 1;
  if (totalRounds <= 1) return arc[last] ?? 'nacht';
  const r = Math.min(Math.max(round, 1), totalRounds);
  const index = Math.round(((r - 1) / (totalRounds - 1)) * last);
  return arc[index] ?? 'nacht';
}

/**
 * Stimmungen, die eine Brett-Szene in Runde `round` brauchen kann (CHAOS-63): die der Runde
 * und die der nächsten. Das Brett wird nach jedem Minispiel neu aufgebaut (noch in der alten
 * Runde) und blendet beim Rundenwechsel in die nächste Stimmung über; deren Himmel und
 * Nachtlichter lädt die Szene deshalb schon beim Aufbau.
 */
export function moodsForBoardRound(
  round: number,
  totalRounds: number,
  boardId?: string,
): LightMoodId[] {
  const current = moodForRound(round, totalRounds, boardId);
  const next = round < totalRounds ? moodForRound(round + 1, totalRounds, boardId) : current;
  return next === current ? [current] : [current, next];
}

/**
 * Feste Stimmungen außerhalb der Partie (CHAOS-63, Vorschlag aus dem Ticket): Die Lobby spielt
 * in der Goldenen Stunde, die Siegerehrung nachts (die Partie endet nachts). Beide Szenen haben
 * noch keinen Natur-Look; sie lesen den Wert, sobald sie ihn bekommen.
 */
export const SCENE_MOODS = {
  lobby: 'abend',
  finale: 'nacht',
} as const satisfies Readonly<Record<string, LightMoodId>>;

export interface MoodContext {
  readonly boardId: string;
  readonly round: number;
  readonly totalRounds: number;
  /** Stunde 0–23 (lokale Uhrzeit des PCs). */
  readonly hour: number;
}

export function resolveMood(mode: LightingMode, context: MoodContext): LightMood {
  const id =
    mode === 'brett'
      ? moodForBoard(context.boardId)
      : mode === 'uhr'
        ? moodForClock(context.hour)
        : moodForRound(context.round, context.totalRounds, context.boardId);
  return LIGHT_MOODS[id];
}
