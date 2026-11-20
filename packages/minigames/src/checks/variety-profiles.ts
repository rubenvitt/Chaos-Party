/**
 * Vielfalts-Steckbriefe der Minispiele in der Rotation (CHAOS-84, README §5.5). Bedienung
 * kommt aus `info.controls`; hier stehen die übrigen sechs Merkmale.
 *
 * Neues Spiel in `ROTATION` → hier eintragen (sonst schlägt `checks.test.ts` fehl). Die
 * Werte stammen aus den festen Listen in `variety.ts`. Kamera: `schraeg-fest` = feste Kamera
 * schräg von oben (so filmen heute alle Arena-Spiele), `frontal` = von vorn auf eine Wand.
 */
import { KRUEMEL_KEHRAUS_INFO } from '../kruemel-kehraus/info.ts';
import { KUCKUCKS_KLATSCHE_INFO } from '../kuckucks-klatsche/info.ts';
import { PUDDING_GERANGEL_INFO } from '../pudding-gerangel/info.ts';
import { SOCKENREGEN_INFO } from '../sockenregen/info.ts';
import { WACKELTURM_INFO } from '../wackelturm/info.ts';
import type { VarietyException, VarietyProfile } from './variety.ts';

export type VarietyEntry = Omit<VarietyProfile, 'bedienung'>;

export const VARIETY_ENTRIES: Readonly<Record<string, VarietyEntry>> = {
  [SOCKENREGEN_INFO.id]: {
    kernverb: 'fangen',
    ziel: 'sammeln',
    arena: 'rund',
    kamera: 'schraeg-fest',
    spielform: 'FFA',
    tempo: 'hektisch',
  },
  [PUDDING_GERANGEL_INFO.id]: {
    kernverb: 'rempeln',
    ziel: 'halten',
    arena: 'insel-mit-kante',
    kamera: 'schraeg-fest',
    spielform: 'FFA',
    tempo: 'wechselnd',
  },
  [WACKELTURM_INFO.id]: {
    kernverb: 'stapeln',
    ziel: 'abliefern',
    arena: 'rund',
    kamera: 'schraeg-fest',
    spielform: 'FFA',
    tempo: 'wechselnd',
  },
  [KUCKUCKS_KLATSCHE_INFO.id]: {
    kernverb: 'reagieren',
    ziel: 'treffen',
    arena: 'wand',
    kamera: 'frontal',
    spielform: 'FFA',
    tempo: 'wechselnd',
  },
  [KRUEMEL_KEHRAUS_INFO.id]: {
    kernverb: 'schieben',
    ziel: 'einlochen',
    arena: 'rechteckig',
    kamera: 'schraeg-fest',
    spielform: 'FFA',
    tempo: 'hektisch',
  },
};

/**
 * Begründete Ausnahmen vom Mindestabstand. Jede braucht einen Satz im Katalog-Eintrag
 * (`docs/minigames/katalog.md`), warum sich die Spiele trotzdem verschieden anfühlen.
 */
export const VARIETY_EXCEPTIONS: readonly VarietyException[] = [];
