/**
 * Messung für die Debug-Anzeige des Hosts (CHAOS-45, ADR-010), rein und ohne DOM/Babylon.
 *
 * - **Bildabstand:** Zeit zwischen dem Ende zweier gerenderter Frames; daraus Bildrate
 *   (1000 / Mittelwert) sowie Median und p95. Lücken über {@link PAUSE_MS} (Tab im
 *   Hintergrund, Browser pausiert die Render-Schleife) zählen als Pause, nicht als Frame.
 * - **Eingabe→Frame:** Zeit vom Eintreffen einer `input`-Nachricht des Servers im Host-JS
 *   bis zum Ende des nächsten gerenderten Frames (in dem die Eingabe frühestens sichtbar
 *   ist). Jede Eingabe ergibt einen Messwert; mehrere Eingaben vor demselben Frame messen
 *   jeweils ihre eigene Wartezeit.
 *
 * Zeitstempel kommen von außen (im Browser `performance.now()`), damit Tests sie vorgeben.
 * Nicht enthalten: Netzweg Controller → Server → Host, die Zeit zwischen Ankunft des
 * WebSocket-Pakets und dem JS-Ereignis sowie GPU/Compositor/Bildschirm nach dem Rendern.
 */
import { RingBuffer, summarize, type Summary } from '@chaos-party/metrics';

/** Bildabstände für Kennzahlen: bei 60 fps die letzten 5 s. */
export const FRAME_SAMPLES = 300;
/** Eingabe→Frame-Werte für Kennzahlen (bei ~30 `move`/s je Spieler einige Sekunden). */
export const INPUT_SAMPLES = 300;
/** Längere Lücken zwischen zwei Frames gelten als Pause der Render-Schleife. */
export const PAUSE_MS = 1000;
/** Höchstens so viele Eingaben warten auf ein Bild (Testmodus ohne Render-Schleife). */
export const MAX_WAITING_INPUTS = 256;

export interface FrameSnapshot {
  /** Bilder pro Sekunde aus dem mittleren Bildabstand; `null` ohne Messung. */
  readonly fps: number | null;
  /** Bildabstand in ms (Median, p95 …). */
  readonly frameTime: Summary | null;
  /** Eingang einer Eingabe bis Ende des nächsten Frames in ms. */
  readonly inputToFrame: Summary | null;
  /** Gerenderte Frames insgesamt. */
  readonly frames: number;
  /** Gemessene Eingaben insgesamt. */
  readonly inputs: number;
  /** Erkannte Pausen der Render-Schleife (Lücken > {@link PAUSE_MS}). */
  readonly pauses: number;
}

export interface FrameMeter {
  /** Eine Controller-Eingabe ist zur Zeit `at` im Host angekommen. */
  inputReceived(at: number): void;
  /** Ein Frame ist zur Zeit `at` fertig gerendert. */
  frameEnded(at: number): void;
  snapshot(): FrameSnapshot;
}

export function createFrameMeter(
  frameCapacity = FRAME_SAMPLES,
  inputCapacity = INPUT_SAMPLES,
): FrameMeter {
  const frameTimes = new RingBuffer(frameCapacity);
  const inputToFrame = new RingBuffer(inputCapacity);
  const waiting: number[] = [];
  let lastFrameAt: number | null = null;
  let frames = 0;
  let inputs = 0;
  let pauses = 0;

  return {
    inputReceived(at) {
      if (!Number.isFinite(at)) return;
      waiting.push(at);
      if (waiting.length > MAX_WAITING_INPUTS) waiting.shift();
    },
    frameEnded(at) {
      if (!Number.isFinite(at)) return;
      frames += 1;
      if (lastFrameAt !== null) {
        const gap = at - lastFrameAt;
        if (gap > PAUSE_MS) pauses += 1;
        else if (gap >= 0) frameTimes.push(gap);
      }
      lastFrameAt = at;
      for (const receivedAt of waiting) {
        const latency = at - receivedAt;
        if (latency >= 0) {
          inputToFrame.push(latency);
          inputs += 1;
        }
      }
      waiting.length = 0;
    },
    snapshot() {
      const frameTime = summarize(frameTimes.values());
      return {
        fps: frameTime && frameTime.mean > 0 ? 1000 / frameTime.mean : null,
        frameTime,
        inputToFrame: summarize(inputToFrame.values()),
        frames,
        inputs,
        pauses,
      };
    },
  };
}
