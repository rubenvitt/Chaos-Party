import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@chaos-party/protocol';
import { errorRemedy, errorSeverity, errorText, type UiErrorCode } from './errors.ts';

const ALL: readonly UiErrorCode[] = [
  ...ERROR_CODES,
  'connection-failed',
  'connection-lost',
  'replaced',
  'game-running',
];

describe('Fehlertexte', () => {
  it('hat für jeden Protokoll- und Verbindungsfehler einen deutschen Text', () => {
    for (const code of ALL) {
      const text = errorText(code);
      expect(text.length).toBeGreaterThan(10);
      // Keine technischen Codes im Text.
      expect(text).not.toContain(code);
      expect(text).not.toMatch(/error|undefined|null/i);
    }
  });

  it('ordnet die wichtigsten Fälle passend ein', () => {
    expect(errorSeverity('bad-join-code')).toBe('code');
    expect(errorSeverity('stale-seq')).toBe('silent');
    expect(errorSeverity('bad-token')).toBe('silent');
    expect(errorSeverity('out-of-phase')).toBe('toast');
    expect(errorSeverity('rate-limited')).toBe('toast');
    expect(errorSeverity('session-full')).toBe('blocking');
    expect(errorSeverity('connection-lost')).toBe('blocking');
    expect(errorSeverity('version-mismatch')).toBe('blocking');
  });

  it('empfiehlt bei neuer Version Neuladen, sonst Neuverbinden', () => {
    expect(errorRemedy('version-mismatch')).toBe('reload');
    expect(errorRemedy('connection-lost')).toBe('retry');
    expect(errorRemedy('session-full')).toBe('retry');
  });

  it('nennt konkrete, verständliche Texte', () => {
    expect(errorText('bad-join-code')).toContain('Code');
    expect(errorText('session-full')).toContain('voll');
    expect(errorText('connection-failed')).toContain('WLAN');
  });
});
