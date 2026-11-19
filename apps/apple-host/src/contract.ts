/**
 * Vertrag zwischen JS-Kern und Swift-App (ADR-019 §2, CHAOS-139). Menschenlesbar in
 * `../CONTRACT.md`; dies hier ist die Quelle der Wahrheit:
 *
 * - `HostEnv`, `ChaosHostApi`, `ChaosHostInstance`: was Swift hineingibt und aufruft.
 * - `RenderStateSchema`: was `renderState()` liefert. Streng (`strictObject`): Ein neues Feld muss
 *   hier eingetragen werden, sonst scheitert der Bündel-Test. Swift dekodiert nachsichtig
 *   (`apps/apple-host/app/RenderState.swift`) und prüft die Beispielnachrichten im Harness.
 *
 * Koordinaten sind roh aus Babylon/game-core: linkshändig, y oben, x rechts, z nach hinten.
 * RealityKit (rechtshändig) spiegelt z und die x/y-Anteile der Quaternion.
 */
import {
  CHARACTER_IDS,
  MAX_ROUND_PRESETS,
  MINIGAME_STAGES,
  RoundsSchema,
} from '@chaos-party/protocol';
import { z } from 'zod';

// --- Swift → JS ------------------------------------------------------------------------------

export interface HostEnv {
  /** Text-Frame an eine Controller-Verbindung. */
  send(connId: number, text: string): void;
  close(connId: number, code: number, reason: string): void;
  log(line: string): void;
  /** Swift: `SecRandomCopyBytes`. Muss genau `n` Bytes liefern. */
  randomBytes(n: number): number[];
  /** Inhalt von `HavokPhysics.wasm`; am besten ohne Kopie als `Uint8Array`. */
  havokWasm: Uint8Array | number[];
  /** `http://<ip>:<port>/?code=<CODE>` für den QR-Code. */
  joinUrl: string;
  /** 4 Zeichen aus dem Alphabet von `apps/server/src/ids.ts`. */
  joinCode: string;
  /**
   * `true`: `host-ready` erst nach `sceneReady()` (die App lädt Brett und Figuren, CHAOS-142,
   * CHAOS-68). Fehlt der Wert, ist der Host sofort bereit (Harness, Tests, `--selftest`).
   */
  deferSceneReady?: boolean;
}

/** Host-Befehle, die `hostCommand` versteht (wie die Knöpfe am PC-Host). */
export const HOST_COMMANDS = ['start', 'pause', 'resume', 'end-game', 'rematch'] as const;
export type HostCommandName = (typeof HOST_COMMANDS)[number];

/**
 * Lobby-Einstellungen über `hostCommand` (CHAOS-166), wie Rundenwahl und Schalter am PC-Host:
 * `configure:rounds=12`, `configure:moreReactionTime=1` (`0`/`1`/`true`/`false`) oder beides
 * mit Komma: `configure:rounds=12,moreReactionTime=1`. Runden 1–`MAX_ROUNDS`. Nur in der Lobby;
 * sonst und bei ungültigem Text loggt der Kern und sendet nichts. Ergebnis in
 * `renderState().lobby.settings`. Parser: `./hostCommand.ts`.
 */
export const CONFIGURE_PREFIX = 'configure:';

export interface ChaosHostInstance {
  /** Neue WebSocket-Verbindung an `/ws`. IDs > 0 (negative nutzt der Kern selbst). */
  open(connId: number): void;
  /** Eingehender Text-Frame. */
  message(connId: number, text: string): void;
  closed(connId: number): void;
  /**
   * ~60× pro s (Anzeige-Takt). Beliebige monotone ms-Uhr (`CACurrentMediaTime() * 1000`); der
   * Kern zählt ab dem ersten Aufruf von 0. Treibt Zeitgeber, Session-Fristen und die festen
   * 1/60-Schritte der Minispiele.
   */
  tick(nowMs: number): void;
  /** JSON nach `RenderStateSchema`; Swift ruft es je Bild nach `tick` auf. */
  renderState(): string;
  /** Einer von `HOST_COMMANDS` oder `configure:…` (`CONFIGURE_PREFIX`); Unbekanntes wird geloggt und ignoriert. */
  hostCommand(cmd: string): void;
  /** Szene geladen (nur mit `env.deferSceneReady`): schickt `host-ready` (CHAOS-142). */
  sceneReady(): void;
}

/** `globalThis.ChaosHost` im Bündel. */
export interface ChaosHostApi {
  create(env: HostEnv): ChaosHostInstance;
}

