import { JoinCodeSchema, SessionTokenSchema } from '@chaos-party/protocol';
import { describe, expect, it } from 'vitest';
import { generateJoinCode, generateToken, isValidJoinCode, JOIN_CODE_ALPHABET } from './ids.ts';

describe('Join-Code und Token', () => {
  it('erzeugt 4-stellige Codes ohne verwechselbare Zeichen', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code).toHaveLength(4);
      expect(JoinCodeSchema.safeParse(code).success).toBe(true);
      expect(code).not.toMatch(/[01IO]/);
    }
    expect(JOIN_CODE_ALPHABET).toHaveLength(32);
  });

  it('erzeugt lange, protokollkonforme, verschiedene Tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) {
      expect(token).toHaveLength(32);
      expect(SessionTokenSchema.safeParse(token).success).toBe(true);
    }
  });

  it('prüft vorgegebene Join-Codes', () => {
    expect(isValidJoinCode('PARTY1')).toBe(true);
    expect(isValidJoinCode('abc')).toBe(false);
    expect(isValidJoinCode('ABCDEFGHI')).toBe(false);
  });
});
