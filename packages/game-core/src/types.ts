/**
 * Öffentlicher Vertrag von `@chaos-party/game-core` für M2 (CHAOS-2, ADR-011).
 *
 * Die Spielregeln sind ein reiner Reducer: `step(state, command)` liefert einen neuen,
 * JSON-serialisierbaren Zustand und die dabei entstandenen Ereignisse. Zeit kommt nur
 * über Befehle herein (`at`, Server-Uhr in ms), Zufall nur über den im Zustand
 * gespeicherten RNG-Zustand. Gleicher Seed + gleiche Befehlsfolge → gleicher Ablauf.
 *
 * Diese Datei ist der gemeinsame Vertrag zwischen game-core, Server und Host.
 * Änderungen nur additiv und abgestimmt (Koordinator).
 */

/** Spielerplatz 1–4 (gleich `SlotNumber` aus `@chaos-party/protocol`). */
export type Slot = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Brett (Topologie als Daten, getrennt vom Rendering; CHAOS-18)
// ---------------------------------------------------------------------------

/**
 * Feldtypen.
 * - `start`: Startfeld, neutral.
 * - `coins-plus` / `coins-minus`: Münzen gewinnen/verlieren (Höhe: `RuleSet.economy`).
 * - `event`: zufälliges Brett-Ereignis (seeded).
 * - `item`: zufälliges Item (Gewichte: `RuleSet.items.weights`).
 * - `trophy`: möglicher Standort der Trophäe (siehe `RuleSet.trophy.mode`).
 */
export type SpaceKind = 'start' | 'coins-plus' | 'coins-minus' | 'event' | 'item' | 'trophy';

export interface BoardSpace {
  /** Eindeutige, stabile ID (z. B. `s07`). */
  readonly id: string;
  readonly kind: SpaceKind;
  /** Lage auf dem Brett in Welt-Einheiten (x nach rechts, z nach hinten); Höhe macht der Host. */
  readonly position: { readonly x: number; readonly z: number };
  /** Nachfolger in Laufrichtung. Genau einer = gerader Weg, zwei oder mehr = Verzweigung. */
  readonly next: readonly string[];
  /** Optionaler Name für Wegweiser an Verzweigungen (z. B. „Pilzpfad“). */
  readonly label?: string;
}

export interface BoardDefinition {
  readonly id: string;
  readonly name: string;
  readonly spaces: readonly BoardSpace[];
  /** Startfeld aller Spieler. */
  readonly start: string;
}

// ---------------------------------------------------------------------------
// Regeln und Konfiguration (alle Zahlen sind Experiment-Stellschrauben, CHAOS-24)
// ---------------------------------------------------------------------------

export type ItemKind = 'double-dice' | 'coin-steal' | 'trap' | 'shield';

export interface Pacing {
  /** Pause nach Zugbeginn (Ansage am PC), bevor der Würfel angeboten wird. */
  readonly turnStartMs: number;
  /** Würfelanimation nach dem Wurf. */
  readonly rollMs: number;
  /** Dauer je gelaufenem Feld (Host animiert mit genau diesem Takt). */
  readonly stepMs: number;
  /** Anzeige eines Feldereignisses / Item-Effekts. */
  readonly spaceEventMs: number;
  /** Zugende bis zum nächsten Spieler. */
  readonly turnEndMs: number;
  readonly minigameIntroMs: number;
  readonly minigamePlayMs: number;
  readonly minigameResultsMs: number;
  readonly roundEndMs: number;
  /** Dauer des Reaktionsfensters (CHAOS-21). */
  readonly reactionWindowMs: number;
  /** So lange wartet eine Entscheidung auf einen getrennten Spieler, dann Standardoption. */
  readonly disconnectGraceMs: number;
}

export interface RuleSet {
  /** Würfelseiten; jede gleich wahrscheinlich (Verteilung per Experiment). */
  readonly diceFaces: readonly number[];
  readonly economy: {
    readonly startCoins: number;
    readonly coinsPlus: number;
    /** Verlust auf `coins-minus`; Münzen fallen nie unter 0. */
    readonly coinsMinus: number;
    /** Belohnung des Platzhalter-Minispiels je Platz (Index 0 = Platz 1). */
    readonly minigameRewards: readonly number[];
  };
  readonly trophy: {
    readonly price: number;
    /**
     * `wandering`: genau ein `trophy`-Feld ist aktiv; nach dem Kauf wandert die Trophäe
     * (seeded) zu einem anderen `trophy`-Feld. `fixed`: alle `trophy`-Felder sind aktiv.
     */
    readonly mode: 'wandering' | 'fixed';
  };
  readonly items: {
    /** Höchstzahl gleichzeitig gehaltener Items. */
    readonly capacity: number;
    /** Ziehgewichte auf `item`-Feldern. */
    readonly weights: Readonly<Record<ItemKind, number>>;
    /** Münzklau: so viele Münzen (höchstens Bestand des Ziels). */
    readonly stealAmount: number;
    /** Falle: so viele Münzen gehen an die Besitzerin. */
    readonly trapAmount: number;
  };
  readonly pacing: Pacing;
}

