import { useCallback, useSyncExternalStore } from 'react';
import type { SlotIntent } from './net/client.ts';
import type { ControllerSession } from './net/session.ts';
import { selectCodeEntryError, selectScreen } from './state/reducer.ts';
import { CodeEntry, ConnectingScreen, ErrorScreen, Toast } from './ui/screens.tsx';
import { SlotController } from './ui/SlotController.tsx';

interface AppProps {
  session: ControllerSession;
  /** Code aus der Eingabe übernehmen (URL aktualisieren, verbinden). */
  onCodeSubmit: (code: string) => void;
}

/**
 * iPhone-Controller: genau ein Spielerplatz (der erste aus `welcome`).
 * Bildschirmwahl über `selectScreen` (reine Funktion, unit-getestet).
 */
export function App({ session, onCodeSubmit }: AppProps) {
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
        <CodeEntry error={selectCodeEntryError(state)} onSubmit={onCodeSubmit} />
      )}
      {screen === 'connecting' && <ConnectingScreen />}
      {screen === 'error' && state.fatal !== null && (
        <ErrorScreen code={state.fatal} onRetry={session.retry} />
      )}
      {screen === 'controller' &&
        (player ? (
          <SlotController
            player={player}
            context={state.contexts[player.slot]}
            feedback={state.feedback[player.slot]}
            send={send}
          />
        ) : (
          <ConnectingScreen />
        ))}
      {state.notice !== null && screen === 'controller' && (
        <Toast key={state.notice.id} notice={state.notice} onDismiss={dismiss} />
      )}
    </div>
  );
}
