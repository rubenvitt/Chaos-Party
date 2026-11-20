/**
 * Reine Entscheidungen der Minispiel-Bühne (M3, CHAOS-26): Wann zeigt der Host die Bühne
 * statt des Bretts, wie viel Spielzeit bleibt, was passiert nach einem Host-Neuladen.
 */
import {
  CHARACTER_NAMES,
  defaultCharacterFor,
  type MinigameInput,
} from '@chaos-party/minigame-sdk';
import type { MinigamePlayer } from '@chaos-party/minigame-sdk/babylon';
import {
  PLAYER_SLOTS,
  type BoardView,
  type InputIntent,
  type SlotNumber,
} from '@chaos-party/protocol';

export type MinigameStageName = 'intro' | 'play' | 'results';

/** Minispiel-Abschnitt des Stands oder `null` außerhalb der Minispiel-Phasen. */
export function minigameStageOf(view: BoardView | null): MinigameStageName | null {
  if (!view?.minigame) return null;
  switch (view.gamePhase) {
    case 'minigame-intro':
      return 'intro';
    case 'minigame-play':
      return 'play';
    case 'minigame-results':
      return 'results';
    default:
      return null;
  }
}

/**
 * Schlüssel der Bühne: gleiches Minispiel derselben Runde mit demselben Seed = dieselbe
 * Bühne (bleibt über Phasenwechsel und Wiederverbinden bestehen). `null` = keine Bühne:
 * außerhalb der Minispiel-Phasen, beim Platzhalter oder bei einem unbekannten Minispiel
 * (dann zeigt das Brett sein Platzhalter-Overlay).
 */
export function stageKeyOf(
  view: BoardView | null,
  isKnown: (id: string) => boolean,
): string | null {
  const stage = minigameStageOf(view);
  const minigame = view?.minigame;
  if (!stage || !minigame || !isKnown(minigame.id)) return null;
  return `${minigame.id}:${String(minigame.round)}:${String(minigame.seed)}`;
}

/** Unter dieser Restzeit startet ein Host nach Neuladen das Minispiel nicht mehr neu. */
export const MIN_RESTART_MS = 3_000;

/**
 * Restliche Spielzeit (ms) laut Server: `playMs − elapsedMs`, abzüglich der Zeit seit dem
 * Empfang des Stands. Vor dem Spiel (`elapsedMs = null`) die volle Spielzeit.
 */
export function remainingPlayMs(view: BoardView, receivedAt: number, now: number): number {
  return Math.max(0, Math.round(serverPlayLeftMs(view, receivedAt, now)));
}

/** Wie `remainingPlayMs`, aber ungekappt: negativ = die Spielzeit des Servers ist um so viel vorbei. */
function serverPlayLeftMs(view: BoardView, receivedAt: number, now: number): number {
  const minigame = view.minigame;
  if (!minigame) return 0;
  const elapsed = minigame.elapsedMs ?? 0;
  // In der Pause (auch der Auto-Pause beim Neuladen, CHAOS-68) läuft keine Spielzeit.
  const sinceReceive =
    minigame.elapsedMs === null || view.paused ? 0 : Math.max(0, now - receivedAt);
  return minigame.playMs - elapsed - sinceReceive;
}

/**
 * So lange darf das Spiel des Hosts über das Ende der Spielzeit des Servers hinauslaufen, dann
 * wertet der Host den Stand (CHAOS-206). Weit unter der Kulanz des Servers
 * (`minigameResultGraceMs`, 15 s), auch bei langsamen Ticks.
 */
export const PLAY_OVERRUN_MS = 1_000;

/**
 * Ablauf des Hosts am Spielstart des Servers (`playStartedAt`) ausrichten (CHAOS-206). Die
 * Spielzeit eines Minispiels steht schon im Aufbau fest (`ctx.timeLimitMs`); ist die Bühne erst
 * nach dem Countdown fertig oder rechnet der Host langsamer als die Uhr, liefe das Spiel über das
 * Ende beim Server hinaus und das Ergebnis käme womöglich nach dessen Frist.
 * - `'end'` bei laufendem Spiel (`running`): Die Spielzeit des Servers ist seit
 *   `PLAY_OVERRUN_MS` vorbei, der Host wertet jetzt (`runner.finishNow`).
 * - `'end'` bei noch nicht gestartetem Spiel: Es bleiben weniger als `MIN_RESTART_MS`; es startet
 *   nicht mehr (Begründung bei `planPlay`), der Server bricht nach seiner Frist ohne Münzen ab.
 * - sonst `'keep'`; außerhalb von `minigame-play` immer. In der Pause steht die Uhr.
 */
