import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { ControllerSession } from '../net/session.ts';
import { selectLink } from '../state/reducer.ts';
import { CONNECTION_INTERRUPTED_EVENT } from './useInterruption.ts';

interface ConnectionStatusProps {
  session: ControllerSession;
}

/** Ab so vielen Versuchen erscheint ein Hinweis auf WLAN und Spiel-PC. */
const HINT_FROM_ATTEMPT = 5;

/**
 * Verbindungsanzeige des Controllers (CHAOS-12, ADR-009), unabhängig von der Zahl der
 * Spielerplätze (iPhone und geteiltes iPad):
 * - verbunden: kleine Pille „verbunden“, stört nicht beim Spielen,
 * - getrennt: großes Overlay „Verbindung verloren – verbinde neu … (Versuch n)“ mit Knopf
 *   „Jetzt neu verbinden“. Es deckt die Bedienflächen ab, sodass niemand ins Leere drückt.
 *
 * Beim Wechsel von verbunden zu getrennt lassen Joysticks und Knöpfe los
 * (`CONNECTION_INTERRUPTED_EVENT`): Nach dem Wiederverbinden steht der Stick auf null,
 * auch wenn der Finger während der Trennung liegen blieb.
 */
export function ConnectionStatus({ session }: ConnectionStatusProps) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const link = selectLink(state);
  const wasOnline = useRef(false);

  useEffect(() => {
    const online = link.kind === 'online';
    if (wasOnline.current && !online) {
      window.dispatchEvent(new Event(CONNECTION_INTERRUPTED_EVENT));
    }
    wasOnline.current = online;
  }, [link.kind]);

  if (link.kind === 'online') {
    return (
      <div
        className="link-pill"
        data-testid="connection-status"
        data-state="online"
        data-rtt={link.rttMs === null ? undefined : Math.round(link.rttMs)}
        role="status"
      >
        <span className="link-dot" aria-hidden="true" />
        <span className="ui-text">verbunden</span>
      </div>
    );
  }

  if (link.kind !== 'reconnecting') return null;

  const title = link.hadSession ? 'Verbindung verloren' : 'Spiel-PC nicht erreichbar';
  return (
    <div
      className="link-overlay"
      data-testid="connection-overlay"
      data-state="reconnecting"
      data-attempt={link.attempt}
      role="alertdialog"
      aria-labelledby="link-title"
      aria-describedby="link-detail"
    >
      <div className="link-card">
        <span className="link-spinner" aria-hidden="true" />
        <h2 id="link-title" className="link-title ui-text">
          {title}
        </h2>
        <p id="link-detail" className="link-detail ui-text" aria-live="polite">
          verbinde neu …{link.attempt > 0 ? ` (Versuch ${link.attempt})` : ''}
        </p>
        {link.attempt >= HINT_FROM_ATTEMPT && (
          <p className="link-hint ui-text" data-testid="connection-hint">
            Gleiches WLAN wie der Spiel-PC? Läuft das Spiel dort noch?
          </p>
        )}
        <button
          type="button"
          className="link-button"
          data-testid="reconnect-now"
          onClick={() => {
            session.retry();
          }}
        >
          <span className="ui-text">Jetzt neu verbinden</span>
        </button>
      </div>
    </div>
  );
}
