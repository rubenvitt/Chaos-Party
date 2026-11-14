import { useCallback, useEffect, useRef } from 'react';

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
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', handle);
      window.removeEventListener('pagehide', handle);
      document.removeEventListener('visibilitychange', onVisibility);
      handle();
    };
  }, [handle]);
}
