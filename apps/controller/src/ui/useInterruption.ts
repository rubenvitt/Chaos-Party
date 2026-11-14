import { useCallback, useEffect, useRef } from 'react';

/**
 * Wird auf `window` ausgelöst, wenn die Verbindung zum Spiel-PC abreißt (CHAOS-12,
 * `ConnectionStatus`): Joysticks und Knöpfe lassen dann los wie bei einem Fokusverlust.
 */
export const CONNECTION_INTERRUPTED_EVENT = 'chaos:connection-interrupted';

/** Stabile Funktion, die immer die zuletzt gerenderte Version von `fn` aufruft. */
export function useStableCallback<A extends unknown[]>(
  fn: (...args: A) => void,
): (...args: A) => void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => {
    ref.current(...args);
  }, []);
}

/**
 * Ruft `onInterrupt` auf, wenn der Controller den Fokus verliert (App-Wechsel,
 * Sperrbildschirm, Tab im Hintergrund) **und** wenn die Komponente verschwindet
 * (z. B. neuer Kontext ohne diese Aktion). Laufende Touches enden dann oft ohne
 * `pointerup`; Joystick und Knöpfe lassen deshalb hier selbst los.
 */
export function useInterruption(onInterrupt: () => void): void {
  const handle = useStableCallback(onInterrupt);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') handle();
    };
    window.addEventListener('blur', handle);
    window.addEventListener('pagehide', handle);
    window.addEventListener(CONNECTION_INTERRUPTED_EVENT, handle);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', handle);
      window.removeEventListener('pagehide', handle);
      window.removeEventListener(CONNECTION_INTERRUPTED_EVENT, handle);
      document.removeEventListener('visibilitychange', onVisibility);
      handle();
    };
  }, [handle]);
}