export function playDeadline(
  view: BoardView,
  receivedAt: number,
  now: number,
  running: boolean,
): 'keep' | 'end' {
  const elapsed = view.minigame?.elapsedMs;
  if (minigameStageOf(view) !== 'play' || elapsed === null || elapsed === undefined) return 'keep';
  const left = serverPlayLeftMs(view, receivedAt, now);
  const end = running ? left <= -PLAY_OVERRUN_MS : left < MIN_RESTART_MS;
  return end ? 'end' : 'keep';
}

/**
 * Restzeit für die Anzeige im Spiel: die des Minispiels, höchstens die des Servers. Läuft das
 * Spiel des Hosts später als beim Server, zählt die Uhr bis zum Ende beim Server herunter, denn
 * dann endet es (`playDeadline`).
 */
export function shownRemainingMs(
  hudRemainingMs: number,
  view: BoardView,
  receivedAt: number,
  now: number,
): number {
  return Math.min(hudRemainingMs, remainingPlayMs(view, receivedAt, now));
}

export type PlayPlan =
  | { readonly kind: 'play'; readonly timeLimitMs: number }
  | { readonly kind: 'wait'; readonly remainingMs: number };

/**
 * Spielzeit für eine neu aufgebaute Bühne:
 * - im Intro (oder Ergebnis): volle Spielzeit;
 * - mitten im Spiel (Host neu geladen): das Minispiel startet neu mit der Restzeit;
 * - ist die Restzeit kleiner als `MIN_RESTART_MS`, wird **nicht** neu gestartet: Ein Spiel
 *   von 1–2 s hätte ein Zufallsergebnis, und „alle 0 Punkte“ hieße Gleichstand auf Platz 1
 *   (alle bekämen die Siegermünzen). Der Host wartet; der Server bricht nach der Schonfrist
 *   ohne Münzen ab – die faire, in game-core festgelegte Rückfallregel.
 */
export function planPlay(view: BoardView, receivedAt: number, now: number): PlayPlan {
  const minigame = view.minigame;
  if (!minigame) return { kind: 'wait', remainingMs: 0 };
  if (view.gamePhase !== 'minigame-play') return { kind: 'play', timeLimitMs: minigame.playMs };
  const remaining = remainingPlayMs(view, receivedAt, now);
  return remaining >= MIN_RESTART_MS
    ? { kind: 'play', timeLimitMs: remaining }
    : { kind: 'wait', remainingMs: remaining };
}

/** Ganze Restsekunden einer Phase (Countdown wie am Brett: Restzeit ab Empfang). */
export function phaseSecondsLeft(
  remainingMs: number | null,
  receivedAt: number,
  now: number,
): number | null {
  if (remainingMs === null) return null;
  return Math.max(0, Math.ceil((remainingMs - Math.max(0, now - receivedAt)) / 1000));
}

/** Vom Server geprüfte Controller-Eingabe → Minispiel-Eingabe (Gesten/Reaktion: keine). */
export function intentToMinigameInput(
  intent: InputIntent,
): { readonly slot: SlotNumber; readonly input: MinigameInput } | null {
  switch (intent.type) {
    case 'move':
      return { slot: intent.slot, input: { type: 'move', x: intent.x, y: intent.y } };
    case 'press':
    case 'release':
      return { slot: intent.slot, input: { type: intent.type, button: intent.button } };
    case 'gesture':
    case 'reaction':
      return null;
  }
}

/**
 * Figurenname eines Slots aus dem Brett-Stand (gewählte Figur, v4/CHAOS-36). Fehlt der Slot im
 * Stand, die Standardfigur als Rückfall.
 */
export function characterName(view: Pick<BoardView, 'players'>, slot: SlotNumber): string {
  const character =
    view.players.find((player) => player.slot === slot)?.character ?? defaultCharacterFor(slot);
  return CHARACTER_NAMES[character].name;
}

/** Teilnehmer eines Minispiels aus dem Brett-Stand (nach Slot sortiert). */
export function playersFromView(view: BoardView): MinigamePlayer[] {
  return [...view.players]
    .sort((a, b) => a.slot - b.slot)
    .map((player) => ({
      slot: player.slot,
      name: player.name,
      color: PLAYER_SLOTS[player.slot].color,
      symbol: PLAYER_SLOTS[player.slot].symbol,
      character: player.character,
    }));
}
