/**
 * Messung für die Debug-Anzeige des Controllers (CHAOS-45, ADR-010), rein und ohne DOM.
 *
 * - **Rundlaufzeit (RTT):** Der Controller schickt `heartbeat { t }` mit seiner eigenen Uhr
 *   (`performance.now()`), der Server spiegelt `t` in `heartbeat-ack` zurück (ADR-003). RTT =
 *   Empfangszeit − `t`. Gezählt werden nur Antworten auf **offene** Proben dieses Messers:
 *   Fremde oder doppelte `t` (alte Verbindung, gefälschte Antwort) ergeben keinen Messwert.
 * - **Eingaben/s:** gesendete Slot-Eingaben (`move`, `press`, …) im letzten Sekundenfenster.
 *
 * Die RTT enthält Funk/WLAN, Server-Verarbeitung und die Ereignisschleifen beider Seiten,
 * aber **nicht** den Weg Server → Host → Bild; dafür misst der Host „Eingabe→Frame“.
 */
import { RingBuffer, summarize, type Summary } from '@chaos-party/metrics';

/** So viele RTT-Werte fließen in Median/p95 ein (bei 1 Probe/s: die letzte Minute). */
export const RTT_SAMPLES = 60;
/** Höchstens so viele unbeantwortete Proben merken; ältere verfallen. */
export const MAX_PENDING_PROBES = 8;
/** Zeitfenster für „Eingaben/s“. */
export const INPUT_WINDOW_MS = 1000;
/** Kapazität für Sende-Zeitpunkte (reicht für 4 iPad-Plätze à 30 `move`/s und Knöpfe). */
const INPUT_TIMESTAMPS = 512;

export interface LatencySnapshot {
  /** Median, p95 usw. der letzten {@link RTT_SAMPLES} RTTs in ms; `null` ohne Messung. */
  readonly rtt: Summary | null;
  /** Letzte RTT in ms. */
  readonly lastRtt: number | null;
  /** Gesendete Proben ohne Antwort (Verlust oder noch unterwegs). */
  readonly pending: number;
  /** Proben ohne Antwort insgesamt (verfallen oder bei Verbindungsverlust verworfen). */
  readonly lost: number;
  /** Gesendete Slot-Eingaben in den letzten {@link INPUT_WINDOW_MS} ms. */
  readonly inputsPerSecond: number;
}

export interface LatencyMeter {
  /** Herzschlag mit Uhrzeit `t` wurde gesendet. */
  probeSent(t: number): void;
  /** `heartbeat-ack { t }` kam zur Zeit `now`; liefert die RTT, wenn `t` eine offene Probe war. */
  ackReceived(t: number, now: number): number | null;
  /** Verbindung weg: offene Proben werden nie beantwortet. */
  connectionLost(): void;
  /** Eine Slot-Eingabe wurde zur Zeit `now` gesendet. */
  inputSent(now: number): void;
  snapshot(now: number): LatencySnapshot;
}

export function createLatencyMeter(capacity = RTT_SAMPLES): LatencyMeter {
  const rtts = new RingBuffer(capacity);
  const inputs = new RingBuffer(INPUT_TIMESTAMPS);
  /** Offene Proben in Sendereihenfolge. */
  const pending: number[] = [];
  let lost = 0;

  return {
    probeSent(t) {
      if (!Number.isFinite(t)) return;
      pending.push(t);
      while (pending.length > MAX_PENDING_PROBES) {
        pending.shift();
        lost += 1;
      }
    },
    ackReceived(t, now) {
      const index = pending.indexOf(t);
      if (index === -1) return null;
      pending.splice(index, 1);
      const rtt = now - t;
      if (!Number.isFinite(rtt) || rtt < 0) return null;
      rtts.push(rtt);
      return rtt;
    },
    connectionLost() {
      lost += pending.length;
      pending.length = 0;
    },
    inputSent(now) {
      inputs.push(now);
    },
    snapshot(now) {
      const since = now - INPUT_WINDOW_MS;
      let recent = 0;
      for (const at of inputs.values()) if (at > since && at <= now) recent += 1;
      return {
        rtt: summarize(rtts.values()),
        lastRtt: rtts.last,
        pending: pending.length,
        lost,
        inputsPerSecond: recent,
      };
    },
  };
}
