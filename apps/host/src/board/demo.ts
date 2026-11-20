/**
 * Fester Beispiel-Spielstand und kurze Ereignisfolge für den lokalen Brett-Modus
 * (`/host/?local=1&board=1`, ohne Server). Grundlage für Screenshots der Abnahme und
 * zum Anschauen der Animationen (`&demo=1` spielt die Folge in Schleife ab).
 *
 * Alle Nachrichten sind gültige `board`-Nachrichten des Protokolls (unit-getestet) – so
 * würde sie auch der Server schicken. Ausgedacht, nicht von game-core berechnet.
 */
import type { BoardDefinition } from '@chaos-party/game-core';
import {
  createMessage,
  type BoardEvent,
  type BoardMessage,
  type BoardPlayer,
  type BoardView,
  type SlotNumber,
} from '@chaos-party/protocol';

const PLAYERS: BoardPlayer[] = [
  {
    slot: 1,
    name: 'Blau',
    spaceId: 's07',
    coins: 12,
    trophies: 1,
    items: ['double-dice'],
    connected: true,
    character: 'robot',
    minigameWins: 1,
    stats: { coinsEarned: 0, coinsLost: 0, spacesMoved: 0, itemsUsed: 0 },
  },
  {
    slot: 2,
    name: 'Orange',
    spaceId: 's21',
    coins: 7,
    trophies: 0,
    items: ['coin-steal', 'trap'],
    connected: true,
    character: 'cactus',
    minigameWins: 0,
    stats: { coinsEarned: 0, coinsLost: 0, spacesMoved: 0, itemsUsed: 0 },
  },
  {
    slot: 3,
    name: 'Grün',
    spaceId: 's34',
    coins: 18,
    trophies: 1,
    items: ['shield'],
    connected: true,
    character: 'raccoon',
    minigameWins: 1,
    stats: { coinsEarned: 0, coinsLost: 0, spacesMoved: 0, itemsUsed: 0 },
  },
  {
    slot: 4,
    name: 'Rosa',
    spaceId: 's42',
    coins: 3,
    trophies: 0,
    items: [],
    connected: true,
    character: 'sock',
    minigameWins: 0,
    stats: { coinsEarned: 0, coinsLost: 0, spacesMoved: 0, itemsUsed: 0 },
  },
];

/** Stand für den Screenshot: Blau steht an Gabel A und wählt einen Weg. */
export const DEMO_VIEW: BoardView = {
  boardId: 'wackelwald',
  gamePhase: 'choose-path',
  round: 2,
  rounds: 5,
  turnOrder: [1, 3, 2, 4],
  activeSlot: 1,
  players: PLAYERS,
  trophySpaces: ['s12', 's24', 's36'],
  trophyPrice: 20,
  traps: [{ spaceId: 's15', owner: 2 }],
  prompt: {
    id: 7,
    slot: 1,
    kind: 'path',
    title: 'Welchen Weg nimmst du?',
    options: [
      { id: 's08', label: 'Klippenweg', detail: 'lang, sicher' },
      { id: 's14', label: 'Sumpfabkürzung', detail: 'kurz, riskant' },
    ],
    remainingMs: null,
  },
  remainingMs: null,
  stepMs: 320,
  ranking: null,
  minigame: null,
  paused: false,
  endedEarly: false,
};

type PlayerPatch = Partial<Omit<BoardPlayer, 'slot'>>;

function patchView(
  base: BoardView,
  patch: Partial<Omit<BoardView, 'players'>>,
  players: Partial<Record<SlotNumber, PlayerPatch>> = {},
): BoardView {
  return {
    ...base,
    ...patch,
    players: base.players.map((p) => ({ ...p, ...(players[p.slot] ?? {}) })),
  };
}

function message(view: BoardView, events: readonly BoardEvent[], eventSeq: number): BoardMessage {
  return createMessage('board', { view, events: [...events], eventSeq });
}

/**
 * Ereignisfolge ab {@link DEMO_VIEW}: Blau nimmt den Klippenweg und findet ein Item, Grün
 * würfelt und verliert Münzen, Orange klaut Blau Münzen (mit Reaktionsfenster).
 * Element 0 ist der Startstand (Sprung ohne Animation).
 */