/** `globalThis.ChaosHostInternals`: nur für Harness und Tests. */
export interface ChaosHostInternals {
  base64url(bytes: Uint8Array): string;
  /** Minispiele der Rotation; eine ganze Partie muss jedes davon aufbauen. */
  rotation: readonly string[];
  /**
   * Wartende Zeitgeber der virtuellen Uhr (CHAOS-141): wächst die Zahl über Partien, hält eine
   * Warteschlange entsorgte Szenen fest (vgl. CHAOS-126).
   */
  pendingTimers(): number;
}

// --- JS → Swift: renderState -----------------------------------------------------------------

export const CONTRACT_PHASES = ['lobby', 'board', 'minigame', 'final', 'paused'] as const;
export type ContractPhase = (typeof CONTRACT_PHASES)[number];

export const BODY_SHAPES = ['sphere', 'box', 'cylinder'] as const;
export type BodyShape = (typeof BODY_SHAPES)[number];

const slot = z.number().int().min(1).max(4);
const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const character = z.enum(CHARACTER_IDS);

export const LobbyPlayerSchema = z.strictObject({
  slot,
  name: z.string(),
  color: hexColor,
  connected: z.boolean(),
  ready: z.boolean(),
  character: character.nullable(),
});

/**
 * Lobby-Einstellungen der nächsten Partie (CHAOS-166), der Server-Stand aus `lobby.settings`;
 * ändern über `hostCommand('configure:…')`.
 */
export const LobbySettingsStateSchema = z.strictObject({
  /** Rundenzahl der nächsten Partie (1–`MAX_ROUNDS`). */
  rounds: RoundsSchema,
  /** Vorschläge für die Rundenwahl, aufsteigend (Server: 10, 16, 20). */
  roundPresets: z.array(RoundsSchema).min(1).max(MAX_ROUND_PRESETS),
  /** „Mehr Zeit zum Reagieren“ (CHAOS-124): Reaktionsfenster 5 s statt 3 s. */
  moreReactionTime: z.boolean(),
});

export const BoardSpaceSchema = z.strictObject({
  id: z.string(),
  x: z.number(),
  z: z.number(),
  /** `SpaceKind` aus game-core (`start`, `coins-plus`, `coins-minus`, `event`, `item`, `trophy`). */
  kind: z.string(),
});

export const PawnSchema = z.strictObject({
  slot,
  spaceId: z.string(),
  /** Feldmitte plus Versatz, wenn mehrere Figuren auf einem Feld stehen (`spreadPawns`). */
  x: z.number(),
  z: z.number(),
  character,
});

export const NoticeSchema = z.strictObject({
  title: z.string(),
  detail: z.string(),
});

export const BoardStateSchema = z.strictObject({
  round: z.number().int().min(1),
  rounds: z.number().int().min(1),
  activeSlot: slot.nullable(),
  spaces: z.array(BoardSpaceSchema),
  pawns: z.array(PawnSchema),
  /** Die letzten Ereignistexte (höchstens `MAX_MESSAGES`), älteste zuerst. */
  messages: z.array(z.string()),
  /**
   * Große Einblendung oben mittig (CHAOS-157), z. B. „Sabotage wird stärker!“ /
   * „Klau: 6 Münzen · Falle: 5 Münzen“ in Wachstumsrunden; 4 s sichtbar, sonst `null`.
   */
  notice: NoticeSchema.nullable(),
});

/** Oberflächen aus `look.material` (`LookFinish` im minigame-sdk, CHAOS-62). */
export const MATERIAL_FINISHES = ['matt', 'lack', 'glanz', 'metall', 'stoff'] as const;

export const BodySchema = z.strictObject({
  /** `<Mesh-Name>#<uniqueId>`, stabil solange das Mesh lebt. */
  id: z.string(),
  shape: z.enum(BODY_SHAPES),
  /** Weltmitte der Bounding-Box. */
  pos: vec3,
  /** Weltrotation als Quaternion (x, y, z, w). */
  rot: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  /** Lokale Ausdehnung × Skalierung (vor der Rotation). */
  size: vec3,
  color: hexColor,
  /**
   * Geometrie aus `minigame.geometry` (CHAOS-144). Skalierung = `size` / `extent` der Geometrie
   * je Achse (Achse ohne Ausdehnung: 1). Fehlt sie oder ist sie noch nicht angekommen, zeichnet
   * Swift die Grundform `shape`.
   */
  mesh: z.string().optional(),
  /** Darstellungs-Rolle (`markVisual`, CHAOS-149); fehlt = Kulisse des Minispiels. */
  role: z.string().optional(),
  /** Schlüssel der Rolle (Slot, laufende Nummer). */
  key: z.string().optional(),
  /** Deckkraft (Material × Sichtbarkeit), nur wenn kleiner 1. */
  alpha: z.number().min(0).max(1).optional(),
  /** Eigenleuchten, nur wenn nicht schwarz. */
  glow: hexColor.optional(),
  /** Oberfläche aus `look.material`; fehlt = `lack`. */
  finish: z.enum(MATERIAL_FINISHES).optional(),
  /** Beide Seiten zeichnen (`backFaceCulling = false`). */
  twoSided: z.boolean().optional(),
});

