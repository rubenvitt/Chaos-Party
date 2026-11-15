/**
 * Babylon-Module aller Minispiele für den Host. Reihenfolge wie `MINIGAME_INFOS`.
 */
import type { MinigameModule } from '@chaos-party/minigame-sdk/babylon';
import { puddingGerangel } from './pudding-gerangel/index.ts';
import { pumpParade } from './pump-parade/index.ts';

export * from './catalog.ts';

export const MINIGAME_MODULES: readonly MinigameModule[] = [pumpParade, puddingGerangel];

export function getMinigameModule(id: string): MinigameModule | undefined {
  return MINIGAME_MODULES.find((module) => module.info.id === id);
}
