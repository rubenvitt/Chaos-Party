import { describe, expect, it } from 'vitest';
import { createMemoryTokenStore, createTokenStore } from './tokenStore.ts';

describe('TokenStore', () => {
  it('liefert das Token nur für den passenden Code', () => {
    const store = createMemoryTokenStore();
    expect(store.load('ABCD')).toBeNull();
    store.save('ABCD', 'tok_1234567890abcdef');
    expect(store.load('ABCD')).toBe('tok_1234567890abcdef');
    expect(store.load('WXYZ')).toBeNull();
    store.clear();
    expect(store.load('ABCD')).toBeNull();
  });

  it('übersteht werfenden oder fehlenden Speicher (privater Modus)', () => {
    const throwing = createTokenStore(() => ({
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    }));
    expect(() => {
      throwing.save('ABCD', 'x');
    }).not.toThrow();
    expect(throwing.load('ABCD')).toBeNull();
    expect(() => {
      throwing.clear();
    }).not.toThrow();

    const missing = createTokenStore(() => {
      throw new Error('sessionStorage gesperrt');
    });
    expect(missing.load('ABCD')).toBeNull();
  });

  it('ignoriert kaputte Einträge', () => {
    const map = new Map<string, string>([['chaos-party:controller-session', '{kaputt']]);
    const store = createTokenStore(() => ({
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => {
        map.set(k, v);
      },
      removeItem: (k) => {
        map.delete(k);
      },
    }));
    expect(store.load('ABCD')).toBeNull();
    map.set('chaos-party:controller-session', JSON.stringify({ joinCode: 'ABCD', token: 42 }));
    expect(store.load('ABCD')).toBeNull();
  });
});
