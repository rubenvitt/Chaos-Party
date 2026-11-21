import { describe, expect, it } from 'vitest';
import {
  loadMinigamePrefs,
  MINIGAME_PREFS_KEY,
  saveMinigamePrefs,
  type PrefsStorage,
} from './minigamePrefs.ts';

function memory(initial?: string): PrefsStorage & { value: string | null } {
  const store = {
    value: initial ?? null,
    getItem: (key: string) => (key === MINIGAME_PREFS_KEY ? store.value : null),
    setItem: (_key: string, value: string) => {
      store.value = value;
    },
  };
  return store;
}

describe('Sperrliste und Favoriten lokal merken (CHAOS-85)', () => {
  it('speichert und lädt den Stand', () => {
    const storage = memory();
    expect(loadMinigamePrefs(storage)).toBeNull();
    saveMinigamePrefs({ blocklist: ['sockenregen'], favorites: ['wackelturm'] }, storage);
    expect(loadMinigamePrefs(storage)).toEqual({
      blocklist: ['sockenregen'],
      favorites: ['wackelturm'],
    });
  });

  it('übersteht kaputte Daten und fehlenden Speicher', () => {
    expect(loadMinigamePrefs(memory('{kaputt'))).toBeNull();
    expect(loadMinigamePrefs(memory('null'))).toBeNull();
    expect(loadMinigamePrefs(memory('{"blocklist":"x"}'))).toEqual({
      blocklist: [],
      favorites: [],
    });
    // Nur wohlgeformte Kennungen ohne Doppelte (sonst lehnt der Server `configure` ab).
    expect(
      loadMinigamePrefs(
        memory('{"blocklist":["sockenregen","sockenregen","Böse",7],"favorites":["ab"]}'),
      ),
    ).toEqual({ blocklist: ['sockenregen'], favorites: [] });
    expect(loadMinigamePrefs(null)).toBeNull();
    const throwing: PrefsStorage = {
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => {
        throw new Error('voll');
      },
    };
    expect(loadMinigamePrefs(throwing)).toBeNull();
    expect(() => {
      saveMinigamePrefs({ blocklist: [], favorites: [] }, throwing);
    }).not.toThrow();
  });
});
