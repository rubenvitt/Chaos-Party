/**
 * Lichtverlauf je Runde (CHAOS-63): Überblendung zwischen zwei Lichtstimmungen als reine
 * Rechnung, ohne Babylon. Die Szene (`../nature/lighting.ts`) liest je Bild den gemischten
 * Zustand und setzt ihn in Sonne, Bodenlicht, Dunst, Farbabstimmung und Nachtlichter um.
 *
 * - `lightStateOf` macht aus einer `LightMood` die Zahlen, die sich stufenlos mischen lassen
 *   (Farben linear im sRGB-Raum, Nachtlichter mit Stärke 0 bei Tag).
 * - `mixLightStates` mischt zwei Zustände (0 = a, 1 = b).
 * - `createMoodTransition` führt den Übergang: Ziel setzen, Zeit vergehen lassen, Zustand
 *   lesen. Deterministisch: dieselbe Folge aus `setTarget`/`advance` ergibt denselben Zustand.
 */
import { LIGHT_MOODS, type LightMood, type LightMoodId } from './moods.ts';

/** Dauer einer Überblendung zwischen zwei Runden (ms). */
export const MOOD_TRANSITION_MS = 4000;

/** Farbe als [r, g, b] im Bereich 0…1 (sRGB, wie die Hexwerte der Stimmungen). */
export type Rgb = readonly [number, number, number];

export interface LightState {
  readonly skyIntensity: number;
  readonly keyIntensity: number;
  readonly keyTint: Rgb;
  readonly penumbra: number;
  /** Höhe der Sonne (Sinus der Elevation), Mitte des erlaubten Bereichs der Stimmung. */
  readonly keyElevation: number;
  readonly fillIntensity: number;
  readonly fillSky: Rgb;
  readonly fillGround: Rgb;
  readonly hazeColor: Rgb;
  readonly hazeDensity: number;
  readonly exposure: number;
  readonly contrast: number;
  readonly bloomWeight: number;
  readonly bloomThreshold: number;
  /** 0 = Tag (keine Nachtlichter), 1 = volle Nacht der Stimmung mit den stärksten Lichtern. */
  readonly nightness: number;
  readonly lanternColor: Rgb;
  readonly lanternIntensity: number;
  readonly lanternRange: number;
  /**
   * Laternen an (0…1): 1 in jeder Stimmung mit Nachtlichtern. Steuert leuchtendes Glas und
   * Schein, während `lanternIntensity` die Lichtstärke selbst mischt.
   */
  readonly lampsOn: number;
  /** Sichtbarer Anteil der Glühwürmchen (0…1, bezogen auf die meisten aller Stimmungen). */
  readonly fireflies: number;
  readonly tileGlow: number;
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '');
  const n = Number.parseInt(value.slice(0, 6), 16);
  if (value.length < 6 || Number.isNaN(n)) throw new Error(`Keine Hexfarbe: ${hex}`);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const MAX_FIREFLIES = Math.max(...Object.values(LIGHT_MOODS).map((m) => m.night?.fireflies ?? 0));
const MAX_LANTERN = Math.max(
  ...Object.values(LIGHT_MOODS).map((m) => m.night?.lanternIntensity ?? 0),
);
const DEFAULT_LANTERN: Rgb = hexToRgb('#ff9c4a');

