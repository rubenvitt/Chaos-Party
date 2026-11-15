/**
 * Messung je Szene für die Debug-Anzeige und die automatischen Messläufe (CHAOS-39,
 * Erweiterung von ADR-010). Ohne Babylon und ohne DOM: Uhr und Szenen kommen von außen.
 *
 * - Jede Szene (Arena in Lobby/Spiel, Brett, jedes Minispiel, Finale, Podest) meldet sich mit
 *   {@link PerfMonitor.attach} an und liefert je Bild Draw Calls, aktive Meshes und
 *   Render-Zeit. Der Name kann sich während der Anmeldung ändern (Brett → Finale); er wird
 *   je Bild neu gelesen.
 * - **Bildabstand** je Anmeldung (Lücken > {@link PAUSE_MS} = Pause, wie im `FrameMeter`).
 * - **Eingang→Frame**: Zeit vom Eintreffen einer Server-Nachricht im Host-JS bis zum Ende des
 *   nächsten Bildes **irgendeiner** angemeldeten Szene, getrennt nach Art: `input`
 *   (Controller-Eingabe, Arena und Minispiele) und `board` (neuer Brett-Stand nach einer
 *   Entscheidung am Controller). Beim An- oder Abmelden einer Szene werden wartende Eingänge
 *   verworfen (sonst zählte die Ladezeit der nächsten Szene als Latenz).
 * - **Umgebung** (alle 500 ms von außen): WebGL-Kontexte, laufende Render-Schleifen, JS-Heap
 *   und Bestand (Meshes, Materialien, Texturen) jeder angemeldeten Szene; daraus Höchstwerte
 *   und die Verweildauer je Szene.
 *
 * Der bisherige Gesamt-`FrameMeter` (obere Zeilen der Anzeige) wird mitgefüttert.
 */
import { RingBuffer, summarize, type Summary } from '@chaos-party/metrics';
import { createFrameMeter, MAX_WAITING_INPUTS, PAUSE_MS, type FrameMeter } from './frameMeter.ts';
import type {
  EnvironmentSample,
  FrameSample,
  InputKind,
  PerfSource,
  ResourceSample,
} from './perfTypes.ts';

/** Bildwerte je Szene: bei 60 fps die letzte Minute. */
export const SCENE_FRAME_SAMPLES = 3600;
/** Eingang→Frame-Werte je Szene und Art. */
export const SCENE_INPUT_SAMPLES = 2000;

export interface ScenePerf {
  readonly scene: string;
  /** Verweildauer (Summe der Umgebungs-Takte, in denen die Szene angemeldet war). */
  readonly durationMs: number;
  readonly frames: number;
  readonly pauses: number;
  /** 1000 / mittlerer Bildabstand; `null` ohne Messung. */
  readonly fps: number | null;
  readonly frameTime: Summary | null;
  readonly renderMs: Summary | null;
  readonly drawCalls: Summary | null;
  readonly activeMeshes: Summary | null;
  readonly inputToFrame: Summary | null;
  readonly boardToFrame: Summary | null;
  /** Höchstwerte des Bestands während der Szene. */
  readonly resources: ResourceSample | null;
  readonly contextsMax: number | null;
  readonly renderLoopsMax: number | null;
  readonly heapMaxBytes: number | null;
}

export interface PerfMonitor {
  /** Gesamtmessung wie bisher (alle Szenen zusammen, nur Controller-Eingaben). */
  readonly meter: FrameMeter;
  /** Szene anmelden; `scene()` liefert den aktuellen Namen. Liefert die Abmeldung. */
  attach(scene: () => string, source: PerfSource): () => void;
  /** Server-Nachricht der Art `kind` ist zur Zeit `at` im Host angekommen. */
  inputReceived(at: number, kind: InputKind): void;
  /** Umgebungs-Takt: Kontexte, Schleifen, Heap; liest den Bestand jeder angemeldeten Szene. */
  sampleEnvironment(environment: EnvironmentSample): void;
  /** Namen der gerade angemeldeten Szenen. */
  activeScenes(): string[];
  /** Kennzahlen je Szene in der Reihenfolge des ersten Auftretens. */
  report(): ScenePerf[];
  /** Alles vergessen (neue Messreihe). */
  reset(): void;
}

interface SceneRecord {
  readonly scene: string;
  durationMs: number;
  frames: number;
  pauses: number;
  readonly frameTimes: RingBuffer;
  readonly renderMs: RingBuffer;
  readonly drawCalls: RingBuffer;
  readonly activeMeshes: RingBuffer;
  readonly latency: Record<InputKind, RingBuffer>;
  resources: ResourceSample | null;
  contextsMax: number | null;
  renderLoopsMax: number | null;
  heapMaxBytes: number | null;
}

interface Attachment {
  readonly scene: () => string;
  readonly source: PerfSource;
  lastFrameAt: number | null;
}

export interface PerfMonitorOptions {
  readonly now?: () => number;
  readonly frameCapacity?: number;
  readonly inputCapacity?: number;
}

function maxOrNull(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.max(a, b);
}

function maxResources(a: ResourceSample | null, b: ResourceSample): ResourceSample {
  if (a === null) return b;
  return {
    meshes: Math.max(a.meshes, b.meshes),
    materials: Math.max(a.materials, b.materials),
    textures: Math.max(a.textures, b.textures),
    textureBytes: Math.max(a.textureBytes, b.textureBytes),
  };
}

