import { formatMs, shortUserAgent } from '@chaos-party/metrics';
import { useEffect, useRef, useState } from 'react';
import { copyText } from './copyText.ts';
import type { LatencyMeter, LatencySnapshot } from './latencyMeter.ts';
import { controllerSummaryLine } from './summary.ts';

/** So oft liest die Anzeige die Messwerte neu (ms). */
const REFRESH_MS = 500;

interface DebugOverlayProps {
  meter: LatencyMeter;
  seats: number;
  heartbeatMs: number;
}

type CopyState = 'idle' | 'copied' | 'manual';

/**
 * Kleine Messanzeige des Controllers, nur mit `?debug=1` (CHAOS-45, ADR-010): Rundlaufzeit
 * Controller ↔ Server (Median, p95, letzte, Anzahl), unbeantwortete Proben, gesendete
 * Eingaben pro Sekunde und das Gerät (Herzschlag-Abstand nur in der kopierten Zeile, damit
 * die Anzeige im Hochformat neben die Knöpfe passt). „Kopieren“ legt eine Zeile für die Gerätetest-
 * Notizen in die Zwischenablage; geht das nicht (LAN ohne HTTPS), wird die Zeile zum
 * manuellen Kopieren markiert. Fängt außer dem Knopf keine Touches ab.
 */
export function DebugOverlay({ meter, seats, heartbeatMs }: DebugOverlayProps) {
  const [snapshot, setSnapshot] = useState<LatencySnapshot>(() =>
    meter.snapshot(performance.now()),
  );
  const [copy, setCopy] = useState<CopyState>('idle');
  const [device] = useState(() => shortUserAgent(navigator.userAgent));
  const manualRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setSnapshot(meter.snapshot(performance.now()));
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
    };
  }, [meter]);

  const line = controllerSummaryLine(snapshot, { seats, device, heartbeatMs });

  useEffect(() => {
    if (copy !== 'manual') return;
    manualRef.current?.focus();
    manualRef.current?.select();
  }, [copy]);

  function onCopy() {
    const full = `${line} | ${navigator.userAgent}`;
    void copyText(full).then((ok) => {
      setCopy(ok ? 'copied' : 'manual');
    });
  }

  const { rtt } = snapshot;
  return (
    <aside
      className="debug-overlay"
      data-testid="debug-overlay"
      data-heartbeat-ms={heartbeatMs}
      aria-label="Messwerte"
    >
      <div>
        RTT Median <b data-testid="debug-rtt-median">{formatMs(rtt?.median ?? null)}</b> · p95{' '}
        <b data-testid="debug-rtt-p95">{formatMs(rtt?.p95 ?? null)}</b> ms
      </div>
      <div>
        letzte <span data-testid="debug-rtt-last">{formatMs(snapshot.lastRtt)}</span> ms · n=
        <span data-testid="debug-rtt-count">{rtt?.count ?? 0}</span>
      </div>
      <div>
        Eingaben/s <span data-testid="debug-inputs">{snapshot.inputsPerSecond}</span> · ohne Antwort{' '}
        {snapshot.lost}
      </div>
      <div className="debug-device">{device}</div>
      <button type="button" className="debug-copy" data-testid="debug-copy" onClick={onCopy}>
        {copy === 'copied' ? 'Kopiert ✓' : 'Kopieren'}
      </button>
      {copy === 'manual' && (
        <textarea
          ref={manualRef}
          className="debug-manual"
          data-testid="debug-manual"
          readOnly
          rows={3}
          value={`${line} | ${navigator.userAgent}`}
          aria-label="Messwerte zum manuellen Kopieren"
        />
      )}
    </aside>
  );
}
