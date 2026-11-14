/** Start-Parameter des Hosts aus der URL (nur für Entwicklung und Tests). */
export interface HostConfig {
  /** Anzahl lokaler Demo-Spieler, 1–4 (`?players=`), Standard 2. */
  readonly players: number;
  /** Seed für Startpositionen (`?seed=`), Standard 2026. */
  readonly seed: number;
  /** Testmodus (`?test=1`): feste Zeitschritte, keine Render-Schleife, `window.__chaos`. */
  readonly test: boolean;
}

export const DEFAULT_CONFIG: HostConfig = { players: 2, seed: 2026, test: false };

export function parseHostConfig(search: string): HostConfig {
  const params = new URLSearchParams(search);
  const players = Number.parseInt(params.get('players') ?? '', 10);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  const test = params.get('test');
  return {
    players: Number.isInteger(players) ? Math.min(4, Math.max(1, players)) : DEFAULT_CONFIG.players,
    seed: Number.isInteger(seed) ? seed : DEFAULT_CONFIG.seed,
    test: test === '1' || test === 'true',
  };
}