export function createPerfMonitor(options: PerfMonitorOptions = {}): PerfMonitor {
  const now = options.now ?? (() => performance.now());
  const frameCapacity = options.frameCapacity ?? SCENE_FRAME_SAMPLES;
  const inputCapacity = options.inputCapacity ?? SCENE_INPUT_SAMPLES;
  const meter = createFrameMeter();
  const records = new Map<string, SceneRecord>();
  const attachments = new Set<Attachment>();
  const waiting: { at: number; kind: InputKind }[] = [];
  let lastEnvironmentAt: number | null = null;

  function record(scene: string): SceneRecord {
    let entry = records.get(scene);
    if (!entry) {
      entry = {
        scene,
        durationMs: 0,
        frames: 0,
        pauses: 0,
        frameTimes: new RingBuffer(frameCapacity),
        renderMs: new RingBuffer(frameCapacity),
        drawCalls: new RingBuffer(frameCapacity),
        activeMeshes: new RingBuffer(frameCapacity),
        latency: { input: new RingBuffer(inputCapacity), board: new RingBuffer(inputCapacity) },
        resources: null,
        contextsMax: null,
        renderLoopsMax: null,
        heapMaxBytes: null,
      };
      records.set(scene, entry);
    }
    return entry;
  }

  function frameEnded(attachment: Attachment, sample: FrameSample): void {
    const at = now();
    meter.frameEnded(at);
    const entry = record(attachment.scene());
    entry.frames += 1;
    if (attachment.lastFrameAt !== null) {
      const gap = at - attachment.lastFrameAt;
      if (gap > PAUSE_MS) entry.pauses += 1;
      else if (gap >= 0) entry.frameTimes.push(gap);
    }
    attachment.lastFrameAt = at;
    entry.renderMs.push(sample.renderMs);
    entry.drawCalls.push(sample.drawCalls);
    entry.activeMeshes.push(sample.activeMeshes);
    for (const input of waiting) {
      const latency = at - input.at;
      if (latency >= 0) entry.latency[input.kind].push(latency);
    }
    waiting.length = 0;
  }

  return {
    meter,
    attach(scene, source) {
      const attachment: Attachment = { scene, source, lastFrameAt: null };
      attachments.add(attachment);
      // Szenenwechsel: Was vorher ankam, löste den Wechsel aus; bis zum ersten Bild der neuen
      // Szene vergeht Ladezeit, keine Eingabelatenz. Solche Eingänge nicht messen.
      waiting.length = 0;
      record(scene());
      const stop = source.onFrameRendered((sample) => {
        frameEnded(attachment, sample);
      });
      return () => {
        stop();
        attachments.delete(attachment);
        waiting.length = 0;
      };
    },
    inputReceived(at, kind) {
      if (!Number.isFinite(at)) return;
      if (kind === 'input') meter.inputReceived(at);
      waiting.push({ at, kind });
      if (waiting.length > MAX_WAITING_INPUTS) waiting.shift();
    },
    sampleEnvironment(environment) {
      const at = now();
      const elapsed = lastEnvironmentAt === null ? 0 : Math.max(0, at - lastEnvironmentAt);
      lastEnvironmentAt = at;
      const seen = new Set<string>();
      for (const attachment of attachments) {
        const entry = record(attachment.scene());
        // Zwei Anmeldungen mit gleichem Namen zählen die Zeit nur einmal.
        if (!seen.has(entry.scene)) entry.durationMs += elapsed;
        seen.add(entry.scene);
        entry.contextsMax = maxOrNull(entry.contextsMax, environment.contexts);
        entry.renderLoopsMax = maxOrNull(entry.renderLoopsMax, environment.renderLoops);
        entry.heapMaxBytes = maxOrNull(entry.heapMaxBytes, environment.heapBytes);
        try {
          entry.resources = maxResources(entry.resources, attachment.source.getResourceStats());
        } catch {
          // Szene wird gerade entsorgt: Bestand dieses Takts auslassen.
        }
      }
    },
    activeScenes() {
      return [...new Set([...attachments].map((attachment) => attachment.scene()))];
    },
    report() {
      return [...records.values()].map((entry): ScenePerf => {
        const frameTime = summarize(entry.frameTimes.values());
        return {
          scene: entry.scene,
          durationMs: entry.durationMs,
          frames: entry.frames,
          pauses: entry.pauses,
          fps: frameTime && frameTime.mean > 0 ? 1000 / frameTime.mean : null,
          frameTime,
          renderMs: summarize(entry.renderMs.values()),
          drawCalls: summarize(entry.drawCalls.values()),
          activeMeshes: summarize(entry.activeMeshes.values()),
          inputToFrame: summarize(entry.latency.input.values()),
          boardToFrame: summarize(entry.latency.board.values()),
          resources: entry.resources,
          contextsMax: entry.contextsMax,
          renderLoopsMax: entry.renderLoopsMax,
          heapMaxBytes: entry.heapMaxBytes,
        };
      });
    },
    reset() {
      records.clear();
      waiting.length = 0;
      lastEnvironmentAt = null;
      for (const attachment of attachments) {
        attachment.lastFrameAt = null;
        record(attachment.scene());
      }
    },
  };
}
