/**
 * Sperrliste und Favoriten der Minispiel-Rotation lokal am Host merken (CHAOS-85). Der Server
 * hält sie nur je Session; der Host schickt den gespeicherten Stand beim ersten Lobby-Stand
 * einer Session per `configure` und speichert jede Änderung. Ohne Speicher (privates Fenster,
 * gesperrt) geht nichts kaputt, es wird nur nichts behalten.
 */
import { MAX_ROTATION_MINIGAMES, MinigameIdSchema } from '@chaos-party/protocol';
import type { MinigamePrefs } from './lobbyState.ts';

export const MINIGAME_PREFS_KEY = 'chaos-party:minigame-rotation';

/** Minimaler Ausschnitt von `Storage` (testbar ohne DOM). */
export interface PrefsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): PrefsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Nur wohlgeformte Kennungen, ohne Doppelte, höchstens so viele, wie `configure` erlaubt. */
function idList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter(
    (id): id is string => typeof id === 'string' && MinigameIdSchema.safeParse(id).success,
  );
  return [...new Set(ids)].slice(0, MAX_ROTATION_MINIGAMES);
}

/** Gespeicherter Stand oder `null` (nichts gespeichert, kaputt oder kein Speicher). */
export function loadMinigamePrefs(storage = defaultStorage()): MinigamePrefs | null {
  try {
    const raw = storage?.getItem(MINIGAME_PREFS_KEY);
    if (raw === null || raw === undefined) return null;
    const parsed = JSON.parse(raw) as { blocklist?: unknown; favorites?: unknown } | null;
    if (parsed === null || typeof parsed !== 'object') return null;
    return { blocklist: idList(parsed.blocklist), favorites: idList(parsed.favorites) };
  } catch {
    return null;
  }
}

export function saveMinigamePrefs(prefs: MinigamePrefs, storage = defaultStorage()): void {
  try {
    storage?.setItem(
      MINIGAME_PREFS_KEY,
      JSON.stringify({ blocklist: prefs.blocklist, favorites: prefs.favorites }),
    );
  } catch {
    // Speicher voll oder gesperrt: dann eben nur für diese Session.
  }
}
