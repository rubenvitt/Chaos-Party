/**
 * Babylon-Module aller Minispiele, synchron. Reihenfolge wie `MINIGAME_INFOS`.
 *
 * Für den Apple-Host (ein JavaScriptCore-Bündel), Tests und Werkzeuge in Node. Der Host im
 * Browser importiert diese Datei **nicht**, sondern lädt je Spiel über `./lazy.ts`
 * (CHAOS-86, ESLint-Regel in `eslint.config.js`, `pnpm check:bundle`).
 */
import type { MinigameModule } from '@chaos-party/minigame-sdk/babylon';
import { kruemelKehraus } from './kruemel-kehraus/index.ts';
import { kuckucksKlatsche } from './kuckucks-klatsche/index.ts';
import { puddingGerangel } from './pudding-gerangel/index.ts';
import { pumpParade } from './pump-parade/index.ts';
import { sockenregen } from './sockenregen/index.ts';
import { wackelturm } from './wackelturm/index.ts';

export * from './catalog.ts';

export const MINIGAME_MODULES: readonly MinigameModule[] = [
  pumpParade,
  sockenregen,
  puddingGerangel,
  wackelturm,
  kuckucksKlatsche,
  kruemelKehraus,
];

export function getMinigameModule(id: string): MinigameModule | undefined {
  return MINIGAME_MODULES.find((module) => module.info.id === id);
}
