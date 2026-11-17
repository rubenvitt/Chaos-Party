/**
 * Einstieg des Minispiel-Chunks (CHAOS-53): Bühne plus alle Minispiel-Module. Die App kennt
 * nur den reinen Katalog (`@chaos-party/minigames/catalog`) und lädt diese Datei erst, wenn
 * ein Minispiel ansteht (oder vorab in der Lobby, siehe `lazyScenes.ts`).
 */
import { getMinigameModule } from '@chaos-party/minigames';
import { MinigameScreen, type MinigameScreenProps } from './MinigameScreen.tsx';

export interface MinigameScreenByIdProps extends Omit<MinigameScreenProps, 'module'> {
  readonly minigameId: string;
}

export function MinigameScreenById({ minigameId, ...props }: MinigameScreenByIdProps) {
  const module = getMinigameModule(minigameId);
  return module ? <MinigameScreen {...props} module={module} /> : null;
}
