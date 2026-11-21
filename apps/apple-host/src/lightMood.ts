/**
 * Lichtstimmung im JS-Kern (CHAOS-193): dieselben Stimmungen und dieselbe Überblendung wie im
 * Browser-Host (`apps/host/src/lighting/moods.ts`, `transition.ts`, CHAOS-60/63). Swift setzt
 * nur um, was `renderState().board.light` bzw. `.minigame.light` liefert.
 *
 * - Brett: Stimmung der gezeigten Runde (Regie), beim ersten Stand sofort, bei jedem späteren
 *   Rundenwechsel über `MOOD_TRANSITION_MS` gemischt (wie `syncMood` in `createBoardScene.ts`).
 *   Solange ein Minispiel zu sehen ist, steht die Überblendung wie die Regie.
 * - Minispiel: Stimmung seiner Runde, ohne Überblendung (wie `lookMood` im Browser-Host).
 */
import { LIGHT_MOODS, moodForRound, type LightMoodId } from '../../host/src/lighting/moods.ts';
import {
  createMoodTransition,
  lightStateOf,
  type MoodTransition,
  type MoodTransitionSnapshot,
  type Rgb,
} from '../../host/src/lighting/transition.ts';
import type { Light } from './contract.ts';

const channel = (v: number): string =>
  Math.round(Math.min(1, Math.max(0, v)) * 255)
    .toString(16)
    .padStart(2, '0');

/** sRGB 0…1 → `#rrggbb`. */
export function rgbHex(c: Rgb): string {
  return `#${channel(c[0])}${channel(c[1])}${channel(c[2])}`;
}

const round4 = (v: number): number => Math.round(v * 10_000) / 10_000;

/** `renderState`-Form eines (gemischten) Zustands. */
export function lightOf(
  snapshot: Pick<MoodTransitionSnapshot, 'from' | 'to' | 'mix' | 'state'>,
): Light {
  const s = snapshot.state;
  // Umgebungslicht lässt sich nicht mischen: zur Hälfte der Überblendung wechseln (wie `applyState`).
  const environment: LightMoodId =
    snapshot.from !== snapshot.to && snapshot.mix < 0.5 ? snapshot.from : snapshot.to;
  const env = LIGHT_MOODS[environment];
  return {
    mood: snapshot.to,
    keyIntensity: round4(s.keyIntensity),
    keyTint: rgbHex(s.keyTint),
    keyElevation: round4(s.keyElevation),
    skyIntensity: round4(s.skyIntensity),
    fillIntensity: round4(s.fillIntensity),
    fillSky: rgbHex(s.fillSky),
    fillGround: rgbHex(s.fillGround),
    environment: {
      mood: environment,
      sky: env.fill.sky,
      ground: env.fill.ground,
      skyIntensity: env.sky.intensity,
      fillIntensity: env.fill.intensity,
    },
    haze: rgbHex(s.hazeColor),
    exposure: round4(s.exposure),
    lampsOn: round4(s.lampsOn),
    lanternColor: rgbHex(s.lanternColor),
    lanternIntensity: round4(s.lanternIntensity),
    lanternRange: round4(s.lanternRange),
    grassTip: LIGHT_MOODS[snapshot.to].grassTip,
  };
}

/** Feste Stimmung (Minispiel, Brett vor dem ersten Stand). */
export function moodLight(id: LightMoodId): Light {
  return lightOf({ from: id, to: id, mix: 1, state: lightStateOf(LIGHT_MOODS[id]) });
}

const fixed = new Map<LightMoodId, Light>();

/** Stimmung eines Minispiels in Runde `round` von `rounds`, ohne Überblendung. */
export function minigameLight(round: number, rounds: number, boardId?: string): Light {
  const id = moodForRound(round, rounds, boardId);
  let light = fixed.get(id);
  if (!light) {
    light = moodLight(id);
    fixed.set(id, light);
  }
  return light;
}

export interface ShownRound {
  readonly round: number;
  readonly rounds: number;
  /** Brett der Partie (CHAOS-199: eigener Stimmungsverlauf je Brett). */
  readonly boardId?: string;
}

export interface BoardLight {
  /**
   * Je `tick`: `ms` vergangene Zeit, Runde des gezeigten Stands (`null` ohne Stand),
   * `visible: false` hält die Überblendung an (Minispiel).
   */
  advance(ms: number, shown: ShownRound | null, visible: boolean): void;
  /** Aktueller Zustand; ohne bisherigen Stand die Stimmung von `fallback`. */
  current(fallback: ShownRound): Light;
}

export function createBoardLight(): BoardLight {
  let transition: MoodTransition | null = null;
  let cache: { snapshot: MoodTransitionSnapshot; light: Light } | null = null;
  return {
    advance(ms, shown, visible) {
      if (!shown || shown.rounds <= 0) return;
      const target = moodForRound(shown.round, shown.rounds, shown.boardId);
      if (!transition) {
        // Erster Stand: sofort in der Stimmung der Runde (kein Rundenwechsel).
        transition = createMoodTransition(target);
        return;
      }
      if (!visible) return;
      transition.setTarget(target);
      transition.advance(Math.max(0, ms));
    },
    current(fallback) {
      if (!transition) return minigameLight(fallback.round, fallback.rounds, fallback.boardId);
      const snapshot = transition.current;
      if (cache?.snapshot !== snapshot) cache = { snapshot, light: lightOf(snapshot) };
      return cache.light;
    },
  };
}
