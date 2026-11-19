/**
 * Beispielnachrichten für die Swift-Seite (ADR-019 §6, CHAOS-139): je Phase ein `renderState`,
 * von Hand geschrieben und gegen `RenderStateSchema` geprüft (`test/contract.test.ts`).
 * `scripts/export-apple-host-fixtures.mjs` schreibt sie nach `harness/Fixtures/render-state/`;
 * der Swift-Harness dekodiert jede Datei mit `app/RenderState.swift`.
 *
 * Von Hand statt aus einer echten Partie: Spielregeln und Minispiele ändern sich oft, der Vertrag
 * selten. Dass echte Ausgaben den Vertrag einhalten, prüft der Bündel-Test.
 */
import type {
  BoardState,
  LobbyPlayer,
  LobbySettingsState,
  MinigameGeometry,
  MinigameState,
  RenderState,
} from './contract.ts';

/** Server-Standard: 10 Runden, Vorschläge 10/16/20, „Mehr Zeit zum Reagieren“ aus (CHAOS-166). */
const SETTINGS: LobbySettingsState = {
  rounds: 10,
  roundPresets: [10, 16, 20],
  moreReactionTime: false,
};

const JOIN = {
  joinUrl: 'http://192.168.0.2:8787/?code=AB12',
  joinCode: 'AB12',
  settings: SETTINGS,
};

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

/** Kleinstes Beispiel einer Geometrie (CHAOS-144): ein Quadrat 1 × 1 in der x/z-Ebene. */
const QUAD_GEOMETRY: MinigameGeometry = {
  id: 'g1',
  vertices: 4,
  positions: 'AAAAvwAAAAAAAAC/AAAAPwAAAAAAAAC/AAAAPwAAAAAAAAA/AAAAvwAAAAAAAAA/',
  normals: 'AH8AAH8AAH8AAH8A',
  indices: 'AAABAAIAAAACAAMA',
  wideIndices: false,
  extent: [1, 0, 1],
};

const MINIGAME_INFO: MinigameState['info'] = {
  title: 'Pudding-Gerangel',
  tagline: 'Wer bleibt auf dem wackelnden Pudding?',
  instructions: ['Schubst die anderen vom Pudding.', 'Kirschen geben Extra-Punkte.'],
  controls: { joystick: 'Laufen', a: 'Schubsen', b: null },
  scoreUnit: 'Punkte',
};

const MINIGAME_PLAY: MinigameState = {
  id: 'pudding-gerangel',
  stage: 'play',
  elapsedMs: 12_345,
  ready: true,
  info: MINIGAME_INFO,
  round: 3,
  repeat: false,
  countdown: null,
  camera: { pos: [0, 11.5, -13.5], target: [0, -1.3, 0.8], fov: 0.8, fovAxis: 'vertical' },
  backdrop: { halfX: 7.2, halfZ: 7.2, groundY: -3.3, surface: 'decke' },
  figures: [
    {
      slot: 1,
      character: 'raccoon',
      pos: [-2.1, 0, 1.3],
      rot: [0, 0.383, 0, 0.924],
      scale: [1, 1, 1],
      visible: true,
      anim: 'run',
      animSeq: 4,
    },
    {
      slot: 2,
      character: 'sock',
      pos: [1.7, 0, -0.4],
      rot: [0, -0.259, 0, 0.966],
      scale: [1, 1, 1],
      visible: true,
      anim: 'hit',
      animSeq: 2,
    },
  ],
  scoreboard: {
    seconds: 48,
    banner: 'Kirschenregen!',
    waiting: false,
    scores: [
      {
        slot: 1,
        name: 'Anna',
        character: 'Wusel',
        color: '#0072B2',
        symbol: '●',
        score: 3,
        status: null,
        connected: true,
      },
      {
        slot: 2,
        name: 'Ben',
        character: 'Socke Sigi',
        color: '#E69F00',
        symbol: '▲',
        score: 1,
        status: 'raus',
        connected: true,
      },
    ],
  },
  results: null,
  effects: [
    { seq: 7, kind: 'impact', pos: [0.4, 0.8, 1.1], color: null, strength: 1 },
    { seq: 8, kind: 'shake', pos: [0, 0, 0], color: null, strength: 0.3 },
    { seq: 9, kind: 'sparkle', pos: [0.2, 0.6, 2.9], color: '#E0233D', strength: 1 },
  ],
  geometry: [QUAD_GEOMETRY],
  geometryTotal: 1,
  bodies: [
    {
      id: 'buehne#12',
      shape: 'cylinder',
      pos: [0, -0.25, 0],
      rot: [0, 0, 0, 1],
      size: [12, 0.5, 12],
      color: '#F4D35E',
      mesh: 'g1',
      finish: 'matt',
    },
    {
      id: 'kirsche#57',
      shape: 'sphere',
      pos: [0.2, 0.3, 2.9],
      rot: [0, 0, 0, 1],
      size: [0.6, 0.6, 0.6],
      color: '#D7263D',
      role: 'kirsche',
      key: '2',
      glow: '#3A0B11',
    },
    {
      id: 'kiste#61',
      shape: 'box',
      pos: [3.5, 0.5, 3.5],
      rot: [0.05, 0.2, -0.03, 0.978],
      size: [1, 1, 1],
      color: '#8D6E63',
      role: 'kirschfleck-vorwarnung',
      alpha: 0.4,
      twoSided: true,
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
  // CHAOS-166: 12 ist kein Vorschlag (die Lobby zeigt sie zusätzlich), der Schalter ist an.
  'lobby-settings': {
    phase: 'lobby',
    lobby: {
      ...JOIN,
      players: [ANNA, { ...BEN, ready: true, character: 'sock' }],
      settings: { ...SETTINGS, rounds: 12, moreReactionTime: true },
    },
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
    minigame: {
      ...MINIGAME_PLAY,
      stage: 'intro',
      elapsedMs: 0,
      bodies: [],
      hud: '',
      ready: false,
      repeat: true,
      countdown: 7,
      camera: null,
      figures: [],
      scoreboard: null,
      effects: [],
      geometry: [],
      geometryTotal: 0,
    },
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
      scoreboard: null,
      geometry: [],
      effects: [{ seq: 12, kind: 'confetti', pos: [-2.1, 1.6, 1.3], color: null, strength: 1 }],
      figures: MINIGAME_PLAY.figures.map((figure) => ({
        ...figure,
        anim: figure.slot === 1 ? 'cheer' : 'sad',
        animSeq: figure.animSeq + 1,
      })),
      results: {
        aborted: false,
        headline: 'Anna gewinnt!',
        highlights: ['Anna schnappt sich 3 Kirschen.'],
        rows: [
          {
            slot: 1,
            name: 'Anna',
            character: 'Wusel',
            color: '#0072B2',
            symbol: '●',
            place: 1,
            tied: false,
            scoreText: '5 Punkte',
            coins: 10,
            prizes: [],
          },
          {
            slot: 2,
            name: 'Ben',
            character: 'Socke Sigi',
            color: '#E69F00',
            symbol: '▲',
            place: 2,
            tied: false,
            scoreText: '2 Punkte',
            coins: 3,
            prizes: ['Schild'],
          },
        ],
      },
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