/**
 * Geometrie eines Minispiel-Meshes (CHAOS-144), einmal je Minispiel. Base64 (Standard, mit
 * Auffüllung) der rohen Bytes, little-endian: `positions` Float32 × 3, um die Mitte der lokalen
 * Bounding-Box verschoben; `normals` Int8 × 3 (÷ 127); `indices` Uint16 (`wideIndices`:
 * Uint32), je drei ein Dreieck. Koordinaten roh aus Babylon (linkshändig).
 */
export const MinigameGeometrySchema = z.strictObject({
  id: z.string(),
  vertices: z.number().int().min(3),
  positions: z.string(),
  normals: z.string(),
  indices: z.string(),
  wideIndices: z.boolean(),
  /** Kantenlängen der lokalen Bounding-Box (Bezug für `size` der Körper). */
  extent: vec3,
});

/** Figur eines Spielers im Minispiel; Swift zeichnet das USDZ der Figur (CHAOS-140). */
export const MinigameFigureSchema = z.strictObject({
  slot,
  character,
  /** Welt-Lage des Figuren-Wurzelknotens (Füße), Rotation (x, y, z, w), Skalierung. */
  pos: vec3,
  rot: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  scale: vec3,
  visible: z.boolean(),
  /** Zuletzt gespielte Animation (`CHARACTER_ANIMATIONS`). */
  anim: z.string(),
  /** Zählt bei jedem `play` hoch: gleiche Animation zweimal heißt zweimal abspielen. */
  animSeq: z.number().int().min(0),
});

export const MinigameCameraSchema = z.strictObject({
  pos: vec3,
  target: vec3,
  /** Öffnungswinkel in Radiant. */
  fov: z.number(),
  /** Achse, auf die sich `fov` bezieht (Babylon: `fovMode`). */
  fovAxis: z.enum(['vertical', 'horizontal']),
});

/** `LookArea` aus `look.backdrop` (CHAOS-62): freie Spielfläche um den Ursprung. */
export const MinigameBackdropSchema = z.strictObject({
  halfX: z.number(),
  halfZ: z.number(),
  groundY: z.number(),
  surface: z.enum(['wiese', 'decke']),
});

/** Effekt aus `ctx.fx`: Partikel-Ausbruch (`VfxId`) oder Kamerawackeln (`shake`). */
export const MinigameEffectSchema = z.strictObject({
  /** Fortlaufend je Minispiel; Swift spielt jede Nummer einmal. */
  seq: z.number().int().min(1),
  kind: z.string(),
  pos: vec3,
  color: hexColor.nullable(),
  /** Stärke 0–1 (nur `shake`). */
  strength: z.number(),
});

export const MinigameControlsSchema = z.strictObject({
  joystick: z.string().nullable(),
  a: z.string().nullable(),
  b: z.string().nullable(),
});

/** Steckbrief für Anleitung und HUD (`MinigameInfo`). */
export const MinigameInfoSchema = z.strictObject({
  title: z.string(),
  tagline: z.string(),
  instructions: z.array(z.string()),
  controls: MinigameControlsSchema,
  scoreUnit: z.string(),
});

const playerLabel = {
  slot,
  name: z.string(),
  /** Anzeigename der Figur („Wusel“). */
  character: z.string(),
  color: hexColor,
  /** Slot-Symbol (●, ▲, ■, ★), immer zusätzlich zur Farbe. */
  symbol: z.string(),
};

export const MinigameScoreSchema = z.strictObject({
  ...playerLabel,
  score: z.number(),
  /** Kurzer Zustand aus dem HUD („raus“), bei Trennung „⚠ getrennt“. */
  status: z.string().nullable(),
  connected: z.boolean(),
});

