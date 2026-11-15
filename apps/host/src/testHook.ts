import type { GamePhaseName } from '@chaos-party/protocol';
import type { PlayerPosition, PlayerSlot } from './scene/types.ts';

/**
 * Zusatz-Testhaken der Brettphase (M2, CHAOS-18/19/20) unter `window.__chaos.board`.
 * Damit warten E2E-Tests ereignisgesteuert auf Animationen und Server-Nachrichten.
 */
export interface ChaosBoardTestHook {
  /** Brett-Szene aufgebaut und erstes Bild gerendert. */
  ready: boolean;
  /** Spielt die Regie gerade Ereignisse ab (Figur hüpft, Popup läuft …)? */
  readonly animating: boolean;
  /** Gespielte oder übersprungene Brett-Ereignisse seit dem Laden. */
  readonly eventsProcessed: number;
  /** Nächste erwartete `eventSeq` (`null` vor der ersten `board`-Nachricht). */
  readonly nextEventSeq: number | null;
  /** Angenommene `board`-Nachrichten. */
  readonly messagesReceived: number;
  /** Sprünge ohne Animation (erste Nachricht, Lücke in `eventSeq`, Rückstand). */
  readonly jumps: number;
  /**
   * Regie-Zeit vorspulen, ohne zu rendern (schnell; SwiftShader braucht je Frame viel Zeit).
   * Danach zeigt erst das nächste `stepFrames` das Bild dazu.
   */
  advance(ms: number): void;
  /** Feld je Slot, wie gerade gezeigt (beim Hüpfen: Absprungfeld). */
  getPawnSpaces(): Partial<Record<PlayerSlot, string>>;
  /** Kurzfassung des HUD: übernommene Phase, wer dran ist, sichtbare Meldungen. */
  getHud(): { gamePhase: GamePhaseName | null; activeSlot: PlayerSlot | null; messages: string[] };
  /**
   * Nur im lokalen Brett-Modus (`?local=1&board=1`): eine `board`-Nachricht einspeisen, als
   * käme sie vom Server (wird mit dem Protokoll-Parser geprüft; `false` = ungültig).
   */
  receive?(message: unknown): boolean;
  /** Nur lokal: die Demo-Folge (`createDemoMessages`), Index 0 = Startstand. */
  demoMessages?: readonly unknown[];
}

/**
 * Test-Schnittstelle unter `window.__chaos`, nur im Testmodus (`?test=1`).
 * Von Playwright genutzt; reine Typdatei, damit `tests/e2e` sie importieren kann.
 */
export interface ChaosTestHook {
  /** Szene aufgebaut und erstes Bild gerendert. */
  ready: boolean;
  /** Havok-WASM geladen und Physik aktiv. */
  physicsReady: boolean;
  /** Simuliert und rendert `n` Frames à 1/60 s. */
  stepFrames(n: number): void;
  getPlayerPositions(): PlayerPosition[];
  /**
   * Zahl der vom Server empfangenen und auf die Szene angewandten Eingaben (CHAOS-11).
   * E2E-Tests warten darauf, bevor sie `stepFrames` aufrufen.
   */
  networkInputs: number;
  /**
   * Letzter vom Server angewandter Stick je Slot (`move`, CHAOS-14). E2E-Tests warten
   * darauf, dass die Stellung eines echten Controllers am Host angekommen ist, bevor
   * sie `stepFrames` aufrufen – statt auf feste Zeiten.
   */
  lastMoves: Partial<Record<PlayerSlot, { x: number; y: number }>>;
  /**
   * Welche Szene gerade läuft (M2): `arena` (Lobby und M1-Arena) oder `board` (Brettphase).
   * In der Brettphase liefern `stepFrames`/`getPlayerPositions` die Brett-Szene bzw. die
   * Figuren, `physicsReady` ist `false` (das Brett braucht kein Havok).
   */
  scene?: 'arena' | 'board';
  /** Nur in der Brettphase. */
  board?: ChaosBoardTestHook;
}

declare global {
  interface Window {
    __chaos?: ChaosTestHook;
  }
}
