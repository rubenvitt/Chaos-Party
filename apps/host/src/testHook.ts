import type { PlayerPosition } from './scene/types.ts';

/**
 * Test-Schnittstelle unter `window.__chaos`, nur im Testmodus (`?test=1`).
 * Von Playwright genutzt; reine Typdatei, damit `tests/e2e` sie importieren kann.
 */
export interface ChaosTestHook {
  /** Szene aufgebaut und erstes Bild gerendert. */
  ready: boolean;
  /** Havok-WASM geladen und Physik aktiv. */
  physicsReady: boolean;
  /** Simuliert und rendert `n` Frames à 1/60 s. */
  stepFrames(n: number): void;
  getPlayerPositions(): PlayerPosition[];
}

declare global {
  interface Window {
    __chaos?: ChaosTestHook;
  }
}
