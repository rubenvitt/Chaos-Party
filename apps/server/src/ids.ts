/**
 * Erzeugung von Join-Codes und Controller-Tokens (CHAOS-9, ADR-005).
 *
 * Beides kommt aus `node:crypto`: Der Join-Code ist kurz und zum Abtippen
 * gedacht, das Token ist lang und undurchsichtig und berechtigt zum
 * `reconnect` auf die zugehörigen Slots.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { JoinCodeSchema } from '@chaos-party/protocol';

/** Großbuchstaben und Ziffern ohne leicht verwechselbare Zeichen (0/O, 1/I). */
export const JOIN_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const JOIN_CODE_LENGTH = 4;
/** Bytes Zufall pro Token; ergibt 32 base64url-Zeichen. */
export const TOKEN_BYTES = 24;

export function generateJoinCode(length = JOIN_CODE_LENGTH): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += JOIN_CODE_ALPHABET.charAt(randomInt(JOIN_CODE_ALPHABET.length));
  }
  return code;
}

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** `true`, wenn ein vorgegebener Join-Code (Option/`JOIN_CODE`) dem Protokoll entspricht. */
export function isValidJoinCode(code: string): boolean {
  return JoinCodeSchema.safeParse(code).success;
}