export const MinigameScoreboardSchema = z.strictObject({
  /** Ganze Restsekunden. */
  seconds: z.number().int().min(0),
  banner: z.string().nullable(),
  /** Restzeit zu kurz für einen Neustart nach Host-Neuladen: Server wertet aus. */
  waiting: z.boolean(),
  scores: z.array(MinigameScoreSchema),
});

export const MinigameResultRowSchema = z.strictObject({
  ...playerLabel,
  place: z.number().int().min(1),
  tied: z.boolean(),
  /** „7 Socken“ */
  scoreText: z.string(),
  /** Gewonnene Münzen; `null` = unbekannt. */
  coins: z.number().int().nullable(),
  /** Trostpreis-Items (Anzeigenamen, CHAOS-51). */
  prizes: z.array(z.string()),
});

/** `resultsDisplay` aus `apps/host/src/minigame/results.ts`. */
export const MinigameResultsSchema = z.strictObject({
  aborted: z.boolean(),
  headline: z.string(),
  rows: z.array(MinigameResultRowSchema),
  highlights: z.array(z.string()),
});

export const MinigameStateSchema = z.strictObject({
  id: z.string(),
  stage: z.enum(MINIGAME_STAGES),
  elapsedMs: z.number().min(0),
  bodies: z.array(BodySchema),
  /** Kurzfassung als eine Zeile (Debug-Anzeige). */
  hud: z.string(),
  /** Bühne aufgebaut (Szene steht, Körper und Geometrie kommen). */
  ready: z.boolean(),
  info: MinigameInfoSchema,
  /** Runde der Partie, in der das Minispiel läuft. */
  round: z.number().int().min(1),
  /** Lief in der Partie schon: kurze Anleitung (CHAOS-66). */
  repeat: z.boolean(),
  /** Intro: ganze Sekunden bis zum Start, sonst `null`. */
  countdown: z.number().int().min(0).nullable(),
  camera: MinigameCameraSchema.nullable(),
  backdrop: MinigameBackdropSchema.nullable(),
  figures: z.array(MinigameFigureSchema),
  /** Nur im Spiel. */
  scoreboard: MinigameScoreboardSchema.nullable(),
  /** Nur im Ergebnis. */
  results: MinigameResultsSchema.nullable(),
  /** Effekte der letzten Sekunden (Swift spielt neue `seq`). */
  effects: z.array(MinigameEffectSchema),
  /**
   * Neue Geometrie seit dem letzten `renderState` (in Stücken, höchstens etwa 256 KB je Aufruf).
   * Jeder Eintrag kommt genau einmal; Swift sammelt sie je Minispiel.
   */
  geometry: z.array(MinigameGeometrySchema),
  /** So viele Geometrien kennt die Bühne bisher (ausgeliefert oder wartend). */
  geometryTotal: z.number().int().min(0),
});

export const RenderStateSchema = z.strictObject({
  phase: z.enum(CONTRACT_PHASES),
  lobby: z.strictObject({
    joinUrl: z.string(),
    joinCode: z.string(),
    players: z.array(LobbyPlayerSchema),
    /** `null`, bis die Host-Rolle die erste `lobby`-Nachricht hat (CHAOS-166). */
    settings: LobbySettingsStateSchema.nullable(),
  }),
  board: BoardStateSchema.nullable(),
  minigame: MinigameStateSchema.nullable(),
});

export type LobbyPlayer = z.infer<typeof LobbyPlayerSchema>;
export type LobbySettingsState = z.infer<typeof LobbySettingsStateSchema>;
export type Notice = z.infer<typeof NoticeSchema>;
export type BoardState = z.infer<typeof BoardStateSchema>;
export type Body = z.infer<typeof BodySchema>;
export type MinigameState = z.infer<typeof MinigameStateSchema>;
export type MaterialFinish = (typeof MATERIAL_FINISHES)[number];
export type MinigameGeometry = z.infer<typeof MinigameGeometrySchema>;
export type MinigameFigure = z.infer<typeof MinigameFigureSchema>;
export type MinigameCamera = z.infer<typeof MinigameCameraSchema>;
export type MinigameBackdrop = z.infer<typeof MinigameBackdropSchema>;
export type MinigameEffect = z.infer<typeof MinigameEffectSchema>;
export type MinigameInfoView = z.infer<typeof MinigameInfoSchema>;
export type MinigameScoreboard = z.infer<typeof MinigameScoreboardSchema>;
export type MinigameResults = z.infer<typeof MinigameResultsSchema>;
export type RenderState = z.infer<typeof RenderStateSchema>;
