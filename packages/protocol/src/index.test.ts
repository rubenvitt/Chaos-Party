import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, isCompatibleVersion } from './index.ts';

describe('isCompatibleVersion', () => {
  it('akzeptiert die eigene Version', () => {
    expect(isCompatibleVersion(PROTOCOL_VERSION)).toBe(true);
  });

  it.each([0, PROTOCOL_VERSION + 1, '1', null, undefined, {}])('lehnt %j ab', (value) => {
    expect(isCompatibleVersion(value)).toBe(false);
  });
});
