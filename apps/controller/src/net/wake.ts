/**
 * „Aufwach“-Signale des Browsers für das automatische Wiederverbinden (CHAOS-12, ADR-009).
 *
 * iOS friert Safari-Tabs bei Bildschirmsperre und App-Wechsel ein; der WebSocket ist danach
 * oft tot, ohne dass ein `close` kam (B7). Sobald die Seite wieder sichtbar ist, das Netz
 * zurück ist oder die Seite aus dem Back-Forward-Cache kommt, prüft die Sitzung die
 * Verbindung sofort, statt auf den nächsten Backoff-Schritt zu warten.
 */

export type WakeReason = 'visible' | 'online' | 'pageshow';

/** Abonniert Aufwach-Signale; liefert die Abmeldung. */
export type WakeSource = (onWake: (reason: WakeReason) => void) => () => void;

/** Signale aus `document`/`window`; `null` außerhalb des Browsers (Unit-Tests in Node). */
export function browserWakeSource(): WakeSource | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;
  return (onWake) => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onWake('visible');
    };
    const onOnline = () => {
      onWake('online');
    };
    const onPageShow = (event: PageTransitionEvent) => {
      // Nur bei Rückkehr aus dem Back-Forward-Cache; ein normales Laden verbindet ohnehin.
      if (event.persisted) onWake('pageshow');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pageshow', onPageShow);
    };
  };
}
