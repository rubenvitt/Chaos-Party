import { useCallback, useSyncExternalStore } from 'react';
import { DebugOverlay } from './debug/DebugOverlay.tsx';
import type { LatencyMeter } from './debug/latencyMeter.ts';
import { controllerScene } from './debug/sceneLabel.ts';
import type { SlotIntent } from './net/client.ts';
import type { ControllerSession } from './net/session.ts';
import { selectCodeEntryError, selectScreen } from './state/reducer.ts';
import { ConnectionStatus } from './ui/ConnectionStatus.tsx';
import { CodeEntry, ConnectingScreen, ErrorScreen, Toast } from './ui/screens.tsx';
import { SlotController } from './ui/SlotController.tsx';
import { ZoneBoard } from './ui/ZoneBoard.tsx';

interface AppProps {
  session: ControllerSession;
  /** Code aus der Eingabe übernehmen (URL aktualisieren, verbinden). */
  onCodeSubmit: (code: string) => void;
  /** Gewünschte Plätze dieser Verbindung (1 = iPhone, 2–4 = geteiltes iPad). */
  seats: number;
  /** Modus in der Code-Eingabe wechseln (iPhone ↔ iPad). */
  onSeatsChange: (seats: number) => void;
  /** Nur mit `?debug=1`: Messer und Herzschlag-Abstand für die Messanzeige (CHAOS-45). */
  debug?: { readonly meter: LatencyMeter; readonly heartbeatMs: number } | undefined;
}

/**
 * Controller: Bildschirmwahl über `selectScreen` (reine Funktion, unit-getestet).
 * Ein Platz aus `welcome` → iPhone-Ansicht (`SlotController`); mehrere Plätze →
 * geteiltes iPad mit einer Zone pro Platz (`ZoneBoard`, CHAOS-13).
 */
export function App({ session, onCodeSubmit, seats, onSeatsChange, debug }: AppProps) {
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const screen = selectScreen(state);
  const send = useCallback(
    (intent: SlotIntent) => {
      session.sendIntent(intent);
    },
    [session],
  );
  const dismiss = useCallback(
    (id: number) => {
      session.dismissNotice(id);
    },
    [session],
  );

  const player = state.players[0];

  return (
    <div className="app" data-screen={screen}>
      {screen === 'code-entry' && (
        <CodeEntry
          error={selectCodeEntryError(state)}
          onSubmit={onCodeSubmit}
          seats={seats}
          onSeatsChange={onSeatsChange}
        />
      )}
      {screen === 'connecting' && <ConnectingScreen />}
      {screen === 'error' && state.fatal !== null && (
        <ErrorScreen code={state.fatal} onRetry={session.retry} />
      )}
      {screen === 'controller' &&
        (state.players.length > 1 ? (
          <ZoneBoard
            players={state.players}
            contexts={state.contexts}
            feedback={state.feedback}
            choices={state.choices}
            picks={state.picks}
            send={send}
          />
        ) : player ? (
          <SlotController
            player={player}
            context={state.contexts[player.slot]}
            feedback={state.feedback[player.slot]}
            pending={state.choices[player.slot]}
            pick={state.picks[player.slot]}
            players={state.players}
            send={send}
          />
        ) : (
          <ConnectingScreen />
        ))}
      <ConnectionStatus session={session} />
      {debug && (
        <DebugOverlay
          meter={debug.meter}
          seats={seats}
          heartbeatMs={debug.heartbeatMs}
          scene={controllerScene(player ? state.contexts[player.slot] : undefined)}
        />
      )}
      {state.notice !== null && screen === 'controller' && (
        <Toast key={state.notice.id} notice={state.notice} onDismiss={dismiss} />
      )}
    </div>
  );
}
