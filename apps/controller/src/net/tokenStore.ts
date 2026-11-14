/**
 * Merkt sich das Sitzungs-Token, damit ein Neuladen der Seite per `reconnect`
 * denselben Platz zurückbekommt (Grundlage für CHAOS-12).
 *
 * `sessionStorage`: übersteht Neuladen und das Verwerfen von Hintergrund-Tabs,
 * gilt aber nur für diesen Tab – zwei Tabs auf einem Gerät teilen sich so kein
 * Token. Speicherzugriffe können werfen (privater Modus, gesperrte Website-Daten);
 * dann arbeitet der Controller einfach ohne gemerktes Token.
 */

export interface TokenStore {
  /** Token für diesen Join-Code oder `null`. */
  load(joinCode: string): string | null;
  save(joinCode: string, token: string): void;
  clear(): void;
}

const KEY = 'chaos-party:controller-session';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createTokenStore(getStorage: () => StorageLike | null): TokenStore {
  function storage(): StorageLike | null {
    try {
      return getStorage();
    } catch {
      return null;
    }
  }

  return {
    load(joinCode) {
      try {
        const raw = storage()?.getItem(KEY);
        if (raw === null || raw === undefined) return null;
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'joinCode' in parsed &&
          'token' in parsed &&
          parsed.joinCode === joinCode &&
          typeof parsed.token === 'string'
        ) {
          return parsed.token;
        }
        return null;
      } catch {
        return null;
      }
    },
    save(joinCode, token) {
      try {
        storage()?.setItem(KEY, JSON.stringify({ joinCode, token }));
      } catch {
        // Ohne Speicher kein Wiederverbinden nach Neuladen – das Spiel läuft trotzdem.
      }
    },
    clear() {
      try {
        storage()?.removeItem(KEY);
      } catch {
        // siehe save()
      }
    },
  };
}

/** Speicher des Browsers (Tab-bezogen). */
export function createBrowserTokenStore(): TokenStore {
  return createTokenStore(() => globalThis.sessionStorage);
}

/** Flüchtiger Speicher, z. B. für Tests. */
export function createMemoryTokenStore(): TokenStore {
  const map = new Map<string, string>();
  return createTokenStore(() => ({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  }));
}
