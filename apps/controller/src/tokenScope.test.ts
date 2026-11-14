import { describe, expect, it } from 'vitest';
import { createMemoryTokenStore } from './net/tokenStore.ts';
import { scopeTokenStore } from './tokenScope.ts';

describe('scopeTokenStore', () => {
  it('trennt Tokens nach Platzzahl, iPhone-Modus unverändert', () => {
    const base = createMemoryTokenStore();
    expect(scopeTokenStore(base, 1)).toBe(base);
    base.save('ABCD', 'tok_phone_0000000000');
    const ipad = scopeTokenStore(base, 2);
    // Das iPhone-Token des Tabs gilt nicht für das iPad mit zwei Plätzen.
    expect(ipad.load('ABCD')).toBeNull();
    ipad.save('ABCD', 'tok_ipad_00000000000');
    expect(ipad.load('ABCD')).toBe('tok_ipad_00000000000');
    expect(scopeTokenStore(base, 3).load('ABCD')).toBeNull();
    expect(base.load('ABCD')).toBeNull();
    ipad.clear();
    expect(ipad.load('ABCD')).toBeNull();
  });
});
