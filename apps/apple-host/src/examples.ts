/**
 * Beispielnachrichten für die Swift-Seite (ADR-019 §6, CHAOS-139): je Phase ein `renderState`,
 * von Hand geschrieben und gegen `RenderStateSchema` geprüft (`test/contract.test.ts`).
 * `scripts/export-apple-host-fixtures.mjs` schreibt sie nach `harness/Fixtures/render-state/`;
 * der Swift-Harness dekodiert jede Datei mit `app/RenderState.swift`.
 *
 * Von Hand statt aus einer echten Partie: Spielregeln und Minispiele ändern sich oft, der Vertrag
 * selten. Dass echte Ausgaben den Vertrag einhalten, prüft der Bündel-Test.
 */
import type { BoardState, LobbyPlayer, MinigameState, RenderState } from './contract.ts';

const JOIN = { joinUrl: 'http://192.168.0.2:8787/?code=AB12', joinCode: 'AB12' };

const ANNA: LobbyPlayer = {
  slot: 1,
  name: 'Anna',
  color: '#0072B2',
  connected: true,
  ready: true,
  character: 'raccoon',
};
const BEN: LobbyPlayer = {
  slot: 2,
  name: 'Ben',
  color: '#E69F00',
  connected: true,
  ready: false,
  character: null,
};

const BOARD: BoardState = {
  round: 3,
  rounds: 10,
  activeSlot: 2,
  spaces: [
    { id: 's00', x: 0, z: 0, kind: 'start' },
    { id: 's01', x: 2.4, z: 0.5, kind: 'coins-plus' },
    { id: 's02', x: 4.6, z: 1.6, kind: 'coins-minus' },
    { id: 's03', x: 6.2, z: 3.4, kind: 'event' },
    { id: 's04', x: 6.8, z: 5.8, kind: 'item' },
    { id: 's05', x: 5.9, z: 8.1, kind: 'trophy' },
  ],
  pawns: [
    { slot: 1, spaceId: 's03', x: 5.95, z: 3.4, character: 'raccoon' },
    { slot: 2, spaceId: 's03', x: 6.45, z: 3.4, character: 'sock' },
  ],
  messages: ['Anna würfelt eine 4.', 'Anna bekommt 3 Münzen.', 'Ben ist am Zug.'],
  notice: null,
};

const PLAYERS_IN_GAME: LobbyPlayer[] = [ANNA, { ...BEN, ready: true, character: 'sock' }];

const MINIGAME_PLAY: MinigameState = {
  id: 'pudding-gerangel',
  stage: 'play',
  elapsedMs: 12_345,
  bodies: [
    {
      id: 'buehne#12',
      shape: 'cylinder',
      pos: [0, -0.25, 0],
      rot: [0, 0, 0, 1],
      size: [12, 0.5, 12],
      color: '#F4D35E',
    },
    {
      id: 'figur-1-koerper#40',
      shape: 'cylinder',
      pos: [-2.1, 0.8, 1.3],
      rot: [0, 0.383, 0, 0.924],
      size: [0.8, 1.6, 0.8],
      color: '#0072B2',
    },
    {
      id: 'figur-2-koerper#44',
      shape: 'cylinder',
      pos: [1.7, 0.8, -0.4],
      rot: [0, -0.259, 0, 0.966],
      size: [0.8, 1.6, 0.8],
      color: '#E69F00',
    },
    {
      id: 'kirsche#57',
      shape: 'sphere',
      pos: [0.2, 0.3, 2.9],
      rot: [0, 0, 0, 1],
      size: [0.6, 0.6, 0.6],
      color: '#D7263D',
    },
    {
      id: 'kiste#61',
      shape: 'box',
      pos: [3.5, 0.5, 3.5],
      rot: [0.05, 0.2, -0.03, 0.978],
      size: [1, 1, 1],
      color: '#8D6E63',
    },
  ],
  hud: '48 s · Anna 3 · Ben 1',
};

/** Name (Dateiname ohne `.json`) → Beispiel. */
export const RENDER_STATE_EXAMPLES: Readonly<Record<string, RenderState>> = {
  'lobby-empty': {
    phase: 'lobby',
    lobby: { ...JOIN, players: [] },
    board: null,
    minigame: null,
  },
  'lobby-two-players': {
    phase: 'lobby',
    lobby: { ...JOIN, players: [ANNA, BEN] },
    board: null,
    minigame: null,
  },
  board: {
    phase: 'board',
    lobby: { ...JOIN, players: PLAYERS_IN_GAME },
    board: BOARD,
    minigame: null,
  },
  'board-disconnected-player': {
    phase: 'board',
    lobby: {
      ...JOIN,
      players: [ANNA, { ...BEN, connected: false, ready: true, character: 'sock' }],
    },
    board: { ...BOARD, activeSlot: 1, messages: [] },
    minigame: null,
  },
  'board-sabotage-notice': {
    phase: 'board',
    lobby: { ...JOIN, players: PLAYERS_IN_GAME },
    board: {
      ...BOARD,
      round: 6,
      activeSlot: 1,
      messages: ['Runde 6 beginnt!'],
      notice: { title: 'Sabotage wird stärker!', detail: 'Klau: 6 Münzen · Falle: 5 Münzen' },
    },
    minigame: null,
  },
  'minigame-intro': {
    phase: 'minigame',
    lobby: { ...JOIN, players: PLAYERS_IN_GAME },
    board: { ...BOARD, activeSlot: null },
    minigame: { ...MINIGAME_PLAY, stage: 'intro', elapsedMs: 0, bodies: [], hud: '' },
  },
  'minigame-play': {
    phase: 'minigame',
    lobby: { ...JOIN, players: PLAYERS_IN_GAME },
    board: { ...BOARD, activeSlot: null },
    minigame: MINIGAME_PLAY,
  },
  'minigame-results': {
    phase: 'minigame',
    lobby: { ...JOIN, players: PLAYERS_IN_GAME },
    board: { ...BOARD, activeSlot: null },
    minigame: {
      ...MINIGAME_PLAY,
      stage: 'results',
      elapsedMs: 60_000,
      hud: '0 s · Anna 5 · Ben 2',
    },
  },
  paused: {
    phase: 'paused',
    lobby: { ...JOIN, players: PLAYERS_IN_GAME },
    board: BOARD,
    minigame: null,
  },
  final: {
    phase: 'final',
    lobby: { ...JOIN, players: PLAYERS_IN_GAME },
    board: { ...BOARD, round: 10, activeSlot: null, messages: ['Anna gewinnt mit 3 Trophäen!'] },
    minigame: null,
  },
};
