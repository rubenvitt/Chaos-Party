import type { PlayerInputSink } from '../scene/types.ts';

/**
 * Quelle für Spielereingaben. Heute: lokale Tastatur (Entwicklung, Tests).
 * Später: WebSocket-Verbindung zum Server, die Controller-Nachrichten in
 * `PlayerInput` übersetzt. Die Szene kennt nur den `PlayerInputSink`.
 */
export interface InputSource {
  /** Startet die Quelle; gibt eine Funktion zum Stoppen zurück. */
  start(sink: PlayerInputSink): () => void;
}
