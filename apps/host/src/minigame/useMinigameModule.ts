/**
 * Minispiel-Modul für die Bühne (CHAOS-86): je Spiel ein eigener Chunk, geladen über
 * `@chaos-party/minigames/lazy`. Ist das Modul schon da (vorgeladen oder Wiederholung), kommt
 * es synchron; sonst wartet die Komponente per Suspense auf den Import. Fehlschläge gehen an
 * die nächste Fehlergrenze bzw. lösen `vite:preloadError` aus (`lazyScenes.ts`).
 *
 * `undefined` = unbekannte Kennung.
 */
import type { MinigameModule } from '@chaos-party/minigame-sdk/babylon';
import { loadedMinigameModule, loadMinigameModule } from '@chaos-party/minigames/lazy';
import { use } from 'react';

export function useMinigameModule(id: string): MinigameModule | undefined {
  const ready = loadedMinigameModule(id);
  if (ready) return ready;
  const pending = loadMinigameModule(id);
  return pending ? use(pending) : undefined;
}
