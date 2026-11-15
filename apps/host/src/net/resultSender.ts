/**
 * Versand des Minispiel-Ergebnisses an den Server (M3, CHAOS-26). Rein und ohne Netzwerk:
 * `send` liefert `false`, wenn gerade keine Verbindung besteht.
 *
 * Regeln:
 * - **Genau einmal je Minispiel:** Nur das erste Ergebnis je `minigameId` + `round` zählt.
 * - **Nur solange es gebraucht wird:** gesendet wird nur, während der zuletzt empfangene
 *   Brett-Stand `minigame-play` genau dieses Minispiels zeigt. Zeigt er etwas anderes, hat der
 *   Server schon entschieden (Ergebnis angenommen oder Abbruch) → `accepted` bzw. `expired`.
 * - **Wiederholen nach Verbindungsverlust:** Fällt die Verbindung nach dem Senden weg, ist
 *   unklar, ob die Nachricht ankam. Mit dem ersten Brett-Stand nach dem Wiederverbinden
 *   (Server schickt ihn nach `host-hello`) wird erneut gesendet, wenn er noch
 *   `minigame-play` derselben Runde zeigt – dann kam es nicht an.
 * - **Nicht endlos:** Lehnt der Server ab (`invalid-result`/`out-of-phase`), wird das
 *   protokolliert und nicht wiederholt; höchstens `MAX_RESULT_ATTEMPTS` Sendungen.
 * - **Bestätigung (v4, CHAOS-55):** Der Server antwortet auf jedes Ergebnis mit
 *   `minigame-result-ack`. `accepted: true` → `accepted`, `false` → `rejected` (mit Code in
 *   `lastAck`, für die Debug-Anzeige). Ein `ack` zu einem anderen Minispiel zählt nicht.
 */
import type { BoardView, ErrorMessage, MinigameResultAckMessage } from '@chaos-party/protocol';
import type { MinigameResultPayload } from './hostConnection.ts';

export const MAX_RESULT_ATTEMPTS = 5;

/**
 * - `idle`: noch kein Ergebnis
 * - `pending`: wartet auf Verbindung bzw. passenden Brett-Stand
 * - `sent`: gesendet, Antwort (neuer Brett-Stand) steht aus
 * - `accepted`: Server zeigt die Ergebnisanzeige dieses Minispiels
 * - `expired`: Server ist ohne dieses Ergebnis weiter (Abbruch, andere Phase)
 * - `rejected`: Server hat abgelehnt oder zu viele Versuche
 */
export type ResultSendState = 'idle' | 'pending' | 'sent' | 'accepted' | 'expired' | 'rejected';

export interface ResultSender {
  readonly state: ResultSendState;
  /** Sendungen des aktuellen Ergebnisses. */
  readonly attempts: number;
  /** Ergebnis des Runners. Weitere Ergebnisse desselben Minispiels werden ignoriert. */
  submit(result: MinigameResultPayload): void;
  /** Jeder empfangene Brett-Stand (auch Schnappschüsse nach dem Wiederverbinden). */
  onView(view: BoardView | null): void;
  /** Verbindung verloren (Status ≠ verbunden). */
  onDisconnected(): void;
  /** Fehlermeldung des Servers. */
  onError(error: Pick<ErrorMessage, 'code' | 'message'>): void;
  /** Bestätigung des Servers zu einem Ergebnis (v4). */
  onAck(ack: Omit<MinigameResultAckMessage, 'v' | 'type'>): void;
  /** Letzte Bestätigung zum aktuellen Ergebnis oder `null`. */
  readonly lastAck: Omit<MinigameResultAckMessage, 'v' | 'type'> | null;
  /**
   * Sendefunktion der aktuellen Verbindung (`false` = gerade nicht verbunden) oder `null`.
   * Wird nachträglich gesetzt, weil die Verbindung jünger ist als der Versand.
   */
  setTransport(send: ((result: MinigameResultPayload) => boolean) | null): void;
}

export interface ResultSenderOptions {
  readonly send?: (result: MinigameResultPayload) => boolean;
  readonly warn?: (message: string) => void;
}

type Relation = 'playing' | 'results' | 'aborted' | 'other' | 'unknown';

function relationOf(view: BoardView | null, result: MinigameResultPayload): Relation {
  if (!view) return 'unknown';
  const minigame = view.minigame;
  const same = minigame?.id === result.minigameId && minigame.round === result.round;
  if (!same) return 'other';
  if (view.gamePhase === 'minigame-play') return 'playing';
  if (view.gamePhase === 'minigame-results') return minigame.aborted ? 'aborted' : 'results';
  // Intro desselben Minispiels: (noch) nicht erwartet – abwarten.
  if (view.gamePhase === 'minigame-intro') return 'unknown';
  return 'other';
}

export function createResultSender(options: ResultSenderOptions = {}): ResultSender {
  const warn =
    options.warn ??
    ((message: string) => {
      console.warn(message);
    });
  let current: MinigameResultPayload | null = null;
  let state: ResultSendState = 'idle';
  let attempts = 0;
  let latest: BoardView | null = null;
  let send = options.send ?? null;
  let lastAck: Omit<MinigameResultAckMessage, 'v' | 'type'> | null = null;

  const keyOf = (result: MinigameResultPayload) => `${result.minigameId}:${String(result.round)}`;

  /** Wertet den letzten Stand aus und sendet, wenn nötig und möglich. */
  function update() {
    if (!current || (state !== 'pending' && state !== 'sent')) return;
    const relation = relationOf(latest, current);
    switch (relation) {
      case 'results':
        state = 'accepted';
        return;
      case 'aborted':
      case 'other':
        state = 'expired';
        warn(`Minispiel-Ergebnis ${keyOf(current)} nicht mehr gebraucht (Server ist weiter)`);
        return;
      case 'unknown':
        return;
      case 'playing':
        if (state !== 'pending') return;
        if (attempts >= MAX_RESULT_ATTEMPTS) {
          state = 'rejected';
          warn(`Minispiel-Ergebnis ${keyOf(current)}: zu viele Versuche, gebe auf`);
          return;
        }
        if (send?.(current)) {
          attempts++;
          state = 'sent';
        }
        return;
    }
  }

  return {
    get state() {
      return state;
    },
    get attempts() {
      return attempts;
    },
    get lastAck() {
      return lastAck;
    },
    submit(result) {
      if (current && keyOf(current) === keyOf(result)) return;
      current = result;
      state = 'pending';
      attempts = 0;
      lastAck = null;
      update();
    },
    onView(view) {
      latest = view;
      update();
    },
    onDisconnected() {
      // Ob die Nachricht ankam, zeigt erst der nächste Brett-Stand nach dem Wiederverbinden.
      if (state === 'sent') state = 'pending';
    },
    setTransport(next) {
      send = next;
      update();
    },
    onError(error) {
      // `out-of-phase` kann seit v4 auch einen Steuerbefehl (Pause …) betreffen; über das
      // Ergebnis entscheidet dann das `ack`. `invalid-result` gehört immer zum Ergebnis.
      if (error.code !== 'invalid-result') return;
      if (state !== 'sent' || !current) return;
      state = 'rejected';
      warn(`Server lehnt Minispiel-Ergebnis ${keyOf(current)} ab: ${error.message}`);
    },
    onAck(ack) {
      if (ack.minigameId !== current?.minigameId || ack.round !== current.round) return;
      lastAck = ack;
      if (ack.accepted) {
        state = 'accepted';
        return;
      }
      state = 'rejected';
      warn(`Server lehnt Minispiel-Ergebnis ${keyOf(current)} ab (${ack.code ?? 'ohne Code'})`);
    },
  };
}
