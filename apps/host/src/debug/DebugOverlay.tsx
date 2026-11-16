import { formatBytes, formatMs, shortUserAgent } from '@chaos-party/metrics';
import { useEffect, useRef, useState } from 'react';
import type { RendererInfo } from '../scene/types.ts';
import type { FrameSnapshot } from './frameMeter.ts';
import type { PerfMonitor, ScenePerf } from './perfMonitor.ts';
import { formatFps, hostSummaryLine, rendererLine, scenePerfReport } from './summary.ts';

/** So oft liest die Anzeige die Messwerte neu (ms). */
const REFRESH_MS = 500;

interface DebugOverlayProps {
  monitor: PerfMonitor;
  /** Grafik-Infos der aktuellen Szene (`null`, solange keine da ist). */
  getRenderer: () => RendererInfo | null;
  testMode: boolean;
}

type CopyState =
  { kind: 'idle' } | { kind: 'copied'; what: 'line' | 'scenes' } | { kind: 'manual'; text: string };

/** Ganze Zahl oder „–“. */
function whole(value: number | null | undefined): string {
  return value === null || value === undefined ? '–' : String(Math.round(value));
}

/**
 * Messanzeige des Hosts, nur mit `?debug=1` (CHAOS-45, ADR-010; je Szene CHAOS-39): Bildrate,
 * Bildabstand (Median/p95), Eingabe→Frame (Median/p95, Anzahl), Pausen der Render-Schleife,
 * Browser, WebGL-Version, Grafikkarte und Auflösung; dazu die aktuelle Szene mit Draw Calls,
 * aktiven Meshes, Render-Zeit, WebGL-Kontexten, Render-Schleifen und JS-Heap.
 * „Kopieren“ legt eine Zeile (Gesamtwerte) in die Zwischenablage, „Alle Szenen kopieren“ eine
 * Zeile je bisher gezeigter Szene (sonst Text zum manuellen Kopieren markiert).
 */
export function DebugOverlay({ monitor, getRenderer, testMode }: DebugOverlayProps) {
  const { meter } = monitor;
  const [snapshot, setSnapshot] = useState<FrameSnapshot>(() => meter.snapshot());
  const [scenes, setScenes] = useState<{ active: string[]; report: ScenePerf[] }>(() => ({
    active: monitor.activeScenes(),
    report: monitor.report(),
  }));
  const [renderer, setRenderer] = useState<RendererInfo | null>(null);
  const [copy, setCopy] = useState<CopyState>({ kind: 'idle' });
  const [device] = useState(() => shortUserAgent(navigator.userAgent));
  const manualRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(meter.snapshot());
      setScenes({ active: monitor.activeScenes(), report: monitor.report() });
      setRenderer(getRenderer());
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [meter, monitor, getRenderer]);

  useEffect(() => {
    if (copy.kind !== 'manual') return;
    manualRef.current?.focus();
    manualRef.current?.select();
  }, [copy]);

  const info = { device, renderer, testMode };
  const full = `${hostSummaryLine(snapshot, info)} | ${navigator.userAgent}`;

  async function onCopy(what: 'line' | 'scenes') {
    const text =
      what === 'line' ? full : `${scenePerfReport(monitor.report(), info)}\n${navigator.userAgent}`;
    let ok = false;
    try {
      if (window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      ok = false;
    }
    setCopy(ok ? { kind: 'copied', what } : { kind: 'manual', text });
  }

  const { frameTime, inputToFrame } = snapshot;
  const current = scenes.report.filter((entry) => scenes.active.includes(entry.scene));
  return (
    <aside className="debug-overlay" data-testid="debug-overlay" aria-label="Messwerte">
      <div>
        fps <b data-testid="debug-fps">{formatFps(snapshot.fps)}</b>
        {testMode ? ' (Testmodus)' : ''} · Bildabstand Median{' '}
        <span data-testid="debug-frame-median">{formatMs(frameTime?.median ?? null)}</span> · p95{' '}
        <b data-testid="debug-frame-p95">{formatMs(frameTime?.p95 ?? null)}</b> ms
      </div>
      <div>
        Eingabe→Frame Median{' '}
        <b data-testid="debug-input-median">{formatMs(inputToFrame?.median ?? null)}</b> · p95{' '}
        <b data-testid="debug-input-p95">{formatMs(inputToFrame?.p95 ?? null)}</b> ms · n=
        <span data-testid="debug-input-count">{inputToFrame?.count ?? 0}</span>
      </div>
      <div>
        Frames {snapshot.frames} · Pausen {snapshot.pauses}
      </div>
      {current.map((entry) => (
        <div key={entry.scene} data-testid="debug-scene" data-scene={entry.scene}>
          Szene <b>{entry.scene}</b> · Draw Calls {whole(entry.drawCalls?.median)} · aktive Meshes{' '}
          {whole(entry.activeMeshes?.median)} · Render {formatMs(entry.renderMs?.median ?? null)} ms
          · Kontexte {whole(entry.contextsMax)} · Schleifen {whole(entry.renderLoopsMax)} · Heap{' '}
          {formatBytes(entry.heapMaxBytes)}
        </div>
      ))}
      <div className="debug-device" data-testid="debug-renderer">
        {rendererLine(renderer)}
      </div>
      <div className="debug-device">{device}</div>
      <button
        type="button"
        className="debug-copy"
        data-testid="debug-copy"
        onClick={() => {
          void onCopy('line');
        }}
      >
        {copy.kind === 'copied' && copy.what === 'line' ? 'Kopiert ✓' : 'Kopieren'}
      </button>
      <button
        type="button"
        className="debug-copy"
        data-testid="debug-copy-scenes"
        onClick={() => {
          void onCopy('scenes');
        }}
      >
        {copy.kind === 'copied' && copy.what === 'scenes' ? 'Kopiert ✓' : 'Alle Szenen kopieren'}
      </button>
      {copy.kind === 'manual' && (
        <textarea
          ref={manualRef}
          className="debug-manual"
          readOnly
          rows={4}
          value={copy.text}
          aria-label="Messwerte zum manuellen Kopieren"
        />
      )}
    </aside>
  );
}
