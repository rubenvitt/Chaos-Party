/**
 * Token nur für dieselbe Platzzahl wiederverwenden (CHAOS-13, ADR-008): Ein Tab,
 * der erst als iPhone (1 Platz) und dann als iPad (`?seats=2`) beitritt, soll per
 * `reconnect` nicht nur den einen alten Platz zurückbekommen. Der iPhone-Modus
 * (`seats` = 1) nutzt den Speicher unverändert.
 */
import type { TokenStore } from './net/tokenStore.ts';

export function scopeTokenStore(store: TokenStore, seats: number): TokenStore {
  if (seats <= 1) return store;
  const key = (joinCode: string) => `${joinCode}@${String(seats)}`;
  return {
    load: (joinCode) => store.load(key(joinCode)),
    save: (joinCode, token) => {
      store.save(key(joinCode), token);
    },
    clear: () => {
      store.clear();
    },
  };
}