export function createDemoMessages(): BoardMessage[] {
  const v0 = DEMO_VIEW;
  const v1 = patchView(
    v0,
    { gamePhase: 'turn-end', prompt: null },
    { 1: { spaceId: 's10', items: ['double-dice', 'coin-steal'] } },
  );
  const v2 = patchView(v1, { gamePhase: 'turn-start', activeSlot: 3 });
  const v3 = patchView(v2, { gamePhase: 'turn-end' }, { 3: { spaceId: 's40', coins: 15 } });
  const v4 = patchView(v3, {
    gamePhase: 'roll',
    activeSlot: 2,
    prompt: {
      id: 8,
      slot: 2,
      kind: 'roll',
      title: 'Würfeln oder Item?',
      options: [
        { id: 'roll', label: 'Würfeln' },
        { id: 'item:coin-steal', label: 'Münzklau' },
      ],
      remainingMs: null,
    },
  });
  const v5 = patchView(
    v4,
    {
      gamePhase: 'reaction-window',
      prompt: {
        id: 9,
        slot: 1,
        kind: 'reaction',
        title: 'Orange will klauen!',
        options: [{ id: 'brace', label: 'Festhalten!' }],
        remainingMs: 3000,
      },
    },
    { 2: { items: ['trap'] } },
  );
  const v6 = patchView(
    v5,
    {
      gamePhase: 'roll',
      prompt: {
        id: 10,
        slot: 2,
        kind: 'roll',
        title: 'Würfeln!',
        options: [{ id: 'roll', label: 'Würfeln' }],
        remainingMs: null,
      },
    },
    { 1: { coins: 6 }, 2: { coins: 13 } },
  );

  const batches: [BoardView, BoardEvent[]][] = [
    [v0, []],
    [
      v1,
      [
        { type: 'path-chosen', slot: 1, spaceId: 's08' },
        { type: 'moved', slot: 1, path: ['s08', 's09', 's10'] },
        { type: 'item-gained', slot: 1, item: 'coin-steal' },
      ],
    ],
    [
      v2,
      [
        { type: 'turn-ended', slot: 1 },
        { type: 'turn-started', slot: 3, round: 2 },
      ],
    ],
    [
      v3,
      [
        { type: 'dice-rolled', slot: 3, faces: [4], total: 4 },
        { type: 'moved', slot: 3, path: ['s38', 's39', 's40'] },
        { type: 'coins-changed', slot: 3, delta: -3, balance: 15, reason: 'space' },
      ],
    ],
    [
      v4,
      [
        { type: 'turn-ended', slot: 3 },
        { type: 'turn-started', slot: 2, round: 2 },
      ],
    ],
    [
      v5,
      [
        { type: 'item-used', slot: 2, item: 'coin-steal', target: 1 },
        {
          type: 'reaction-opened',
          promptId: 9,
          slot: 1,
          attacker: 2,
          item: 'coin-steal',
          deadline: 0,
        },
      ],
    ],
    [
      v6,
      [
        { type: 'reaction-resolved', slot: 1, result: 'timeout' },
        { type: 'coins-stolen', from: 1, to: 2, amount: 6 },
        { type: 'coins-changed', slot: 1, delta: -6, balance: 6, reason: 'steal' },
        { type: 'coins-changed', slot: 2, delta: 6, balance: 13, reason: 'steal' },
      ],
    ],
  ];

  let seq = 0;
  return batches.map(([view, events]) => {
    const msg = message(view, events, seq);
    seq += events.length;
    return msg;
  });
}

/** Abstand der Demo-Nachrichten im Schleifenbetrieb (ms, Index wie {@link createDemoMessages}). */
export const DEMO_DELAYS_MS: readonly number[] = [0, 1500, 2500, 1200, 3000, 1500, 3500];

/**
 * Startstand des Beispiels für ein beliebiges Brett (CHAOS-212, Brett-Export je Brett): Wackelwald
 * bekommt {@link DEMO_VIEW}; andere Bretter einen gleich gebauten Stand aus ihren Feldern. Blau
 * steht an der ersten Gabel und wählt, die anderen verteilt auf dem Kurs; die ersten drei
 * Trophäenfelder sind aktiv, eine Falle von Orange liegt auf einem freien Feld. So enthält der
 * Export Pokal, Falle und „Am Zug“-Pfeil als Vorlagen (`BoardScene.swift`).
 */
export function demoStartMessage(board: BoardDefinition): BoardMessage {
  if (board.id === DEMO_VIEW.boardId) return message(DEMO_VIEW, [], 0);
  const spaces = board.spaces;
  const fork = spaces.find((s) => s.next.length >= 2) ?? spaces[0];
  if (!fork) throw new Error(`Brett ${board.id} hat keine Felder`);
  const others = spaces.filter((s) => s.id !== fork.id && s.kind !== 'trophy');
  const spread = [1, 2, 3].map((i) => others[Math.floor((i * others.length) / 4)]?.id ?? fork.id);
  const occupied = new Set([fork.id, ...spread]);
  const trap = spaces.find((s) => s.kind === 'coins-minus' && !occupied.has(s.id)) ?? spaces[1];
  const byId = new Map(spaces.map((s) => [s.id, s]));
  const view: BoardView = {
    ...DEMO_VIEW,
    boardId: board.id,
    players: PLAYERS.map((p, i) => ({
      ...p,
      spaceId: i === 0 ? fork.id : (spread[i - 1] ?? fork.id),
    })),
    trophySpaces: spaces
      .filter((s) => s.kind === 'trophy')
      .slice(0, 3)
      .map((s) => s.id),
    traps: trap ? [{ spaceId: trap.id, owner: 2 }] : [],
    prompt: {
      id: 7,
      slot: 1,
      kind: 'path',
      title: 'Welchen Weg nimmst du?',
      options: fork.next.map((id) => ({ id, label: byId.get(id)?.label ?? id })),
      remainingMs: null,
    },
  };
  return message(view, [], 0);
}
