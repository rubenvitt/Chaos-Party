/**
 * Pause und vorzeitiges Ende am PC (CHAOS-36, ADR-014).
 *
 * - **Pause-Knopf** oben rechts (Brett und Minispiel) und Tasten **P** und **Esc** → `pause`.
 * - **Pause-Overlay**, sobald der Server-Stand `paused` meldet – sofort aus dem neuesten Stand
 *   (nicht erst nach der Ereignis-Regie) und damit auch nach dem Neuladen des Hosts.
 *   „Weiter“ → `resume`; „Partie beenden“ fragt nach und sendet dann `end-game`.
 * - Tastatur: Fokus liegt auf „Weiter“; P setzt fort, Esc schließt erst die Rückfrage.
 */
import type { BoardView } from '@chaos-party/protocol';
import { useEffect, useRef, useState } from 'react';
import type { HostCommand } from '../net/hostConnection.ts';
import { canPause, pauseKeyAction } from './pauseState.ts';
import './pause.css';

interface PauseControlsProps {
  /** Neuester Server-Stand (nicht der animierte der Regie). */
  readonly view: BoardView | null;
  readonly onCommand: (command: HostCommand) => boolean;
}

export function PauseControls({ view, onCommand }: PauseControlsProps) {
  const [askedToEnd, setConfirming] = useState(false);
  const paused = view?.paused ?? false;
  // Rückfrage gilt nur in der Pause (endet die Pause, ist sie weg).
  const confirming = paused && askedToEnd;
  const pausable = canPause(view);
  const state = useRef({ view, confirming });
  useEffect(() => {
    state.current = { view, confirming };
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const action = pauseKeyAction(event.code, state.current);
      if (!action) return;
      event.preventDefault();
      setConfirming(false);
      if (action !== 'close-confirm') onCommand({ type: action });
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [onCommand]);

  return (
    <>
      {pausable && (
        <button
          type="button"
          className="pause-button"
          data-testid="pause-button"
          title="Pause (P oder Esc)"
          onClick={(event) => {
            setConfirming(false);
            // Fokus nicht auf dem Knopf lassen: Leertaste/Enter steuern Spieler 1/2 (Tastatur).
            event.currentTarget.blur();
            onCommand({ type: 'pause' });
          }}
        >
          <span className="pause-button-icon" aria-hidden="true" />
          Pause
        </button>
      )}
      {paused && (
        <PauseOverlay
          confirming={confirming}
          onResume={() => {
            setConfirming(false);
            onCommand({ type: 'resume' });
          }}
          onAskEnd={() => {
            setConfirming(true);
          }}
          onCancelEnd={() => {
            setConfirming(false);
          }}
          onEnd={() => {
            setConfirming(false);
            onCommand({ type: 'end-game' });
          }}
          round={view ? `Runde ${String(Math.max(1, view.round))}/${String(view.rounds)}` : ''}
        />
      )}
    </>
  );
}

function PauseOverlay({
  confirming,
  round,
  onResume,
  onAskEnd,
  onCancelEnd,
  onEnd,
}: {
  readonly confirming: boolean;
  readonly round: string;
  readonly onResume: () => void;
  readonly onAskEnd: () => void;
  readonly onCancelEnd: () => void;
  readonly onEnd: () => void;
}) {
  const resumeRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    (confirming ? confirmRef : resumeRef).current?.focus();
  }, [confirming]);

  return (
    <div className="pause-overlay" data-testid="pause-overlay" role="dialog" aria-modal="true">
      <section className="pause-card" aria-labelledby="pause-title">
        <p className="pause-kicker">{round}</p>
        <h2 id="pause-title" className="pause-title">
          Pause
        </h2>
        {confirming ? (
          <div className="pause-confirm" data-testid="pause-confirm">
            <p className="pause-lead">
              Partie jetzt beenden? Es zählt der aktuelle Stand – danach kommt sofort die
              Trophäenzählung.
            </p>
            <div className="pause-actions">
              <button
                ref={confirmRef}
                type="button"
                className="pause-action pause-action--danger"
                data-testid="pause-end-confirm"
                onClick={onEnd}
              >
                Ja, beenden
              </button>
              <button
                type="button"
                className="pause-action"
                data-testid="pause-end-cancel"
                onClick={onCancelEnd}
              >
                Zurück
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="pause-lead">Alles steht still – keine Zeit läuft ab.</p>
            <div className="pause-actions">
              <button
                ref={resumeRef}
                type="button"
                className="pause-action pause-action--primary"
                data-testid="pause-resume"
                onClick={onResume}
              >
                Weiter
              </button>
              <button
                type="button"
                className="pause-action"
                data-testid="pause-end"
                onClick={onAskEnd}
              >
                Partie beenden
              </button>
            </div>
          </>
        )}
        <p className="pause-keys">
          <kbd>P</kbd> weiter · <kbd>Esc</kbd> {confirming ? 'zurück' : 'weiter'}
        </p>
      </section>
    </div>
  );
}
