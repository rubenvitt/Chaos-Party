/**
 * Entwickler-Ansichten eines einzelnen Minispiels (`?local=1&minigame=…`, mit `&flow=1` der
 * ganze Ablauf): eigene Chunks, nur bei Bedarf geladen (CHAOS-53, `lazyScenes.ts`).
 */
import { lazy } from 'react';
import type { LocalReadiness } from '../config.ts';
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
  /** Kurze Anleitung wie bei Wiederholung in der Partie (`&repeat=1`, CHAOS-66). */
  readonly repeat: boolean;
  /** Anleitung wartet auf Bereitschaft (`&ready=`, CHAOS-214); `null` = feste Zeit. */
  readonly ready?: LocalReadiness | null;
}

export function DevMinigameView({
  id,
  flow,
  players,
  seed,
  test,
  repeat,
  ready = null,
}: DevMinigameViewProps) {
  return flow ? (
    <LocalMinigameFlow
      id={id}
      players={players}
      seed={seed}
      test={test}
      repeat={repeat}
      readiness={ready}
    />
  ) : (
    <MinigamePreview id={id} players={players} seed={seed} test={test} />
  );
}
