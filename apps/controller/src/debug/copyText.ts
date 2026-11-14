/**
 * Text in die Zwischenablage legen (Debug-Anzeige, CHAOS-45).
 *
 * `navigator.clipboard` gibt es nur in sicheren Kontexten (HTTPS oder `localhost`). Der
 * Controller läuft im LAN über `http://<ip>:8787` – auf dem iPhone fehlt die API dort meist.
 * Dann liefert die Funktion `false`, und die Anzeige markiert den Text zum manuellen Kopieren.
 */
export async function copyText(text: string): Promise<boolean> {
  // In unsicheren Kontexten fehlt `clipboard` trotz DOM-Typ.
  const clipboard = navigator.clipboard as Clipboard | undefined;
  if (!clipboard || !window.isSecureContext) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
