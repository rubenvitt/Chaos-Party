/**
 * Daumen-Stimmen in einer JSON-Datei (CHAOS-87): Unter Node bleiben die Stimmen über Neustarts
 * erhalten. Geschrieben wird nach jeder Stimme (wenige je Minispiel) über eine Zwischendatei und
 * `rename`, damit ein Absturz keine halbe Datei hinterlässt. Eine kaputte Datei wird nicht
 * überschrieben, sondern beiseitegelegt (`.kaputt-<Zeit>`).
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MinigameIdSchema, SlotSchema, VoteSchema } from '@chaos-party/protocol';
import { createMemoryRatingStore, type RatingStore, type StoredRatingVote } from './ratings.ts';

const FILE_VERSION = 1;

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

/** Prüft eine Stimme aus der Datei (gleiche Grenzen wie im Protokoll). */
function parseStoredVote(value: unknown): StoredRatingVote | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Record<string, unknown>;
  const slot = SlotSchema.safeParse(entry.slot);
  const minigameId = MinigameIdSchema.safeParse(entry.minigameId);
  const vote = VoteSchema.safeParse(entry.vote);
  if (!slot.success || !minigameId.success || !vote.success) return null;
  if (!isText(entry.play, 128) || !isText(entry.at, 64) || typeof entry.practice !== 'boolean') {
    return null;
  }
  return {
    play: entry.play,
    slot: slot.data,
    minigameId: minigameId.data,
    vote: vote.data,
    practice: entry.practice,
    at: entry.at,
  };
}

function parseFile(raw: string): StoredRatingVote[] {
  const data: unknown = JSON.parse(raw);
  if (typeof data !== 'object' || data === null) throw new Error('kein Objekt');
  const file = data as Record<string, unknown>;
  if (file.version !== FILE_VERSION) throw new Error(`unbekannte Version ${String(file.version)}`);
  if (!Array.isArray(file.votes)) throw new Error('votes fehlt');
  return file.votes.map((entry: unknown, index) => {
    const vote = parseStoredVote(entry);
    if (!vote) throw new Error(`Stimme ${String(index)} ungültig`);
    return vote;
  });
}

export interface FileRatingStoreOptions {
  readonly warn?: (message: string) => void;
  readonly clock?: () => Date;
}

export function readRatingsFile(
  path: string,
  warn: (message: string) => void = console.warn,
): StoredRatingVote[] {
  if (!existsSync(path)) return [];
  try {
    return parseFile(readFileSync(path, 'utf8'));
  } catch (error) {
    const aside = `${path}.kaputt-${String(Date.now())}`;
    renameSync(path, aside);
    warn(`Stimmen-Datei ${path} unlesbar, beiseitegelegt als ${aside}: ${String(error)}`);
    return [];
  }
}

export function createFileRatingStore(
  path: string,
  options: FileRatingStoreOptions = {},
): RatingStore {
  const warn = options.warn ?? console.warn;
  const initial = readRatingsFile(path, warn);
  return createMemoryRatingStore(initial, {
    ...(options.clock ? { clock: options.clock } : {}),
    onChange(votes) {
      try {
        mkdirSync(dirname(path), { recursive: true });
        const temp = `${path}.tmp`;
        writeFileSync(temp, `${JSON.stringify({ version: FILE_VERSION, votes }, null, 2)}\n`);
        renameSync(temp, path);
      } catch (error) {
        // Eine volle Platte darf die Partie nicht stoppen; die Stimme bleibt im Speicher.
        warn(`Stimmen konnten nicht gespeichert werden: ${String(error)}`);
      }
    },
  });
}
