/**
 * Entwickler-Ansichten eines einzelnen Minispiels (`?local=1&minigame=…`, mit `&flow=1` der
 * ganze Ablauf): eigene Chunks, nur bei Bedarf geladen (CHAOS-53, `lazyScenes.ts`).
 */
import { lazy } from 'react';
import { loadLocalMinigameFlow, loadMinigamePreview } from '../lazyScenes.ts';

const LocalMinigameFlow = lazy(() =>
  loadLocalMinigameFlow().then((m) => ({ default: m.LocalMinigameFlow })),
);
const MinigamePreview = lazy(() =>
  loadMinigamePreview().then((m) => ({ default: m.MinigamePreview })),
);

export interface DevMinigameViewProps {
  readonly id: string;
  readonly flow: boolean;
  readonly players: number;
  readonly seed: number;
  readonly test: boolean;
}

export function DevMinigameView({ id, flow, players, seed, test }: DevMinigameViewProps) {
  return flow ? (
    <LocalMinigameFlow id={id} players={players} seed={seed} test={test} />
  ) : (
    <MinigamePreview id={id} players={players} seed={seed} test={test} />
  );
}
