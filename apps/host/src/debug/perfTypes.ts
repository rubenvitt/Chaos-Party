/**
 * Typen der Szenen-Messung (CHAOS-39), ohne Babylon-Importe: Szenen, React-Schicht und Tests
 * sprechen darüber, ohne die Engine zu laden.
 */

/** Messwerte eines gerenderten Bildes. */
export interface FrameSample {
  /** WebGL-Zeichenaufrufe in diesem Bild (inkl. Schattenkarte). */
  readonly drawCalls: number;
  /** Meshes, die Babylon in diesem Bild als sichtbar ausgewählt hat. */
  readonly activeMeshes: number;
  /** JS-Zeit von `scene.render()` in ms (ohne GPU; mit SwiftShader inkl. Software-Rendering). */
  readonly renderMs: number;
}

/** Bestand einer Szene (Momentaufnahme). */
export interface ResourceSample {
  readonly meshes: number;
  readonly materials: number;
  readonly textures: number;
  /** Geschätzter Texturspeicher in Bytes (Breite · Höhe · 4, Würfel ·6, Mipmaps ·4/3). */
  readonly textureBytes: number;
}

/** Zustand der ganzen Seite (alle Szenen zusammen). */
export interface EnvironmentSample {
  /** Lebende Babylon-Engines = WebGL-Kontexte der Seite. */
  readonly contexts: number;
  /** Laufende Render-Schleifen über alle Engines. */
  readonly renderLoops: number;
  /** Belegter JS-Heap in Bytes (`performance.memory`, nur Chromium); sonst `null`. */
  readonly heapBytes: number | null;
}

/** Was eine Szene der Messung anbietet (Arena, Brett, Minispiel-Bühne, Podest). */
export interface PerfSource {
  /** Meldet das Ende jedes gerenderten Bildes samt Messwerten. Liefert die Abmeldung. */
  onFrameRendered(listener: (sample: FrameSample) => void): () => void;
  getResourceStats(): ResourceSample;
}

/** Art eines eingehenden Server-Ereignisses, das ein neues Bild auslöst. */
export type InputKind = 'input' | 'board';
