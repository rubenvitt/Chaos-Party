/**
 * Öffentliche Typen der Brett-Szene (CHAOS-18/19). Nur Typ-Importe aus Babylon, damit React-,
 * Netzwerk- und Testcode die Szene ansprechen können, ohne die Engine zu laden.
 */
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import type { BoardDefinition } from '@chaos-party/game-core';
import type { CharacterId, SlotNumber } from '@chaos-party/protocol';
import type { FrameSample, ResourceSample } from '../debug/perfTypes.ts';
import type { PlayerPosition, RendererInfo } from '../scene/types.ts';
import type { LightMoodId } from '../lighting/moods.ts';
import type { BoardFrame } from './director.ts';

export interface LightMoodStatus {
  readonly from: LightMoodId;
  readonly to: LightMoodId;
  /** 0…1, 1 = Übergang abgeschlossen. */
  readonly progress: number;
}

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
  /**
   * Bereits gestartete Engine (WebGPU, `?gpu=webgpu`, CHAOS-75). Ohne sie erzeugt die Szene
   * selbst eine WebGL2-Engine. Die Szene übernimmt sie und entsorgt sie mit `dispose()`.
   */
  readonly engine?: AbstractEngine;
}

export interface BoardScene {
  /** Erfüllt, sobald Brett, Schrift und erstes Bild stehen. */
  readonly ready: Promise<void>;
  /** Nur im Testmodus: `n` Frames à 1/60 s (Regie + Animation), danach ein Bild. */
  stepFrames(n: number): void;
  /** Weltpositionen der Spielfiguren (y = oben), nach Slot sortiert. */
  getPawnPositions(): PlayerPosition[];
  /** Figur je Slot, wie in der Szene gebaut (gewählte Figur, v4). */
  getPawnCharacters(): Partial<Record<SlotNumber, CharacterId>>;
  /** Meldet das Ende jedes gerenderten Frames samt Messwerten (Debug). Liefert die Abmeldung. */
  onFrameRendered(listener: (sample: FrameSample) => void): () => void;
  /** Bestand der Szene (Debug-Messung, CHAOS-39). */
  getResourceStats(): ResourceSample;
  getRendererInfo(): RendererInfo;
  /**
   * Lichtverlauf (CHAOS-63): Stimmung, von der und in die gerade überblendet wird, und der
   * Fortschritt (1 = kein Übergang). `null`, solange das Licht noch nicht steht.
   */
  getLightMood(): LightMoodStatus | null;
  /**
   * Brett verdeckt (Finale, CHAOS-39): `true` hält das Rendern an – die Leinwand behält das
   * letzte Bild, die Regie läuft weiter (Stand und HUD bleiben aktuell); `false` rendert wieder.
   * Im Testmodus ohne Wirkung (dort rendert nur `stepFrames`).
   */
  setRenderPaused(paused: boolean): void;
  dispose(): void;
}
