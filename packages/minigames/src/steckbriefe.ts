/**
 * Vielfalts-Steckbriefe der Minispiele (README §5.5, ADR-021). Je Spiel: Kernverb, Ziel,
 * Arena-Form, Kamera, Bedienung, Spielform, Tempo und Ort. Der gemeinsame Vertragstest
 * (CHAOS-84) prüft damit den Mindestabstand neuer Spiele zum ähnlichsten bestehenden.
 */
import type { Steckbrief } from '@chaos-party/minigame-kit';

export const STECKBRIEFE: Readonly<Record<string, Steckbrief>> = {
  'pump-parade': {
    kernverb: 'pumpen',
    ziel: 'meiste',
    arena: 'buehne',
    kamera: 'fest',
    bedienung: 'A',
    spielform: 'FFA',
    tempo: 'hektisch',
    ort: 'garten',
  },
  sockenregen: {
    kernverb: 'fangen',
    ziel: 'meiste',
    arena: 'rund',
    kamera: 'schraeg',
    bedienung: 'SA',
    spielform: 'FFA',
    tempo: 'hektisch',
    ort: 'bad',
  },
  'pudding-gerangel': {
    kernverb: 'rempeln',
    ziel: 'meiste',
    arena: 'insel',
    kamera: 'schraeg',
    bedienung: 'SA',
    spielform: 'FFA',
    tempo: 'wechselnd',
    ort: 'garten',
  },
  wackelturm: {
    kernverb: 'stapeln',
    ziel: 'meiste',
    arena: 'frei',
    kamera: 'schraeg',
    bedienung: 'SAB',
    spielform: 'FFA',
    tempo: 'ruhig',
    ort: 'garten',
  },
  'kuckucks-klatsche': {
    kernverb: 'reagieren',
    ziel: 'meiste',
    arena: 'buehne',
    kamera: 'fest',
    bedienung: 'A',
    spielform: 'FFA',
    tempo: 'wechselnd',
    ort: 'spielzimmer',
  },
  'kruemel-kehraus': {
    kernverb: 'rempeln',
    ziel: 'meiste',
    arena: 'eckig',
    kamera: 'draufsicht',
    bedienung: 'SA',
    spielform: 'FFA',
    tempo: 'hektisch',
    ort: 'kueche',
  },
  'hallo-baukasten': {
    kernverb: 'fangen',
    ziel: 'meiste',
    arena: 'eckig',
    kamera: 'schraeg',
    bedienung: 'SA',
    spielform: 'FFA',
    tempo: 'wechselnd',
    ort: 'teich',
  },
};

export function getSteckbrief(id: string): Steckbrief | undefined {
  return STECKBRIEFE[id];
}
