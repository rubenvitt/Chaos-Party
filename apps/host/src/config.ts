/** Start-Parameter des Hosts aus der URL (Entwicklung, Tests, Fehlersuche). */
export interface HostConfig {
  /**
   * Eigenständiger Tastatur-Modus (`?local=1`): keine Server-Verbindung, keine Lobby,
   * `players` lokale Demo-Spieler. Ohne `local` verbindet sich der Host mit dem
   * Session-Server und zeigt Lobby, QR-Code und Join-Code (CHAOS-11, ADR-007).
   */
  readonly local: boolean;
  /** Anzahl lokaler Demo-Spieler im `local`-Modus, 1–4 (`?players=`), Standard 2. */
  readonly players: number;
  /** Seed für Startpositionen (`?seed=`), Standard 2026. */
  readonly seed: number;
  /** Testmodus (`?test=1`): feste Zeitschritte, keine Render-Schleife, `window.__chaos`. */
  readonly test: boolean;
  /**
   * Nach so vielen Sekunden ohne beigetretenen Controller zeigt die Lobby den Hinweis
   * „Firewall/WLAN prüfen“ (`?joinHint=`, Standard 30, Annahme B2).
   */
  readonly joinHintSeconds: number;
}

export const DEFAULT_CONFIG: HostConfig = {
  local: false,
  players: 2,
  seed: 2026,
  test: false,
  joinHintSeconds: 30,
};

function flag(value: string | null): boolean {
  return value === '1' || value === 'true';
}

export function parseHostConfig(search: string): HostConfig {
  const params = new URLSearchParams(search);
  const players = Number.parseInt(params.get('players') ?? '', 10);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  const joinHint = Number.parseInt(params.get('joinHint') ?? '', 10);
  return {
    local: flag(params.get('local')),
    players: Number.isInteger(players) ? Math.min(4, Math.max(1, players)) : DEFAULT_CONFIG.players,
    seed: Number.isInteger(seed) ? seed : DEFAULT_CONFIG.seed,
    test: flag(params.get('test')),
    joinHintSeconds:
      Number.isInteger(joinHint) && joinHint >= 0
        ? Math.min(joinHint, 3600)
        : DEFAULT_CONFIG.joinHintSeconds,
  };
}

/**
 * WebSocket-URL des Session-Servers: immer derselbe Ursprung wie die Seite, Pfad `/ws`.
 * Produktion: Der Node-Server liefert `/host/` und `/ws` auf einem Port (8787).
 * Vite-Dev (5173): Der Dev-Server leitet `/ws` an `localhost:8787` weiter (vite.config.ts).
 */
export function serverWebSocketUrl(location: Pick<Location, 'protocol' | 'host'>): string {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/ws`;
}
