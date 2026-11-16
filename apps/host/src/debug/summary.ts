/**
 * Einzeilige Zusammenfassung der Host-Messwerte zum Kopieren in die Gerätetest-Notizen
 * (CHAOS-45). Rein, damit Format und Rundung getestet sind.
 */
import { formatBytes, formatMs } from '@chaos-party/metrics';
import type { RendererInfo } from '../scene/types.ts';
import type { FrameSnapshot } from './frameMeter.ts';
import type { ScenePerf } from './perfMonitor.ts';

export interface HostInfo {
  /** Kurzform des User-Agents, z. B. „Chrome 139 / Windows“. */
  readonly device: string;
  /** WebGL-Version, Grafikkarte und Auflösung; `null`, solange die Szene fehlt. */
  readonly renderer: RendererInfo | null;
  /** Testmodus (`?test=1`): Frames nur per `stepFrames`, Bildrate ohne Aussage. */
  readonly testMode: boolean;
}

export function formatFps(fps: number | null): string {
  return fps === null || !Number.isFinite(fps) ? '–' : fps.toFixed(1);
}

export function rendererLine(renderer: RendererInfo | null): string {
  if (renderer === null) return 'WebGL ?';
  const quality = renderer.quality ? ` Grafik ${renderer.quality}` : '';
  return `${renderer.api ?? `WebGL${String(renderer.webgl)}`} ${renderer.renderer} ${String(renderer.width)}×${String(renderer.height)}${quality}`;
}

function count(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '–'
    : String(Math.round(value));
}

/**
 * Eine Zeile je Szene (CHAOS-39): Verweildauer, Bildrate, Bildabstand, Render-Zeit, Draw
 * Calls, aktive Meshes, Eingang→Frame (Controller-Eingabe und Brett-Stand), Kontexte,
 * Render-Schleifen, Heap und Bestand.
 */
export function scenePerfLine(perf: ScenePerf): string {
  const { frameTime, renderMs, drawCalls, activeMeshes, inputToFrame, boardToFrame } = perf;
  const resources = perf.resources;
  return [
    `Szene ${perf.scene}`,
    `${String(Math.round(perf.durationMs / 1000))} s`,
    `Frames ${String(perf.frames)}`,
    `fps ${formatFps(perf.fps)}`,
    `Bildabstand ms Median ${formatMs(frameTime?.median ?? null)} p95 ${formatMs(frameTime?.p95 ?? null)} max ${formatMs(frameTime?.max ?? null)}`,
    `Render ms Median ${formatMs(renderMs?.median ?? null)} p95 ${formatMs(renderMs?.p95 ?? null)}`,
    `Draw Calls Median ${count(drawCalls?.median)} max ${count(drawCalls?.max)}`,
    `aktive Meshes Median ${count(activeMeshes?.median)} max ${count(activeMeshes?.max)}`,
    `Eingabe→Frame ms Median ${formatMs(inputToFrame?.median ?? null)} p95 ${formatMs(inputToFrame?.p95 ?? null)} n=${String(inputToFrame?.count ?? 0)}`,
    `Brett→Frame ms Median ${formatMs(boardToFrame?.median ?? null)} p95 ${formatMs(boardToFrame?.p95 ?? null)} n=${String(boardToFrame?.count ?? 0)}`,
    `Kontexte max ${count(perf.contextsMax)}`,
    `Schleifen max ${count(perf.renderLoopsMax)}`,
    `Heap max ${formatBytes(perf.heapMaxBytes)}`,
    `Meshes ${count(resources?.meshes)} Material ${count(resources?.materials)} Texturen ${count(resources?.textures)} (~${formatBytes(resources?.textureBytes ?? null)})`,
    `Pausen ${String(perf.pauses)}`,
  ].join(' | ');
}

/** Mehrzeiliger Bericht für „Alle Szenen kopieren“: Kopf (Gerät, Grafik), je Szene eine Zeile. */
export function scenePerfReport(report: readonly ScenePerf[], info: HostInfo): string {
  const head = [
    `Host${info.testMode ? ' (Testmodus)' : ''} – Messung je Szene`,
    rendererLine(info.renderer),
    info.device,
  ].join(' | ');
  const lines = report.length > 0 ? report.map(scenePerfLine) : ['(noch keine Szene gemessen)'];
  return [head, ...lines].join('\n');
}

export function hostSummaryLine(snapshot: FrameSnapshot, info: HostInfo): string {
  const { frameTime, inputToFrame } = snapshot;
  return [
    `Host${info.testMode ? ' (Testmodus)' : ''}`,
    `fps ${formatFps(snapshot.fps)}`,
    `Bildabstand ms Median ${formatMs(frameTime?.median ?? null)} p95 ${formatMs(frameTime?.p95 ?? null)} max ${formatMs(frameTime?.max ?? null)}`,
    `Eingabe→Frame ms Median ${formatMs(inputToFrame?.median ?? null)} p95 ${formatMs(inputToFrame?.p95 ?? null)} n=${String(inputToFrame?.count ?? 0)}`,
    `Pausen ${String(snapshot.pauses)}`,
    rendererLine(info.renderer),
    info.device,
  ].join(' | ');
}
