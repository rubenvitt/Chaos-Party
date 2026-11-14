/**
 * Join-Link je Gerät (CHAOS-14): Die Lobby bietet einen QR-Code für das iPhone
 * (ein Platz) und einen für das geteilte iPad (zwei Plätze, `&seats=2`, ADR-008).
 * Rein, damit die Link-Bildung ohne Browser getestet werden kann.
 */

export type JoinDevice = 'phone' | 'ipad';

/** Plätze, mit denen ein geteiltes iPad aus der Lobby beitritt (Controller: `?seats=2`). */
export const IPAD_SEATS = 2;

/**
 * Link für das gewählte Gerät: iPhone = Server-Link unverändert (ohne `seats`/`mode`),
 * iPad = derselbe Link mit `seats=2`. Andere Parameter (`code`) bleiben erhalten.
 * Ungültige URLs kommen unverändert zurück (die Lobby zeigt sie dann nur als Text).
 */
export function joinUrlForDevice(url: string, device: JoinDevice): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  parsed.searchParams.delete('mode');
  if (device === 'ipad') parsed.searchParams.set('seats', String(IPAD_SEATS));
  else parsed.searchParams.delete('seats');
  return parsed.toString();
}
