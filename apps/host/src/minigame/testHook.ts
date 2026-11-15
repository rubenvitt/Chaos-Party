import type { MinigameInput, MinigameResult, Slot } from '@chaos-party/minigame-sdk';
import type { MinigameHud, RunnerState } from '@chaos-party/minigame-sdk/babylon';

/**
 * Testhaken der Minispiel-Vorschau/-Bühne unter `window.__chaosMinigame` (nur `?test=1`).
 * Im Testmodus läuft keine Render-Schleife: `step(n)` rechnet n feste Schritte und rendert.
 * Reine Typdatei, damit `tests/e2e` sie importieren kann.
 */
export interface ChaosMinigameTestHook {
  /** Minispiel vorbereitet und erstes Bild gerendert. */
  ready: boolean;
  readonly id: string;
  readonly state: RunnerState;
  readonly elapsedMs: number;
  /** Ergebnis des lokalen Runners (nicht autoritativ – das zeigt der Server-Stand). */
  readonly result: MinigameResult | null;
  step(frames: number): void;
  input(slot: Slot, input: MinigameInput): void;
  hud(): MinigameHud | null;
  /** Nur Bühne im Spielablauf/`flow`: angezeigter Abschnitt. */
  readonly stage?: 'intro' | 'play' | 'results';
  /** Nur Bühne: vom Server empfangene und an den Runner gegebene Eingaben je Slot. */
  readonly networkInputs?: Readonly<Partial<Record<Slot, number>>>;
  /** Nur Bühne: Zustand des Ergebnis-Versands (`idle`, `sent`, `accepted` …). */
  readonly resultState?: string | null;
  /** Nur Bühne: gezählte Effekte (im Testmodus stumm und unsichtbar). */
  readonly fx?: { readonly sounds: number; readonly bursts: number; readonly shakes: number };
  /** Nur lokaler Ablauf (`?local=1&minigame=<id>&flow=1`): nächster Abschnitt (Intro → Spiel). */
  next?(): void;
}

declare global {
  interface Window {
    __chaosMinigame?: ChaosMinigameTestHook;
  }
}
