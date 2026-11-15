/**
 * Öffentliche Typen der Brett-Szene (CHAOS-18/19). Ohne Babylon-Importe, damit React-,
 * Netzwerk- und Testcode die Szene ansprechen können, ohne die Engine zu laden.
 */
import type { BoardDefinition } from '@chaos-party/game-core';
import type { PlayerPosition, RendererInfo } from '../scene/types.ts';
import type { BoardFrame } from './director.ts';

/** Quelle des Darstellungszustands: die Regie (`createBoardDirector`). */
export interface BoardFrameSource {
  /** Lässt Regie-Zeit vergehen (die Szene ruft das vor jedem Frame auf). */
  advance(ms: number): void;
  getFrame(): BoardFrame;
}

export interface BoardSceneOptions {
  readonly board: BoardDefinition;
  readonly source: BoardFrameSource;
  /**
   * Testmodus: keine Render-Schleife, nur `stepFrames` treibt Regie und Bild (je 1/60 s);
   * Zeichenpuffer bleibt lesbar, Gerätepixelverhältnis 1 (wie die Arena, ADR-004).
   */
  readonly testMode?: boolean;
}

export interface BoardScene {
  /** Erfüllt, sobald Brett, Schrift und erstes Bild stehen. */
  readonly ready: Promise<void>;
  /** Nur im Testmodus: `n` Frames à 1/60 s (Regie + Rendern). */
  stepFrames(n: number): void;
  /** Weltpositionen der Spielfiguren (y = oben), nach Slot sortiert. */
  getPawnPositions(): PlayerPosition[];
  /** Meldet das Ende jedes gerenderten Frames (Debug-Messung). Liefert die Abmeldung. */
  onFrameRendered(listener: () => void): () => void;
  getRendererInfo(): RendererInfo;
  dispose(): void;
}
