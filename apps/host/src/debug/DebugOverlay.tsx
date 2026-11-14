import { formatMs, shortUserAgent } from '@chaos-party/metrics';
import { useEffect, useRef, useState } from 'react';
import type { RendererInfo } from '../scene/types.ts';
import type { FrameMeter, FrameSnapshot } from './frameMeter.ts';
import { formatFps, hostSummaryLine, rendererLine } from './summary.ts';

/** So oft liest die Anzeige die Messwerte neu (ms). */
const REFRESH_MS = 500;

interface DebugOverlayProps {
  meter: FrameMeter;
  /** Grafik-Infos der aktuellen Szene (`null`, solange keine da ist). */
  getRenderer: () => RendererInfo | null;
  testMode: boolean;
}

type CopyState = 'idle' | 'copied' | 'manual';

/**
 * Messanzeige des Hosts, nur mit `?debug=1` (CHAOS-45, ADR-010): Bildrate, Bildabstand
 * (Median/p95), Eingabe→Frame (Median/p95, Anzahl), Pausen der Render-Schleife, Browser,
 * WebGL-Version, Grafikkarte und Auflösung. „Kopieren“ legt eine Zeile für die
 * Gerätetest-Notizen in die Zwischenablage (sonst Text zum manuellen Kopieren markiert).
 */
export function DebugOverlay({ meter, getRenderer, testMode }: DebugOverlayProps) {
  const [snapshot, setSnapshot] = useState<FrameSnapshot>(() => meter.snapshot());
  const [renderer, setRenderer] = useState<RendererInfo | null>(null);
  const [copy, setCopy] = useState<CopyState>('idle');
  const [device] = useState(() => shortUserAgent(navigator.userAgent));
  const manualRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(meter.snapshot());
      setRenderer(getRenderer());
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [meter, getRenderer]);

  useEffect(() => {
    if (copy !== 'manual') return;
    manualRef.current?.focus();
    manualRef.current?.select();
  }, [copy]);

  const full = `${hostSummaryLine(snapshot, { device, renderer, testMode })} | ${navigator.userAgent}`;

  async function onCopy() {
    let ok = false;
    try {
      if (window.isSecureContext) {
        await navigator.clipboard.writeText(full);
        ok = true;
      }
    } catch {
      ok = false;
    }
    setCopy(ok ? 'copied' : 'manual');
  }

  const { frameTime, inputToFrame } = snapshot;
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
      <div className="debug-device" data-testid="debug-renderer">
        {rendererLine(renderer)}
      </div>
      <div className="debug-device">{device}</div>
      <button
        type="button"
        className="debug-copy"
        data-testid="debug-copy"
        onClick={() => {
          void onCopy();
        }}
      >
        {copy === 'copied' ? 'Kopiert ✓' : 'Kopieren'}
      </button>
      {copy === 'manual' && (
        <textarea
          ref={manualRef}
          className="debug-manual"
          readOnly
          rows={3}
          value={full}
          aria-label="Messwerte zum manuellen Kopieren"
        />
      )}
    </aside>
  );
}
