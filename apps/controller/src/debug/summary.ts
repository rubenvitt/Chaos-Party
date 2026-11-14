/**
 * Einzeilige Zusammenfassung der Controller-Messwerte zum Kopieren in die Gerätetest-
 * Notizen (CHAOS-45). Rein, damit Format und Rundung getestet sind.
 */
import { formatMs } from '@chaos-party/metrics';
import type { LatencySnapshot } from './latencyMeter.ts';

export interface ControllerInfo {
  /** Plätze dieser Verbindung (1 = iPhone, 2–4 = geteiltes iPad). */
  readonly seats: number;
  /** Kurzform des User-Agents, z. B. „Safari 18.2 / iOS 18.2“. */
  readonly device: string;
  /** Herzschlag-Abstand in ms. */
  readonly heartbeatMs: number;
}

export function controllerSummaryLine(snapshot: LatencySnapshot, info: ControllerInfo): string {
  const { rtt } = snapshot;
  return [
    `Controller ${info.seats > 1 ? `iPad(${String(info.seats)})` : 'iPhone'}`,
    `RTT ms Median ${formatMs(rtt?.median ?? null)} p95 ${formatMs(rtt?.p95 ?? null)} max ${formatMs(rtt?.max ?? null)} letzte ${formatMs(snapshot.lastRtt)} n=${String(rtt?.count ?? 0)}`,
    `ohne Antwort ${String(snapshot.lost)}`,
    `Eingaben/s ${String(snapshot.inputsPerSecond)}`,
    `Herzschlag ${String(info.heartbeatMs)} ms`,
    info.device,
  ].join(' | ');
}