export interface GamePlayerConfig {
  readonly slot: Slot;
  readonly name: string;
}

export interface GameConfig {
  readonly board: BoardDefinition;
  readonly rules: RuleSet;
  /** Anzahl Runden (eine Runde = jeder Spieler ein Zug + Minispiel). */
  readonly rounds: number;
  readonly seed: number;
  /** 1–4 Spieler (M2-Ziel 2–4; 1 nur für Tests/Demo). */
  readonly players: readonly GamePlayerConfig[];
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------

/**
 * Explizite Phasen (ARCHITECTURE „Game-core design“). Automatische Phasen warten nur auf
 * Zeit (`resumeAt`), Entscheidungsphasen auf eine Wahl (`prompt`).
 */
export type GamePhase =
  | 'setup'
  | 'turn-start'
  | 'roll'
  | 'choose-target'
  | 'move'
  | 'choose-path'
  | 'trophy-offer'
  | 'space-event'
  | 'reaction-window'
  | 'turn-end'
  | 'minigame-intro'
  | 'minigame-play'
  | 'minigame-results'
  | 'round-end'
  | 'game-results';

/**
 * Art einer Entscheidung.
 * - `roll`: Optionen `roll` und je einsetzbarem Item `item:<ItemKind>` (vor dem Wurf).
 * - `target`: Ziel eines Items, Optionen `slot:<n>` und `cancel`.
 * - `path`: an einer Verzweigung, Optionen = IDs der Nachfolgefelder.
 * - `trophy`: beim Erreichen/Passieren der Trophäe, Optionen `buy` und `skip`.
 * - `reaction`: Reaktionsfenster des angegriffenen Spielers, Optionen `shield` (nur mit
 *   Schild) und `brace` („Festhalten!“, halbiert den Verlust). Zeitablauf = keine Reaktion.
 */
export type PromptKind = 'roll' | 'target' | 'path' | 'trophy' | 'reaction';

export interface PromptOption {
  readonly id: string;
  /** Kurzer deutscher Anzeigetext für den Controller-Knopf. */
  readonly label: string;
  /** Optionaler Zusatz (z. B. Preis, Richtung). */
  readonly detail?: string;
  /** Bezieht sich die Option auf einen Spieler (Ziel), dessen Slot (Farbe am Controller). */
  readonly slot?: Slot;
}

export interface Prompt {
  /** Fortlaufende ID; eine Wahl muss die aktuelle ID nennen (alte Wahl → `stale-prompt`). */
  readonly id: number;
  readonly slot: Slot;
  readonly kind: PromptKind;
  /** Kurze Frage/Überschrift für den Controller. */
  readonly title: string;
  readonly options: readonly PromptOption[];
  /** Option bei Zeitablauf oder für getrennte Spieler nach `disconnectGraceMs`. */
  readonly defaultOption: string;
  /** Absolute Frist (Server-Uhr, ms) oder `null` = wartet unbegrenzt. */
  readonly deadline: number | null;
}

export interface PlayerState {
  readonly slot: Slot;
  readonly name: string;
  readonly spaceId: string;
  readonly coins: number;
  readonly trophies: number;
  readonly items: readonly ItemKind[];
  readonly connected: boolean;
}

export interface TrapState {
  readonly spaceId: string;
  readonly owner: Slot;
}

export interface RankingEntry {
  readonly slot: Slot;
  /** Platz 1–4; Gleichstand (gleiche Trophäen und Münzen) = gleicher Platz. */
  readonly place: number;
  readonly trophies: number;
  readonly coins: number;
}

/**
 * Vollständiger, JSON-serialisierbarer Spielzustand. Felder, die nur intern gebraucht
 * werden (Zwischenstand einer Bewegung, RNG), stehen in `internal` und gehen nicht an
 * Host oder Controller.
 */
export interface GameState {
  readonly boardId: string;
  readonly phase: GamePhase;
  readonly round: number;
  readonly rounds: number;
  readonly turnOrder: readonly Slot[];
  /** Spieler am Zug (während Minispiel/Ergebnis `null`). */
  readonly activeSlot: Slot | null;
  readonly players: readonly PlayerState[];
  /** Aktive Trophäenfelder (bei `wandering` genau eins). */
  readonly trophySpaces: readonly string[];
  readonly traps: readonly TrapState[];
  readonly prompt: Prompt | null;
  /** Automatische Phase läuft bis zu diesem Zeitpunkt weiter (Server-Uhr) oder `null`. */
  readonly resumeAt: number | null;
  /** Letzter verarbeiteter Zeitpunkt; Befehle mit kleinerem `at` werden abgewiesen. */
  readonly now: number;
  /** Endstand, sobald `phase === 'game-results'`. */
  readonly ranking: readonly RankingEntry[] | null;
  readonly config: { readonly rules: RuleSet; readonly seed: number };
  /** Interner Zustand der Regeln (Bewegung, RNG, Zähler). Form bestimmt game-core. */
  readonly internal: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Befehle
// ---------------------------------------------------------------------------

export type GameCommand =
  /** SETUP → erste Runde (Zugreihenfolge per RNG). */
  | { readonly type: 'start'; readonly at: number }
  /** Wahl eines Spielers für den aktuellen Prompt. */
  | {
      readonly type: 'choose';
      readonly slot: Slot;
      readonly promptId: number;
      readonly option: string;
      readonly at: number;
    }
  /** Zeit vergeht (Server ruft das regelmäßig auf, z. B. alle 100 ms). */
  | { readonly type: 'tick'; readonly at: number }
  /** Verbindung eines Spielers geändert (Disconnect mitten im Zug, CHAOS-23). */
  | {
      readonly type: 'connection';
      readonly slot: Slot;
      readonly connected: boolean;
      readonly at: number;
    };

export type GameErrorCode =
  | 'wrong-phase'
  | 'not-your-turn'
  | 'stale-prompt'
  | 'invalid-option'
  | 'unknown-player'
  | 'time-went-back';

export interface GameError {
  readonly code: GameErrorCode;
  readonly message: string;
}

export type StepResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly state: GameState; readonly error: GameError };

// ---------------------------------------------------------------------------
// Ereignisse (für Host-Animation, Controller-Rückmeldung, Tests und Experimente)
// ---------------------------------------------------------------------------

export type CoinReason = 'space' | 'event' | 'trophy' | 'steal' | 'trap' | 'minigame';

/** Zufällige Ereignisse auf `event`-Feldern (Auswahl per RNG; Liste bestimmt game-core). */
export type BoardEventKind = 'coin-rain' | 'gust' | 'swap' | 'trophy-shuffle' | 'lucky-find';

export type GameEvent =
  | { readonly type: 'game-started'; readonly order: readonly Slot[] }
  | { readonly type: 'round-started'; readonly round: number }
  | { readonly type: 'turn-started'; readonly slot: Slot; readonly round: number }
  | {
      readonly type: 'item-used';
      readonly slot: Slot;
      readonly item: ItemKind;
      readonly target?: Slot;
    }
  | {
      readonly type: 'dice-rolled';
      readonly slot: Slot;
      readonly faces: readonly number[];
      readonly total: number;
    }
  | { readonly type: 'path-chosen'; readonly slot: Slot; readonly spaceId: string }
  /** Ein Bewegungsabschnitt; `path` = betretene Felder in Reihenfolge (ohne Startfeld). */
  | { readonly type: 'moved'; readonly slot: Slot; readonly path: readonly string[] }
  | {
      readonly type: 'coins-changed';
      readonly slot: Slot;
      readonly delta: number;
      readonly balance: number;
      readonly reason: CoinReason;
    }
  | { readonly type: 'trophy-bought'; readonly slot: Slot; readonly spaceId: string }
  | { readonly type: 'trophy-moved'; readonly from: string; readonly to: string }
  | { readonly type: 'item-gained'; readonly slot: Slot; readonly item: ItemKind }
  | { readonly type: 'board-event'; readonly slot: Slot; readonly event: BoardEventKind }
  | { readonly type: 'trap-placed'; readonly slot: Slot; readonly spaceId: string }
  | {
      readonly type: 'trap-triggered';
      readonly slot: Slot;
      readonly owner: Slot;
      readonly spaceId: string;
      readonly amount: number;
    }
  | {
      readonly type: 'reaction-opened';
      readonly promptId: number;
      readonly slot: Slot;
      readonly attacker: Slot;
      readonly item: ItemKind;
      readonly deadline: number;
    }
  | {
      readonly type: 'reaction-resolved';
      readonly slot: Slot;
      readonly result: 'shield' | 'brace' | 'timeout';
    }
  | {
      readonly type: 'coins-stolen';
      readonly from: Slot;
      readonly to: Slot;
      readonly amount: number;
    }
  | {
      readonly type: 'player-auto';
      readonly slot: Slot;
      readonly option: string;
      readonly reason: 'disconnected' | 'timeout';
    }
  | { readonly type: 'turn-ended'; readonly slot: Slot }
  | { readonly type: 'minigame-started'; readonly minigame: 'placeholder' }
  | { readonly type: 'minigame-results'; readonly ranking: readonly Slot[] }
  | { readonly type: 'round-ended'; readonly round: number }
  | { readonly type: 'game-ended'; readonly ranking: readonly RankingEntry[] };

export type GameEventType = GameEvent['type'];
