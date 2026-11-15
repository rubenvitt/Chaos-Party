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
/** RTT-Werte je Szene (CHAOS-39): bei 1 Probe/s die letzten 5 Minuten jeder Szene. */
export const SCENE_RTT_SAMPLES = 300;

/** RTT-Kennzahlen einer Szene (Lobby, Brett, Minispiel …). */
export interface SceneRtt {
  readonly scene: string;
  readonly rtt: Summary | null;
}

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
  /**
   * RTT je Szene in der Reihenfolge des ersten Auftretens (CHAOS-39); maßgeblich ist die
   * Szene beim Eintreffen der Antwort. Leer, solange keine Szene gesetzt ist.
   */
  readonly byScene: readonly SceneRtt[];
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
  /** Aktuelle Szene für die RTT je Szene (`null` = keiner Szene zuordnen). */
  setScene(scene: string | null): void;
  snapshot(now: number): LatencySnapshot;
}

export function createLatencyMeter(capacity = RTT_SAMPLES): LatencyMeter {
  const rtts = new RingBuffer(capacity);
  const inputs = new RingBuffer(INPUT_TIMESTAMPS);
  /** Offene Proben in Sendereihenfolge. */
  const pending: number[] = [];
  let lost = 0;
  const scenes = new Map<string, RingBuffer>();
  let scene: string | null = null;

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
      if (scene !== null) {
        let buffer = scenes.get(scene);
        if (!buffer) {
          buffer = new RingBuffer(SCENE_RTT_SAMPLES);
          scenes.set(scene, buffer);
        }
        buffer.push(rtt);
      }
      return rtt;
    },
    connectionLost() {
      lost += pending.length;
      pending.length = 0;
    },
    inputSent(now) {
      inputs.push(now);
    },
    setScene(next) {
      scene = next;
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
        byScene: [...scenes].map(([name, buffer]) => ({
          scene: name,
          rtt: summarize(buffer.values()),
        })),
      };
    },
  };
}
