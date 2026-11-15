/**
 * Babylon-Module aller Minispiele für den Host. Reihenfolge wie `MINIGAME_INFOS`.
 */
import type { MinigameModule } from '@chaos-party/minigame-sdk/babylon';
import { pumpParade } from './pump-parade/index.ts';

export * from './catalog.ts';

export const MINIGAME_MODULES: readonly MinigameModule[] = [pumpParade];

export function getMinigameModule(id: string): MinigameModule | undefined {
  return MINIGAME_MODULES.find((module) => module.info.id === id);
}
