/**
 * Vielfalts-Prüfung (CHAOS-84, README §5.5, Auflage aus dem Konzept-Gate CHAOS-82): Jedes
 * Minispiel der Rotation hat einen Steckbrief aus sieben Merkmalen. Ein Spiel muss sich vom
 * ähnlichsten anderen in **mindestens drei** Merkmalen unterscheiden; Ausnahmen nur mit
 * Begründung (Katalog-Eintrag in `docs/minigames/katalog.md`).
 *
 * Die Bedienung wird aus `MinigameInfo.controls` abgeleitet (nicht doppelt gepflegt), die
 * übrigen Merkmale stehen in `VARIETY_PROFILES`. Die Werte kommen aus festen Listen, damit
 * „rund“ und „Rund“ nicht als Unterschied zählen.
 *
 * Hinweis: Der Baukasten (CHAOS-83) legt den Steckbrief später am Spiel selbst ab; dann liest
 * diese Prüfung ihn von dort, die Regel bleibt gleich.
 */
import type { MinigameInfo } from '@chaos-party/minigame-sdk';

export const CORE_VERBS = [
  'fangen',
  'ausweichen',
  'rempeln',
  'schieben',
  'reagieren',
  'takten',
  'pumpen',
  'zielen',
  'stapeln',
  'rennen',
  'merken',
  'zocken',
  'waehlen',
  'malen',
  'fahren',
  'schaetzen',
  'liefern',
] as const;
export const GOALS = [
  'sammeln',
  'ueberleben',
  'zuerst',
  'genau',
  'mehrheit',
  'halten',
  'treffen',
  'einlochen',
  'abliefern',
  'hoechster',
] as const;
export const ARENAS = [
  'rund',
  'rechteckig',
  'bahnen',
  'insel-mit-kante',
  'eigenbereiche',
  'wand',
  'strecke',
] as const;
export const CAMERAS = ['draufsicht', 'schraeg-fest', 'seite', 'frontal', 'verfolger'] as const;
export const CONTROLS = ['A', 'AB', 'S', 'SA', 'SAB'] as const;
export const FORMS = ['FFA', '1v3', '2v2', 'Koop', 'Mikro'] as const;
export const TEMPOS = ['ruhig', 'wechselnd', 'hektisch'] as const;

export interface VarietyProfile {
  readonly kernverb: (typeof CORE_VERBS)[number];
  readonly ziel: (typeof GOALS)[number];
  readonly arena: (typeof ARENAS)[number];
  readonly kamera: (typeof CAMERAS)[number];
  readonly bedienung: (typeof CONTROLS)[number];
  readonly spielform: (typeof FORMS)[number];
  readonly tempo: (typeof TEMPOS)[number];
}

export type VarietyKey = keyof VarietyProfile;

export const VARIETY_KEYS: readonly VarietyKey[] = [
  'kernverb',
  'ziel',
  'arena',
  'kamera',
  'bedienung',
  'spielform',
  'tempo',
];

/** Mindestzahl abweichender Merkmale zum ähnlichsten Spiel (README §5.5). */
export const MIN_VARIETY_DISTANCE = 3;

/** Bedienung aus dem Steckbrief: `S` = Stick, dann die Knöpfe. */
export function controlsOf(info: Pick<MinigameInfo, 'controls'>): VarietyProfile['bedienung'] {
  const { joystick, a, b } = info.controls;
  const code = `${joystick ? 'S' : ''}${a ? 'A' : ''}${b ? 'B' : ''}`;
  const known = CONTROLS.find((entry) => entry === code);
  if (!known) throw new Error(`Bedienung „${code || 'keine'}“ ist nicht vorgesehen`);
  return known;
}

/** Merkmale, in denen sich zwei Steckbriefe unterscheiden. */
export function differingKeys(a: VarietyProfile, b: VarietyProfile): VarietyKey[] {
  return VARIETY_KEYS.filter((key) => a[key] !== b[key]);
}

export interface NearestGame {
  readonly id: string;
  readonly distance: number;
  /** Gleiche Merkmale (zur Fehlermeldung). */
  readonly shared: readonly VarietyKey[];
}

/** Ähnlichstes anderes Spiel (kleinster Abstand; bei Gleichstand das erste in der Liste). */
export function nearestGame(
  id: string,
  profiles: ReadonlyMap<string, VarietyProfile>,
): NearestGame | null {
  const own = profiles.get(id);
  if (!own) throw new Error(`Kein Vielfalts-Steckbrief für ${id}`);
  let nearest: NearestGame | null = null;
  for (const [otherId, other] of profiles) {
    if (otherId === id) continue;
    const distance = differingKeys(own, other).length;
    if (!nearest || distance < nearest.distance) {
      nearest = {
        id: otherId,
        distance,
        shared: VARIETY_KEYS.filter((key) => own[key] === other[key]),
      };
    }
  }
  return nearest;
}

/** Begründete Ausnahme: `id` darf `with` näher als erlaubt sein. */
export interface VarietyException {
  readonly id: string;
  readonly with: string;
  readonly reason: string;
}

export interface VarietyViolation {
  readonly id: string;
  readonly nearest: NearestGame;
}

/** Alle Spiele, die dem ähnlichsten zu nahe sind (ohne begründete Ausnahmen). */
export function checkVariety(
  profiles: ReadonlyMap<string, VarietyProfile>,
  exceptions: readonly VarietyException[] = [],
  minDistance: number = MIN_VARIETY_DISTANCE,
): VarietyViolation[] {
  const violations: VarietyViolation[] = [];
  for (const id of profiles.keys()) {
    const own = profiles.get(id);
    if (!own) continue;
    // Jedes andere Spiel unter dem Mindestabstand zählt, nicht nur das ähnlichste – sonst
    // könnte eine Ausnahme für das ähnlichste ein zweites, ebenso nahes Spiel verdecken.
    for (const [otherId, other] of profiles) {
      if (otherId === id) continue;
      const distance = differingKeys(own, other).length;
      if (distance >= minDistance) continue;
      const excused = exceptions.some(
        (exception) =>
          (exception.id === id && exception.with === otherId) ||
          (exception.id === otherId && exception.with === id),
      );
      if (excused) continue;
      violations.push({
        id,
        nearest: {
          id: otherId,
          distance,
          shared: VARIETY_KEYS.filter((key) => own[key] === other[key]),
        },
      });
    }
  }
  return violations;
}

/** Steckbrief-Tabelle mit ähnlichstem Spiel (für Prüfbericht und Katalog). */
export function varietyTable(profiles: ReadonlyMap<string, VarietyProfile>): string {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  const headers = ['Spiel', ...VARIETY_KEYS, 'ähnlichstes Spiel', 'Abstand'];
  const rows = [...profiles].map(([id, profile]) => {
    const nearest = nearestGame(id, profiles);
    return line([
      id,
      ...VARIETY_KEYS.map((key) => profile[key]),
      nearest?.id ?? '–',
      nearest ? `${nearest.distance} / ${VARIETY_KEYS.length}` : '–',
    ]);
  });
  return [line(headers), line(headers.map(() => '---')), ...rows].join('\n');
}
