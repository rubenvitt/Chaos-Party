/**
 * Babylon-Module aller Minispiele für den Host. Reihenfolge wie `MINIGAME_INFOS`.
 */
import type { MinigameModule } from '@chaos-party/minigame-sdk/babylon';
import { halloBaukasten } from './hallo-baukasten/index.ts';
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
  halloBaukasten,
];

export function getMinigameModule(id: string): MinigameModule | undefined {
  return MINIGAME_MODULES.find((module) => module.info.id === id);
}
