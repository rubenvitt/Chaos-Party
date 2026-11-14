import type { PlayerPosition, PlayerSlot } from './scene/types.ts';

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
  /**
   * Zahl der vom Server empfangenen und auf die Szene angewandten Eingaben (CHAOS-11).
   * E2E-Tests warten darauf, bevor sie `stepFrames` aufrufen.
   */
  networkInputs: number;
  /**
   * Letzter vom Server angewandter Stick je Slot (`move`, CHAOS-14). E2E-Tests warten
   * darauf, dass die Stellung eines echten Controllers am Host angekommen ist, bevor
   * sie `stepFrames` aufrufen – statt auf feste Zeiten.
   */
  lastMoves: Partial<Record<PlayerSlot, { x: number; y: number }>>;
}

declare global {
  interface Window {
    __chaos?: ChaosTestHook;
  }
}