export function lightStateOf(mood: LightMood): LightState {
  const night = mood.night;
  return {
    skyIntensity: mood.sky.intensity,
    keyIntensity: mood.key.intensity,
    keyTint: hexToRgb(mood.key.tint),
    penumbra: mood.key.penumbra,
    keyElevation: (mood.key.minElevation + mood.key.maxElevation) / 2,
    fillIntensity: mood.fill.intensity,
    fillSky: hexToRgb(mood.fill.sky),
    fillGround: hexToRgb(mood.fill.ground),
    hazeColor: hexToRgb(mood.haze.color),
    hazeDensity: mood.haze.density,
    exposure: mood.grade.exposure,
    contrast: mood.grade.contrast,
    bloomWeight: mood.grade.bloomWeight,
    bloomThreshold: mood.grade.bloomThreshold,
    nightness: night && MAX_LANTERN > 0 ? night.lanternIntensity / MAX_LANTERN : 0,
    lampsOn: night ? 1 : 0,
    lanternColor: night ? hexToRgb(night.lanternColor) : DEFAULT_LANTERN,
    lanternIntensity: night?.lanternIntensity ?? 0,
    // Bei Tag 0; beim Mischen gilt die Reichweite der Nacht-Seite (nur die Stärke blendet).
    lanternRange: night?.lanternRange ?? 0,
    fireflies: night && MAX_FIREFLIES > 0 ? night.fireflies / MAX_FIREFLIES : 0,
    tileGlow: night?.tileGlow ?? 0,
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export function mixLightStates(a: LightState, b: LightState, t: number): LightState {
  const k = Math.min(1, Math.max(0, t));
  // Laternen-Reichweite und -Farbe: die der Seite mit Nachtlichtern (eine Tag-Seite hat keine).
  const range =
    a.lanternIntensity === 0
      ? b.lanternRange
      : b.lanternIntensity === 0
        ? a.lanternRange
        : lerp(a.lanternRange, b.lanternRange, k);
  const color =
    a.lanternIntensity === 0
      ? b.lanternColor
      : b.lanternIntensity === 0
        ? a.lanternColor
        : lerpRgb(a.lanternColor, b.lanternColor, k);
  return {
    skyIntensity: lerp(a.skyIntensity, b.skyIntensity, k),
    keyIntensity: lerp(a.keyIntensity, b.keyIntensity, k),
    keyTint: lerpRgb(a.keyTint, b.keyTint, k),
    penumbra: lerp(a.penumbra, b.penumbra, k),
    keyElevation: lerp(a.keyElevation, b.keyElevation, k),
    fillIntensity: lerp(a.fillIntensity, b.fillIntensity, k),
    fillSky: lerpRgb(a.fillSky, b.fillSky, k),
    fillGround: lerpRgb(a.fillGround, b.fillGround, k),
    hazeColor: lerpRgb(a.hazeColor, b.hazeColor, k),
    hazeDensity: lerp(a.hazeDensity, b.hazeDensity, k),
    exposure: lerp(a.exposure, b.exposure, k),
    contrast: lerp(a.contrast, b.contrast, k),
    bloomWeight: lerp(a.bloomWeight, b.bloomWeight, k),
    bloomThreshold: lerp(a.bloomThreshold, b.bloomThreshold, k),
    nightness: lerp(a.nightness, b.nightness, k),
    lampsOn: lerp(a.lampsOn, b.lampsOn, k),
    lanternColor: color,
    lanternIntensity: lerp(a.lanternIntensity, b.lanternIntensity, k),
    lanternRange: range,
    fireflies: lerp(a.fireflies, b.fireflies, k),
    tileGlow: lerp(a.tileGlow, b.tileGlow, k),
  };
}

/** Weicher Anfang und weiches Ende (smoothstep). */
export function easeInOut(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return k * k * (3 - 2 * k);
}

export interface MoodTransitionSnapshot {
  /** Stimmung, von der aus überblendet wird (ohne laufenden Übergang: die aktuelle). */
  readonly from: LightMoodId;
  /** Ziel bzw. aktuelle Stimmung. */
  readonly to: LightMoodId;
  /** Fortschritt 0…1 (linear in der Zeit); 1 = kein Übergang aktiv. */
  readonly progress: number;
  /** Mischanteil nach Ease (0 = `from`, 1 = `to`). */
  readonly mix: number;
  readonly state: LightState;
}

export interface MoodTransition {
  readonly current: MoodTransitionSnapshot;
  readonly active: boolean;
  /**
   * Neues Ziel. Gleiches Ziel: nichts. Läuft noch ein Übergang, springt er erst ans Ende
   * (Runden wechseln im Spiel nie schneller als eine Überblendung). `durationMs` 0 = sofort.
   */
  setTarget(id: LightMoodId, durationMs?: number): void;
  /** Zeit vergehen lassen (ms); liefert den neuen Stand. */
  advance(ms: number): MoodTransitionSnapshot;
}

export function createMoodTransition(
  initial: LightMoodId,
  moodOf: (id: LightMoodId) => LightMood = (id) => LIGHT_MOODS[id],
): MoodTransition {
  const states = new Map<LightMoodId, LightState>();
  const stateOf = (id: LightMoodId): LightState => {
    let s = states.get(id);
    if (!s) {
      s = lightStateOf(moodOf(id));
      states.set(id, s);
    }
    return s;
  };
  let from = initial;
  let to = initial;
  let duration = 0;
  let elapsed = 0;

  const snapshot = (): MoodTransitionSnapshot => {
    const progress = duration > 0 ? Math.min(1, elapsed / duration) : 1;
    const mix = easeInOut(progress);
    const state =
      from === to || mix >= 1 ? stateOf(to) : mixLightStates(stateOf(from), stateOf(to), mix);
    return { from, to, progress, mix, state };
  };
  let current = snapshot();

  return {
    get current() {
      return current;
    },
    get active() {
      return current.progress < 1;
    },
    setTarget(id, durationMs = MOOD_TRANSITION_MS) {
      if (id === to) return;
      from = to;
      to = id;
      duration = Math.max(0, durationMs);
      elapsed = 0;
      if (duration === 0) from = to;
      current = snapshot();
    },
    advance(ms) {
      if (current.progress < 1) {
        elapsed += Math.max(0, ms);
        current = snapshot();
        if (current.progress >= 1) {
          from = to;
          current = snapshot();
        }
      }
      return current;
    },
  };
}
