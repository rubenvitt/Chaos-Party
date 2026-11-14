/** Aus den Schemas abgeleitete TypeScript-Typen (eine Quelle der Wahrheit). */
import type { z } from 'zod';
import type {
  ACTIONS,
  BUTTONS,
  ClientMessageSchema,
  ContextMessageSchema,
  ControllerMessageSchema,
  ERROR_CODES,
  ErrorMessageSchema,
  FEEDBACK_KINDS,
  FeedbackMessageSchema,
  GESTURE_KINDS,
  GestureMessageSchema,
  HeartbeatAckMessageSchema,
  HeartbeatMessageSchema,
  HostHelloMessageSchema,
  HostMessageSchema,
  InputIntentSchema,
  InputMessageSchema,
  JoinMessageSchema,
  LAYOUTS,
  LobbyMessageSchema,
  LobbyPlayerSchema,
  MoveMessageSchema,
  PHASES,
  PlayerInfoSchema,
  PressMessageSchema,
  ReactionMessageSchema,
  ReadyMessageSchema,
  ReconnectMessageSchema,
  ReleaseMessageSchema,
  ServerMessageSchema,
  ServerToControllerMessageSchema,
  ServerToHostMessageSchema,
  StartMessageSchema,
  WelcomeMessageSchema,
} from './schemas.ts';

export type Phase = (typeof PHASES)[number];
export type Button = (typeof BUTTONS)[number];
export type GestureKind = (typeof GESTURE_KINDS)[number];
export type Action = (typeof ACTIONS)[number];
export type Layout = (typeof LAYOUTS)[number];
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];
export type ErrorCode = (typeof ERROR_CODES)[number];

// Controller → Server
export type JoinMessage = z.infer<typeof JoinMessageSchema>;
export type ReconnectMessage = z.infer<typeof ReconnectMessageSchema>;
export type ReadyMessage = z.infer<typeof ReadyMessageSchema>;
export type MoveMessage = z.infer<typeof MoveMessageSchema>;
export type PressMessage = z.infer<typeof PressMessageSchema>;
export type ReleaseMessage = z.infer<typeof ReleaseMessageSchema>;
export type GestureMessage = z.infer<typeof GestureMessageSchema>;
export type ReactionMessage = z.infer<typeof ReactionMessageSchema>;
export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;
export type ControllerMessage = z.infer<typeof ControllerMessageSchema>;

// Host → Server
export type HostHelloMessage = z.infer<typeof HostHelloMessageSchema>;
export type StartMessage = z.infer<typeof StartMessageSchema>;
export type HostMessage = z.infer<typeof HostMessageSchema>;

export type ClientMessage = z.infer<typeof ClientMessageSchema>;
export type ClientMessageType = ClientMessage['type'];

// Server → Controller
export type PlayerInfo = z.infer<typeof PlayerInfoSchema>;
export type WelcomeMessage = z.infer<typeof WelcomeMessageSchema>;
export type ContextMessage = z.infer<typeof ContextMessageSchema>;
export type FeedbackMessage = z.infer<typeof FeedbackMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type HeartbeatAckMessage = z.infer<typeof HeartbeatAckMessageSchema>;
export type ServerToControllerMessage = z.infer<typeof ServerToControllerMessageSchema>;

// Server → Host
export type LobbyPlayer = z.infer<typeof LobbyPlayerSchema>;
export type LobbyMessage = z.infer<typeof LobbyMessageSchema>;
export type InputIntent = z.infer<typeof InputIntentSchema>;
export type InputIntentType = InputIntent['type'];
export type InputMessage = z.infer<typeof InputMessageSchema>;
export type ServerToHostMessage = z.infer<typeof ServerToHostMessageSchema>;

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
export type ServerMessageType = ServerMessage['type'];

/** Jede Nachricht des Protokolls, egal in welche Richtung. */
export type ProtocolMessage = ClientMessage | ServerMessage;
export type ProtocolMessageType = ProtocolMessage['type'];

/** Nachrichten mit `slot` und `seq`, die einem Spielerplatz zugeordnet sind. */
export type SlotIntentMessage = Extract<ControllerMessage, { slot: number; seq: number }>;

/** Rolle einer Verbindung, festgelegt durch die erste Nachricht. */
export type Role = 'controller' | 'host';

export interface ProtocolError {
  code: ErrorCode;
  message: string;
}

export type ParseResult<T> = { ok: true; message: T } | { ok: false; error: ProtocolError };
