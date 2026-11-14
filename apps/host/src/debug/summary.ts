/**
 * Einzeilige Zusammenfassung der Host-Messwerte zum Kopieren in die Gerätetest-Notizen
 * (CHAOS-45). Rein, damit Format und Rundung getestet sind.
 */
import { formatMs } from '@chaos-party/metrics';
import type { RendererInfo } from '../scene/types.ts';
import type { FrameSnapshot } from './frameMeter.ts';

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
  return `WebGL${String(renderer.webgl)} ${renderer.renderer} ${String(renderer.width)}×${String(renderer.height)}`;
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
