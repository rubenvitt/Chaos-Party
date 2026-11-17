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
import { CHARACTER_IDS, MINIGAME_STAGES } from '@chaos-party/protocol';
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
}

/** Host-Befehle, die `hostCommand` versteht (wie die Knöpfe am PC-Host). */
export const HOST_COMMANDS = ['start', 'pause', 'resume', 'end-game', 'rematch'] as const;
export type HostCommandName = (typeof HOST_COMMANDS)[number];

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
  /** Einer von `HOST_COMMANDS`; Unbekanntes wird geloggt und ignoriert. */
  hostCommand(cmd: string): void;
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

export const BoardStateSchema = z.strictObject({
  round: z.number().int().min(1),
  rounds: z.number().int().min(1),
  activeSlot: slot.nullable(),
  spaces: z.array(BoardSpaceSchema),
  pawns: z.array(PawnSchema),
  /** Die letzten Ereignistexte (höchstens `MAX_MESSAGES`), älteste zuerst. */
  messages: z.array(z.string()),
});

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
});

export const MinigameStateSchema = z.strictObject({
  id: z.string(),
  stage: z.enum(MINIGAME_STAGES),
  elapsedMs: z.number().min(0),
  bodies: z.array(BodySchema),
  hud: z.string(),
});

export const RenderStateSchema = z.strictObject({
  phase: z.enum(CONTRACT_PHASES),
  lobby: z.strictObject({
    joinUrl: z.string(),
    joinCode: z.string(),
    players: z.array(LobbyPlayerSchema),
  }),
  board: BoardStateSchema.nullable(),
  minigame: MinigameStateSchema.nullable(),
});

export type LobbyPlayer = z.infer<typeof LobbyPlayerSchema>;
export type BoardState = z.infer<typeof BoardStateSchema>;
export type Body = z.infer<typeof BodySchema>;
export type MinigameState = z.infer<typeof MinigameStateSchema>;
export type RenderState = z.infer<typeof RenderStateSchema>;
