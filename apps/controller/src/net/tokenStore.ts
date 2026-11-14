/**
 * Merkt sich das Sitzungs-Token, damit Neuladen, ein neuer Tab nach erneutem
 * QR-Scan oder ein von iOS verworfener Tab per `reconnect` denselben Platz
 * zurückbekommt (CHAOS-12, ADR-009).
 *
 * `localStorage` (seit CHAOS-12, vorher `sessionStorage`): Die iOS-Kamera öffnet
 * jeden QR-Scan in einem **neuen** Tab – mit `sessionStorage` wäre das Token dort
 * weg und ein Spieler käme während des Spiels nicht mehr auf seinen Platz. Öffnen
 * zwei Tabs dasselbe Token, übernimmt der neuere den Platz; der ältere bekommt
 * Close 4003 und verbindet sich nicht von selbst zurück (`session.ts`).
 *
 * Das Token gilt nur für denselben Join-Code (die Platzzahl trennt `tokenScope.ts`,
 * CHAOS-13). Speicherzugriffe können werfen (privater Modus, gesperrte Website-Daten);
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

/** Speicher des Browsers (gerätebezogen, übersteht neue Tabs). */
export function createBrowserTokenStore(): TokenStore {
  return createTokenStore(() => globalThis.localStorage);
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
