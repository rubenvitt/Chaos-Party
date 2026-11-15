/**
 * Testhaken des Finales unter `window.__chaosFinale` (nur `?test=1`, CHAOS-37).
 * Reine Typdatei, damit `tests/e2e` sie importieren kann.
 *
 * Tempo per URL: `?finale=skip` (sofort Siegerbildschirm, Standard im Testmodus),
 * `?finale=manual` (Uhr steht; nur `advance`/`seek`/`skip` bewegen sie – stabile Screenshots
 * der Trophäenzählung), `?finale=fast` (vierfach), `?finale=normal`.
 */
export interface ChaosFinaleTestHook {
  /** Aktueller Abschnitt: `intro`, `reveal`, `tiebreak`, `winner`. */
  readonly beat: 'intro' | 'reveal' | 'tiebreak' | 'winner';
  readonly beatIndex: number;
  /** Siegerbildschirm erreicht. */
  readonly done: boolean;
  /** 3D-Podest aufgebaut und erstes Bild gerendert. */
  readonly podiumReady: boolean;
  /** Zeitpunkt (ms ab Finale-Beginn), ab dem der Siegerbildschirm steht. */
  readonly winnerAtMs: number;
  /** Uhr um `ms` vorstellen. */
  advance(ms: number): void;
  /** Uhr auf `ms` setzen. */
  seek(ms: number): void;
  /** Direkt zum Siegerbildschirm. */
  skip(): void;
  /** Podest: `frames` Bilder rendern (Testmodus hat keine Render-Schleife). */
  stepPodium(frames: number): void;
}

declare global {
  interface Window {
    __chaosFinale?: ChaosFinaleTestHook;
  }
}
