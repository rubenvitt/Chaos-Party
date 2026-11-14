/**
 * Lesen und Schreiben von Nachrichten. Die Parser werfen nie: Jede Eingabe
 * ergibt ein `ParseResult`, kaputte Eingaben ein `ProtocolError` mit
 * festem Code (`too-large`, `bad-message`, `version-mismatch`).
 */
import type { z } from 'zod';
import {
  ClientMessageSchema,
  ControllerMessageSchema,
  HostMessageSchema,
  MAX_ERROR_MESSAGE_LENGTH,
  MAX_MESSAGE_LENGTH,
  ServerMessageSchema,
  ServerToControllerMessageSchema,
  ServerToHostMessageSchema,
} from './schemas.ts';
import type {
  ClientMessage,
  ControllerMessage,
  ErrorCode,
  ErrorMessage,
  HostMessage,
  ParseResult,
  ProtocolError,
  ProtocolMessage,
  ProtocolMessageType,
  Role,
  ServerMessage,
  ServerToControllerMessage,
  ServerToHostMessage,
} from './types.ts';
import { PROTOCOL_VERSION } from './version.ts';

function fail(code: ErrorCode, message: string): { ok: false; error: ProtocolError } {
  return { ok: false, error: { code, message: message.slice(0, MAX_ERROR_MESSAGE_LENGTH) } };
}

/**
 * Gemeinsamer Ablauf: Größe → JSON → Objekt → Version → Schema.
 * `raw` darf ein JSON-String oder ein bereits geparster Wert sein.
 */
function parseWith<T>(schema: z.ZodType<T>, raw: unknown): ParseResult<T> {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > MAX_MESSAGE_LENGTH) {
      return fail('too-large', `Nachricht länger als ${MAX_MESSAGE_LENGTH} Zeichen`);
    }
    try {
      value = JSON.parse(raw);
    } catch {
      return fail('bad-message', 'Kein gültiges JSON');
    }
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail('bad-message', 'Nachricht ist kein Objekt');
  }
  if (!Object.hasOwn(value, 'v')) {
    return fail('bad-message', 'Protokollversion fehlt');
  }
  const version = (value as { v: unknown }).v;
  if (version !== PROTOCOL_VERSION) {
    return fail(
      'version-mismatch',
      `Protokollversion ${PROTOCOL_VERSION} erwartet, ${describe(version)} erhalten`,
    );
  }

  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.map(String).join('.') : 'Nachricht';
    return fail('bad-message', `Ungültig bei ${where}: ${issue?.message ?? 'unbekannt'}`);
  }
  return { ok: true, message: result.data };
}

function describe(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return typeof value;
}

/** Erste Nachricht einer Verbindung oder beliebige Client-Nachricht (Controller oder Host). */
export function parseClientMessage(raw: unknown): ParseResult<ClientMessage> {
  return parseWith(ClientMessageSchema, raw);
}

/** Nachricht einer Verbindung, die sich als Controller angemeldet hat. */
export function parseControllerMessage(raw: unknown): ParseResult<ControllerMessage> {
  return parseWith(ControllerMessageSchema, raw);
}

/** Nachricht einer Verbindung, die sich als Host angemeldet hat. */
export function parseHostMessage(raw: unknown): ParseResult<HostMessage> {
  return parseWith(HostMessageSchema, raw);
}

/** Beliebige Server-Nachricht (z. B. für Test-Clients). */
export function parseServerMessage(raw: unknown): ParseResult<ServerMessage> {
  return parseWith(ServerMessageSchema, raw);
}

/** Server-Nachricht aus Sicht eines Controllers. */
export function parseServerToControllerMessage(
  raw: unknown,
): ParseResult<ServerToControllerMessage> {
  return parseWith(ServerToControllerMessageSchema, raw);
}

/** Server-Nachricht aus Sicht des Hosts. */
export function parseServerToHostMessage(raw: unknown): ParseResult<ServerToHostMessage> {
  return parseWith(ServerToHostMessageSchema, raw);
}

/** Serialisiert eine Nachricht für `WebSocket.send`. */
export function encode(message: ProtocolMessage): string {
  return JSON.stringify(message);
}

type MessageOf<T extends ProtocolMessageType> = Extract<ProtocolMessage, { type: T }>;
type BodyOf<T extends ProtocolMessageType> = Omit<MessageOf<T>, 'v' | 'type'>;

/**
 * Baut eine Nachricht mit aktueller Version, z. B.
 * `createMessage('move', { slot: 1, seq: 7, x: 0, y: 1 })`.
 */
export function createMessage<T extends ProtocolMessageType>(
  type: T,
  body: BodyOf<T>,
): MessageOf<T> {
  return { v: PROTOCOL_VERSION, type, ...body } as unknown as MessageOf<T>;
}

/** Baut eine Fehlernachricht; zu lange Texte werden gekürzt. */
export function createError(code: ErrorCode, message: string, seq?: number): ErrorMessage {
  const text = message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  return seq === undefined
    ? createMessage('error', { code, message: text })
    : createMessage('error', { code, message: text, seq });
}

/**
 * Rolle aus der ersten Nachricht einer Verbindung: `join`/`reconnect` → Controller,
 * `host-hello` → Host, alles andere → `null` (Server antwortet mit `not-joined`).
 */
export function handshakeRole(message: ClientMessage): Role | null {
  switch (message.type) {
    case 'join':
    case 'reconnect':
      return 'controller';
    case 'host-hello':
      return 'host';
    default:
      return null;
  }
}
