/**
 * Öffentliche Typen der Host-Szene. Bewusst ohne Babylon-Importe, damit
 * Netzwerk-, UI- und Testcode die Szene ansprechen können, ohne die Engine zu laden.
 */
import type { FrameSample, ResourceSample } from '../debug/perfTypes.ts';

/** Spielerplatz 1–4 (siehe VISION: 2–4 Personen). */
export type PlayerSlot = 1 | 2 | 3 | 4;

export const PLAYER_SLOTS: readonly PlayerSlot[] = [1, 2, 3, 4];

export function isPlayerSlot(value: number): value is PlayerSlot {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/**
 * Eingabe eines Spielers, wie sie die Szene versteht.
 *
 * - `move`: Stick-Vektor, `x` nach rechts, `y` nach vorn (vom Bildschirm weg),
 *   jeweils −1…1; Länge > 1 wird auf 1 gekürzt. Bleibt gültig, bis ein neuer Wert kommt.
 * - `button`: Taste gedrückt/losgelassen. `dash` = Schubser/Sprint-Stoß.
 *
 * Heute liefert die Tastatur diese Werte, später übersetzt die Netzwerkschicht
 * Controller-Nachrichten (`packages/protocol`) in genau diese Form.
 */
export type PlayerInput =
  | { readonly type: 'move'; readonly x: number; readonly y: number }
  | { readonly type: 'button'; readonly button: PlayerButton; readonly pressed: boolean };

export type PlayerButton = 'dash';

/** Was die Szene über einen Spieler wissen muss. */
export interface ScenePlayer {
  readonly slot: PlayerSlot;
  /** Spielerfarbe als Hex-String `#rrggbb`. */
  readonly color: string;
  readonly label: string;
  /** Getrennte Spieler bleiben stehen und werden halbtransparent gezeigt. */
  readonly connected: boolean;
}

export interface PlayerPosition {
  readonly slot: PlayerSlot;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface GameSceneOptions {
  /** Seed für Startpositionen (und künftig alle szenenseitigen Zufallsentscheidungen). */
  readonly seed: number;
  /**
   * Testmodus: keine Render-Schleife, feste Zeitschritte (1/60 s pro Frame),
   * nur `stepFrames` treibt die Simulation. Für E2E- und Screenshot-Tests.
   */
  readonly testMode?: boolean;
}

/** Grafik-Infos für die Debug-Anzeige (CHAOS-45): was der Browser über die GPU verrät. */
export interface RendererInfo {
  /** WebGL-Version (1 oder 2). */
  readonly webgl: number;
  /** Grafikkarte/Treiber laut WebGL (ggf. unmaskiert), z. B. „ANGLE (NVIDIA …)“. */
  readonly renderer: string;
  readonly vendor: string;
  /** Render-Auflösung in Pixeln (inkl. Gerätepixelverhältnis). */
  readonly width: number;
  readonly height: number;
  /** Grafikstufe des Natur-Looks (CHAOS-62), falls die Szene eine hat. */
  readonly quality?: string;
}

/** Empfänger von Spielereingaben – die Naht zwischen Eingabequelle und Szene. */
export interface PlayerInputSink {
  applyInput(slot: PlayerSlot, input: PlayerInput): void;
}

export interface GameScene extends PlayerInputSink {
  /** Erfüllt, sobald Havok-WASM geladen und die Physik in der Szene aktiv ist. */
  readonly physicsReady: Promise<void>;
  /**
   * Erfüllt, sobald Havok geladen, die Szene aufgebaut und ein erstes Bild gerendert ist.
   * Wird abgelehnt, wenn Havok nicht lädt oder die Szene vorher entsorgt wurde.
   */
  readonly ready: Promise<void>;
  /** Setzt die Spielerliste (hinzufügen, entfernen, Farbe/Name/Verbindung ändern). */
  setPlayers(players: readonly ScenePlayer[]): void;
  /** Nur im Testmodus: `n` Frames simulieren und rendern. */
  stepFrames(n: number): void;
  /** Aktuelle Positionen aller Spielfiguren (Weltkoordinaten, y = oben). */
  getPlayerPositions(): PlayerPosition[];
  /**
   * Meldet das Ende jedes gerenderten Frames (Render-Schleife und `stepFrames`) samt Draw
   * Calls, aktiven Meshes und Render-Zeit, für die Debug-Messung (CHAOS-45, CHAOS-39).
   * Liefert die Abmeldung.
   */
  onFrameRendered(listener: (sample: FrameSample) => void): () => void;
  /** Bestand der Szene für die Debug-Messung (CHAOS-39). */
  getResourceStats(): ResourceSample;
  /** WebGL-Version, Grafikkarte und Auflösung (Debug-Anzeige, CHAOS-45). */
  getRendererInfo(): RendererInfo;
  dispose(): void;
}
