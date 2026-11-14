/**
 * Startparameter des Controllers aus der URL (reine Funktionen, ohne DOM).
 *
 * - `?code=ABCD` – Join-Code aus dem QR-Link (`http://<lan-ip>:8787/?code=ABCD`).
 *   Fehlt er oder ist er ungültig, zeigt der Controller die Code-Eingabe.
 * - `?seats=` / `?mode=ipad` sind für CHAOS-13 (geteiltes iPad) reserviert; der
 *   iPhone-Modus nutzt immer genau einen Platz.
 */
import { JoinCodeSchema } from '@chaos-party/protocol';

/** Länge des Codes, den der Server erzeugt und die Eingabe erwartet (ADR-006). */
export const CODE_LENGTH = 4;

/** Plätze pro Verbindung im iPhone-Modus. */
export const PHONE_SEATS = 1;

export interface LaunchParams {
  /** Gültiger Join-Code (großgeschrieben) oder `null`. */
  joinCode: string | null;
  /** Anzahl Plätze dieser Verbindung; heute immer 1 (iPhone). */
  seats: number;
}

/** Großbuchstaben, nur `A–Z0–9`, höchstens `maxLength` Zeichen – für Eingabe und URL. */
export function normalizeJoinCode(input: string, maxLength = 8): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, maxLength);
}

/** `true`, wenn der (bereits normalisierte) Code dem Protokoll entspricht. */
export function isValidJoinCode(code: string): boolean {
  return JoinCodeSchema.safeParse(code).success;
}

export function parseLaunchParams(search: string): LaunchParams {
  const params = new URLSearchParams(search);
  const raw = params.get('code');
  // Nur Groß-/Kleinschreibung und Leerraum großzügig behandeln; andere Zeichen machen den Code ungültig.
  const candidate = raw === null ? '' : raw.trim().toUpperCase();
  return {
    joinCode: isValidJoinCode(candidate) ? candidate : null,
    seats: PHONE_SEATS,
  };
}

/** Neue Such-Zeichenkette mit gesetztem Code, andere Parameter bleiben erhalten. */
export function withJoinCode(search: string, code: string): string {
  const params = new URLSearchParams(search);
  params.set('code', code);
  return `?${params.toString()}`;
}
