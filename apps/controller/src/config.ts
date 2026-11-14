/**
 * Startparameter des Controllers aus der URL (reine Funktionen, ohne DOM).
 *
 * - `?code=ABCD` – Join-Code aus dem QR-Link (`http://<lan-ip>:8787/?code=ABCD`).
 *   Fehlt er oder ist er ungültig, zeigt der Controller die Code-Eingabe.
 * - `?seats=2|3|4` – geteiltes iPad (CHAOS-13, ADR-008): eine Verbindung mit so vielen
 *   Plätzen, je Platz eine Spielerzone. `?mode=ipad` ohne `seats` bedeutet 2 Plätze.
 *   Fehlt beides (oder `seats=1`), ist es der iPhone-Modus mit genau einem Platz.
 *   Ungültige Werte fallen auf den iPhone-Modus bzw. bei `mode=ipad` auf 2 zurück.
 * - `?debug=1` – Debug-Anzeige mit Rundlaufzeit und Eingaberate für den Gerätetest
 *   (CHAOS-45, ADR-010). Herzschlag dann jede Sekunde statt alle 5 s.
 */
import { JoinCodeSchema } from '@chaos-party/protocol';

/** Länge des Codes, den der Server erzeugt und die Eingabe erwartet (ADR-006). */
export const CODE_LENGTH = 4;

/** Plätze pro Verbindung im iPhone-Modus. */
export const PHONE_SEATS = 1;

/** Standard für das geteilte iPad (`?mode=ipad` ohne `seats`). */
export const IPAD_DEFAULT_SEATS = 2;

/** Höchstzahl Plätze einer Verbindung (Protokoll: `seats` 1–4). */
export const MAX_SEATS = 4;

export interface LaunchParams {
  /** Gültiger Join-Code (großgeschrieben) oder `null`. */
  joinCode: string | null;
  /** Anzahl Plätze dieser Verbindung: 1 (iPhone) oder 2–4 (geteiltes iPad). */
  seats: number;
  /** Debug-Anzeige (`?debug=1` oder `?debug=true`). */
  debug: boolean;
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
    seats: parseSeats(params),
    debug: isFlag(params.get('debug')),
  };
}

function isFlag(value: string | null): boolean {
  const v = value?.trim().toLowerCase();
  return v === '1' || v === 'true';
}

function parseSeats(params: URLSearchParams): number {
  const fallback =
    params.get('mode')?.trim().toLowerCase() === 'ipad' ? IPAD_DEFAULT_SEATS : PHONE_SEATS;
  const raw = params.get('seats')?.trim();
  if (raw === undefined || !/^[1-4]$/.test(raw)) return fallback;
  return Number(raw);
}

/** Neue Such-Zeichenkette mit gesetzter Platzzahl (`mode` entfällt, andere Parameter bleiben). */
export function withSeats(search: string, seats: number): string {
  const params = new URLSearchParams(search);
  params.delete('mode');
  params.set('seats', String(Math.min(Math.max(Math.trunc(seats), PHONE_SEATS), MAX_SEATS)));
  return `?${params.toString()}`;
}

/** Neue Such-Zeichenkette mit gesetztem Code, andere Parameter bleiben erhalten. */
export function withJoinCode(search: string, code: string): string {
  const params = new URLSearchParams(search);
  params.set('code', code);
  return `?${params.toString()}`;
}
