/**
 * Reine Entscheidungen der PC-Lobby (CHAOS-36): Start-Bedingung mit Hinweistext,
 * Rundenauswahl und Figur je Spielerkarte. Ohne React, unit-getestet.
 */
import {
  CHARACTER_NAMES,
  pickFreeCharacter,
  type CharacterId,
  type LobbySettings,
} from '@chaos-party/protocol';
import type { ConnectionStatus } from '../net/hostConnection.ts';
import type { HostPlayer } from '../players.ts';

/** Ab so vielen verbundenen Spielern ist es eine echte Partie (VISION: 2–4 Spieler). */
export const MIN_PARTY_PLAYERS = 2;

export type StartReadiness =
  /** Keine Verbindung oder niemand verbunden: Knopf aus. */
  | 'blocked'
  /** Ein Spieler: Start erlaubt, aber nur als Probelauf (Demo, Tests, wie in M1–M3). */
  | 'solo'
  /** Mindestens zwei verbunden, aber nicht alle bereit: Start erlaubt (wie bisher). */
  | 'waiting'
  /** Mindestens zwei verbunden und alle verbundenen bereit: der empfohlene Start. */
  | 'ready';

export interface StartState {
  readonly readiness: StartReadiness;
  /** Knopf klickbar? (Verhalten der bisherigen Lobby: ab einem verbundenen Spieler.) */
  readonly enabled: boolean;
  /** Knopf hervorheben (leuchtet), sobald die empfohlene Bedingung erfüllt ist. */
  readonly highlighted: boolean;
  readonly hint: string;
}

/**
 * Start-Bedingung (ADR-014/CHAOS-36): Empfohlen ist der Start ab **zwei verbundenen,
 * bereiten** Spielern – dann leuchtet der Knopf. Wie bisher (M1–M3, E2E-Tests, Demo) bleibt
 * der Start ab einem verbundenen Spieler möglich; der Hinweis sagt, was fehlt.
 */
export function startState(
  players: readonly Pick<HostPlayer, 'connected' | 'ready' | 'label'>[],
  status: ConnectionStatus,
): StartState {
  const connected = players.filter((p) => p.connected);
  if (status !== 'connected' || connected.length === 0) {
    return {
      readiness: 'blocked',
      enabled: false,
      highlighted: false,
      hint: 'Start, sobald mindestens ein Controller verbunden ist.',
    };
  }
  if (connected.length < MIN_PARTY_PLAYERS) {
    return {
      readiness: 'solo',
      enabled: true,
      highlighted: false,
      hint: 'Partie ab 2 Spielern – allein nur ein Probelauf.',
    };
  }
  const waiting = connected.filter((p) => !p.ready);
  if (waiting.length === 0) {
    return { readiness: 'ready', enabled: true, highlighted: true, hint: 'Alle bereit – los!' };
  }
  const names = waiting.map((p) => p.label);
  const who =
    names.length === 1
      ? `${names[0] ?? ''} ist`
      : `${names.slice(0, -1).join(', ')} und ${names[names.length - 1] ?? ''} sind`;
  return {
    readiness: 'waiting',
    enabled: true,
    highlighted: false,
    hint: `${who} noch nicht bereit – starten geht trotzdem.`,
  };
}

export interface RoundOption {
  readonly rounds: number;
  readonly selected: boolean;
  /** Nicht aus den Vorschlägen (z. B. per `?rounds=` eingestellt). */
  readonly custom: boolean;
}

/**
 * Knöpfe der Rundenauswahl: die Vorschläge des Servers (`roundPresets`), dazu die aktuelle
 * Einstellung, falls sie kein Vorschlag ist (aufsteigend einsortiert).
 */
export function roundOptions(settings: LobbySettings): RoundOption[] {
  const values = new Set(settings.roundPresets);
  values.add(settings.rounds);
  return [...values]
    .sort((a, b) => a - b)
    .map((rounds) => ({
      rounds,
      selected: rounds === settings.rounds,
      custom: !settings.roundPresets.includes(rounds),
    }));
}

/**
 * Minuten je Runde nach Spielerzahl (Brettzüge + Minispiel mit Anleitung und Ergebnis), aus der
 * Bot-Simulation mit gemütlichem Entscheidungstempo (EXP-010, CHAOS-40). Dazu kommt das Finale.
 */
const MINUTES_PER_ROUND: Readonly<Record<2 | 3 | 4, number>> = { 2: 1.15, 3: 1.35, 4: 1.5 };
const FINALE_MINUTES = 0.35;

/**
 * Grobe Spieldauer für die Rundenauswahl („≈ 15 Min.“), auf 5 Minuten gerundet. Mit weniger als
 * zwei Spielern rechnet sie mit vier (die Runde füllt sich meist noch).
 */
export function roundsDuration(rounds: number, players = 4): string {
  const count = players >= 2 && players <= 4 ? (players as 2 | 3 | 4) : 4;
  const minutes = rounds * MINUTES_PER_ROUND[count] + FINALE_MINUTES;
  return `≈ ${String(Math.max(5, Math.round(minutes / 5) * 5))} Min.`;
}

export interface CardCharacter {
  /** Gezeigte Figur: die Wahl oder der Vorschlag (freie Standardfigur). */
  readonly character: CharacterId;
  /** `false` = Spieler wählt noch; das Porträt ist nur ein Vorschlag. */
  readonly chosen: boolean;
  /** Text unter dem Namen: Figurenname bzw. „wählt noch …“. */
  readonly text: string;
}

/**
 * Figur einer Spielerkarte: die echte Wahl aus `lobby.players[].character`; bei `null` als
 * Vorschlag die Figur, die der Server beim Start zuweisen würde: in Slot-Reihenfolge die
 * Standardfigur des Slots, falls frei, sonst die erste freie (`pickFreeCharacter`, ADR-014).
 */
export function cardCharacter(
  player: Pick<HostPlayer, 'slot' | 'character'>,
  all: readonly Pick<HostPlayer, 'slot' | 'character'>[],
): CardCharacter {
  if (player.character !== null) {
    return {
      character: player.character,
      chosen: true,
      text: CHARACTER_NAMES[player.character].name,
    };
  }
  const taken = all.flatMap((p) => (p.character === null ? [] : [p.character]));
  let suggestion: CharacterId = 'robot';
  for (const other of [...all].sort((a, b) => a.slot - b.slot)) {
    if (other.character !== null) continue;
    const free = pickFreeCharacter(other.slot, taken) ?? 'robot';
    taken.push(free);
    if (other.slot === player.slot) suggestion = free;
  }
  return { character: suggestion, chosen: false, text: 'wählt noch …' };
}
