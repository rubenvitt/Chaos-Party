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
  /**
   * Debug-Anzeige (`?debug=1`, CHAOS-45, ADR-010): Bildrate, Bildabstand und Zeit von einer
   * Controller-Eingabe bis zum nächsten Bild, dazu Browser und Grafikkarte.
   */
  readonly debug: boolean;
  /**
   * Start-Knopf startet die M1-Arena statt des Brettspiels (`?arena=1`, M2): sendet
   * `start { mode: 'arena' }`. Für die M1-Tests und als Testbett für Eingabelatenz.
   */
  readonly arena: boolean;
  /** Rundenzahl für `start` (`?rounds=`, 1–20); `null` = Server-Standard. */
  readonly rounds: number | null;
  /**
   * Lokaler Brett-Modus (`?local=1&board=1`): zeigt das Brett mit festem Beispiel-Spielstand
   * ohne Server (Screenshots, Anschauen). Ohne `local` wirkungslos.
   */
  readonly board: boolean;
  /** Im lokalen Brett-Modus eine kurze Ereignisfolge in Schleife abspielen (`?demo=1`). */
  readonly demo: boolean;
  /**
   * Lokale Minispiel-Vorschau (`?local=1&minigame=<id>`, M3): spielt ein Minispiel ohne
   * Server mit `players` Tastatur-Spielern (Entwicklung, Screenshots). Ohne `local` wirkungslos.
   */
  readonly minigame: string | null;
  /**
   * Mit `minigame`: ganzer Ablauf Intro → Spiel → Ergebnis mit lokalen Zeiten (`&flow=1`, M3) –
   * für Screenshots von Anleitung und Ergebnis ohne Server.
   */
  readonly flow: boolean;
  /** Ton aus (`?mute=1`, CHAOS-33). Im Testmodus ist der Ton immer aus. */
  readonly mute: boolean;
  /** Gesamtlautstärke 0–100 (`?volume=`), Standard 70. */
  readonly volume: number;
  /**
   * Tempo der Trophäenzählung im Finale (`?finale=normal|fast|skip|manual`, CHAOS-37);
   * `null` = Standard (`normal`, im Testmodus `skip`). `manual`: Uhr nur über den Testhaken.
   */
  readonly finale: FinaleSpeed | null;
  /**
   * Grafik-Schnittstelle des Bretts (`?gpu=webgl|webgpu`, CHAOS-75 Renderer-Spike). Standard
   * WebGL2; ohne WebGPU-Adapter fällt `webgpu` auf WebGL2 zurück (Messanzeige zeigt die API).
   */
  readonly gpu: GpuBackend;
}

/** Grafik-Schnittstelle der Host-Szene (CHAOS-75). */
export type GpuBackend = 'webgl' | 'webgpu';
export const GPU_BACKENDS: readonly GpuBackend[] = ['webgl', 'webgpu'];

export type FinaleSpeed = 'normal' | 'fast' | 'skip' | 'manual';
const FINALE_SPEEDS: readonly FinaleSpeed[] = ['normal', 'fast', 'skip', 'manual'];

/** Wirksames Finale-Tempo: Einstellung oder Standard (Testmodus überspringt). */
export function finaleSpeedOf(config: Pick<HostConfig, 'finale' | 'test'>): FinaleSpeed {
  return config.finale ?? (config.test ? 'skip' : 'normal');
}

export const DEFAULT_CONFIG: HostConfig = {
  local: false,
  players: 2,
  seed: 2026,
  test: false,
  joinHintSeconds: 30,
  debug: false,
  arena: false,
  rounds: null,
  board: false,
  demo: false,
  minigame: null,
  flow: false,
  mute: false,
  volume: 70,
  finale: null,
  gpu: 'webgl',
};

/** Höchstzahl Runden (gleich `MAX_ROUNDS` im Protokoll). */
const MAX_ROUNDS = 20;

function flag(value: string | null): boolean {
  return value === '1' || value === 'true';
}

export function parseHostConfig(search: string): HostConfig {
  const params = new URLSearchParams(search);
  const players = Number.parseInt(params.get('players') ?? '', 10);
  const seed = Number.parseInt(params.get('seed') ?? '', 10);
  const joinHint = Number.parseInt(params.get('joinHint') ?? '', 10);
  const rounds = Number.parseInt(params.get('rounds') ?? '', 10);
  const volume = Number.parseInt(params.get('volume') ?? '', 10);
  return {
    local: flag(params.get('local')),
    players: Number.isInteger(players) ? Math.min(4, Math.max(1, players)) : DEFAULT_CONFIG.players,
    seed: Number.isInteger(seed) ? seed : DEFAULT_CONFIG.seed,
    test: flag(params.get('test')),
    joinHintSeconds:
      Number.isInteger(joinHint) && joinHint >= 0
        ? Math.min(joinHint, 3600)
        : DEFAULT_CONFIG.joinHintSeconds,
    debug: flag(params.get('debug')),
    arena: flag(params.get('arena')),
    rounds: Number.isInteger(rounds) ? Math.min(MAX_ROUNDS, Math.max(1, rounds)) : null,
    board: flag(params.get('board')),
    demo: flag(params.get('demo')),
    minigame: /^[a-z0-9-]{3,32}$/.test(params.get('minigame') ?? '')
      ? params.get('minigame')
      : null,
    flow: flag(params.get('flow')),
    mute: flag(params.get('mute')),
    volume: Number.isInteger(volume) ? Math.min(100, Math.max(0, volume)) : DEFAULT_CONFIG.volume,
    finale: FINALE_SPEEDS.find((speed) => speed === params.get('finale')) ?? null,
    gpu: GPU_BACKENDS.find((backend) => backend === params.get('gpu')) ?? DEFAULT_CONFIG.gpu,
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
