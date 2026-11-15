import type { MinigameInput, MinigameResult, Slot } from '@chaos-party/minigame-sdk';
import type { MinigameHud, RunnerState } from '@chaos-party/minigame-sdk/babylon';

/**
 * Testhaken der Minispiel-Vorschau/-Bühne unter `window.__chaosMinigame` (nur `?test=1`).
 * Im Testmodus läuft keine Render-Schleife: `step(n)` rechnet n feste Schritte und rendert.
 */
export interface ChaosMinigameTestHook {
  ready: boolean;
  readonly id: string;
  readonly state: RunnerState;
  readonly elapsedMs: number;
  readonly result: MinigameResult | null;
  step(frames: number): void;
  input(slot: Slot, input: MinigameInput): void;
  hud(): MinigameHud | null;
}

declare global {
  interface Window {
    __chaosMinigame?: ChaosMinigameTestHook;
  }
}
