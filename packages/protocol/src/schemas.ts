/**
 * Zod-Schemas aller Nachrichten zwischen Controller, Server und Host.
 *
 * Grundsätze (Begründung in `docs/decisions/ADR-003-protokoll.md`):
 * - JSON über einen WebSocket-Endpunkt; jede Nachricht ist ein flaches Objekt
 *   mit `v` (Protokollversion) und `type` (Diskriminator).
 * - Alle Objekte sind **strikt**: unbekannte Felder führen zur Ablehnung, damit
 *   manipulierte Nachrichten nicht still durchrutschen.
 * - Eingaben vom Controller tragen `slot` und eine pro Verbindung streng
 *   steigende Sequenznummer `seq` (Annahme B8). Client-Zeitstempel werden nur
 *   als Echo zurückgegeben, nie für Spiellogik verwendet.
 */
import { z } from 'zod';
import { MAX_PLAYERS } from './players.ts';
import { PROTOCOL_VERSION } from './version.ts';

// ---------------------------------------------------------------------------
// Grenzen
// ---------------------------------------------------------------------------

/** Größte zulässige Nachricht als JSON-Text (Zeichen). Größere werden ungelesen verworfen. */
export const MAX_MESSAGE_LENGTH = 4096;
/** Toleranz für die Joystick-Länge (Rundung auf dem Gerät). */
export const STICK_EPSILON = 0.001;
export const MAX_NAME_LENGTH = 16;
export const MAX_LABEL_LENGTH = 24;
export const MAX_ERROR_MESSAGE_LENGTH = 200;
export const MAX_JOIN_URL_LENGTH = 512;

// ---------------------------------------------------------------------------
// Aufzählungen
// ---------------------------------------------------------------------------

/** Spielphasen in M1. Später kommen Brett-, Minispiel- und Ergebnisphasen hinzu. */
export const PHASES = ['lobby', 'play'] as const;
export const BUTTONS = ['a', 'b'] as const;
export const GESTURE_KINDS = ['swipe-up', 'swipe-down', 'swipe-left', 'swipe-right'] as const;
/** Was ein Controller-Slot in der aktuellen Phase anbieten soll. */
export const ACTIONS = ['ready', 'move', 'button-a', 'button-b', 'gesture', 'reaction'] as const;
/** Bildschirmaufbau eines Controller-Slots. */
export const LAYOUTS = ['wait', 'lobby', 'joystick-buttons'] as const;
/** Kurze Rückmeldung an einen Slot (Vibration, Farbblitz, Ton – Darstellung entscheidet der Controller). */
export const FEEDBACK_KINDS = ['confirm', 'hit', 'miss', 'win', 'lose'] as const;
export const ERROR_CODES = [
  'bad-message',
  'too-large',
  'version-mismatch',
  'not-joined',
  'bad-join-code',
  'session-full',
  'bad-token',
  'host-taken',
  'not-your-slot',
  'out-of-phase',
  'stale-seq',
  'rate-limited',
  'internal',
] as const;

export const PhaseSchema = z.enum(PHASES);
export const ButtonSchema = z.enum(BUTTONS);
export const GestureKindSchema = z.enum(GESTURE_KINDS);
export const ActionSchema = z.enum(ACTIONS);
export const LayoutSchema = z.enum(LAYOUTS);
export const FeedbackKindSchema = z.enum(FEEDBACK_KINDS);
export const ErrorCodeSchema = z.enum(ERROR_CODES);

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

export const VersionSchema = z.literal(PROTOCOL_VERSION);
export const SlotSchema = z.literal([1, 2, 3, 4]);
/** Sequenznummer: nicht-negative, sichere Ganzzahl. */
export const SeqSchema = z.int().nonnegative();
export const AxisSchema = z.number().min(-1).max(1);

/** Kurzer Join-Code, vom Server erzeugt: 4–8 Großbuchstaben/Ziffern. */
export const JoinCodeSchema = z.string().regex(/^[A-Z0-9]{4,8}$/);
/** Undurchsichtiges, vom Server erzeugtes Token (base64url), 16–128 Zeichen. */
export const SessionTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);
export const ColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/**
 * Steuerzeichen (C0, DEL, C1) und Bidi-Steuerzeichen sind in Anzeigetexten
 * verboten: Sie können Namen auf Host und Controller unsichtbar verfälschen.
 */
function isForbiddenCodePoint(code: number): boolean {
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

function hasForbiddenChars(text: string): boolean {
  for (const char of text) {
    if (isForbiddenCodePoint(char.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

function displayText(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((text) => !hasForbiddenChars(text), 'Steuerzeichen sind nicht erlaubt')
    .refine((text) => text.trim() === text, 'Kein Leerraum am Rand erlaubt');
}

export const PlayerNameSchema = displayText(MAX_NAME_LENGTH);
export const PlayerLabelSchema = displayText(MAX_LABEL_LENGTH);

function hasUniqueSlots(items: readonly { slot: number }[]): boolean {
  return new Set(items.map((item) => item.slot)).size === items.length;
}

function stickInRange(stick: { x: number; y: number }): boolean {
  return Math.hypot(stick.x, stick.y) <= 1 + STICK_EPSILON;
}

const STICK_ISSUE = { message: 'Joystick-Vektor länger als 1', path: ['x'] };

// ---------------------------------------------------------------------------
// Eingabe-Intents (ohne Umschlag), auch zur Weiterleitung an den Host
// ---------------------------------------------------------------------------

const slotSeq = { slot: SlotSchema, seq: SeqSchema };

export const MoveIntentSchema = z
  .strictObject({ type: z.literal('move'), ...slotSeq, x: AxisSchema, y: AxisSchema })
  .refine(stickInRange, STICK_ISSUE);
export const PressIntentSchema = z.strictObject({
  type: z.literal('press'),
  ...slotSeq,
  button: ButtonSchema,
});
export const ReleaseIntentSchema = z.strictObject({
  type: z.literal('release'),
  ...slotSeq,
  button: ButtonSchema,
});
export const GestureIntentSchema = z.strictObject({
  type: z.literal('gesture'),
  ...slotSeq,
  kind: GestureKindSchema,
});
export const ReactionIntentSchema = z.strictObject({
  type: z.literal('reaction'),
  ...slotSeq,
  windowId: SeqSchema,
});

/** Spieleingaben, die der Server nach Prüfung an den Host weiterreicht. */
export const InputIntentSchema = z.discriminatedUnion('type', [
  MoveIntentSchema,
  PressIntentSchema,
  ReleaseIntentSchema,
  GestureIntentSchema,
  ReactionIntentSchema,
]);

// ---------------------------------------------------------------------------
// Controller → Server
// ---------------------------------------------------------------------------

export const JoinMessageSchema = z
  .strictObject({
    v: VersionSchema,
    type: z.literal('join'),
    joinCode: JoinCodeSchema,
    /** Anzahl Spielerplätze dieser Verbindung (iPhone: 1, geteiltes iPad: 2–4; Annahme A9). */
    seats: z.int().min(1).max(MAX_PLAYERS),
    names: z.array(PlayerNameSchema).min(1).max(MAX_PLAYERS).optional(),
  })
  .refine((join) => join.names === undefined || join.names.length <= join.seats, {
    message: 'Mehr Namen als Plätze',
    path: ['names'],
  });

export const ReconnectMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('reconnect'),
  sessionToken: SessionTokenSchema,
});

export const ReadyMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('ready'),
  ...slotSeq,
});

export const MoveMessageSchema = z
  .strictObject({
    v: VersionSchema,
    type: z.literal('move'),
    ...slotSeq,
    x: AxisSchema,
    y: AxisSchema,
  })
  .refine(stickInRange, STICK_ISSUE);

export const PressMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('press'),
  ...slotSeq,
  button: ButtonSchema,
});

export const ReleaseMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('release'),
  ...slotSeq,
  button: ButtonSchema,
});

export const GestureMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('gesture'),
  ...slotSeq,
  kind: GestureKindSchema,
});

export const ReactionMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('reaction'),
  ...slotSeq,
  windowId: SeqSchema,
});

/** Herzschlag von Controller oder Host. `t` ist die Client-Uhr und wird nur zurückgespiegelt (B8). */
export const HeartbeatMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('heartbeat'),
  t: z.number(),
});

const controllerMessageOptions = [
  JoinMessageSchema,
  ReconnectMessageSchema,
  ReadyMessageSchema,
  MoveMessageSchema,
  PressMessageSchema,
  ReleaseMessageSchema,
  GestureMessageSchema,
  ReactionMessageSchema,
  HeartbeatMessageSchema,
] as const;

export const ControllerMessageSchema = z.discriminatedUnion('type', controllerMessageOptions);

// ---------------------------------------------------------------------------
// Host → Server
// ---------------------------------------------------------------------------

export const HostHelloMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('host-hello'),
});

export const StartMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('start'),
});

export const HostMessageSchema = z.discriminatedUnion('type', [
  HostHelloMessageSchema,
  StartMessageSchema,
  HeartbeatMessageSchema,
]);

/** Alles, was ein Client senden darf (vor dem Handshake ist die Rolle noch unbekannt). */
export const ClientMessageSchema = z.discriminatedUnion('type', [
  ...controllerMessageOptions,
  HostHelloMessageSchema,
  StartMessageSchema,
]);

// ---------------------------------------------------------------------------
// Server → Controller
// ---------------------------------------------------------------------------

export const PlayerInfoSchema = z.strictObject({
  slot: SlotSchema,
  color: ColorSchema,
  label: PlayerLabelSchema,
});

export const WelcomeMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('welcome'),
  sessionToken: SessionTokenSchema,
  players: z
    .array(PlayerInfoSchema)
    .min(1)
    .max(MAX_PLAYERS)
    .refine(hasUniqueSlots, 'Slots doppelt'),
});

export const ContextMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('context'),
  slot: SlotSchema,
  phase: PhaseSchema,
  layout: LayoutSchema,
  actions: z.array(ActionSchema).max(ACTIONS.length),
});

export const FeedbackMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('feedback'),
  slot: SlotSchema,
  kind: FeedbackKindSchema,
});

export const ErrorMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('error'),
  code: ErrorCodeSchema,
  message: z.string().max(MAX_ERROR_MESSAGE_LENGTH),
  /** Sequenznummer der abgelehnten Eingabe, falls bekannt. */
  seq: SeqSchema.optional(),
});

export const HeartbeatAckMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('heartbeat-ack'),
  t: z.number(),
});

export const ServerToControllerMessageSchema = z.discriminatedUnion('type', [
  WelcomeMessageSchema,
  ContextMessageSchema,
  FeedbackMessageSchema,
  ErrorMessageSchema,
  HeartbeatAckMessageSchema,
]);

// ---------------------------------------------------------------------------
// Server → Host
// ---------------------------------------------------------------------------

export const LobbyPlayerSchema = z.strictObject({
  slot: SlotSchema,
  color: ColorSchema,
  label: PlayerLabelSchema,
  connected: z.boolean(),
  ready: z.boolean(),
});

/** Sitzungs-Schnappschuss für den Host; wird bei jeder Änderung neu gesendet (auch in `play`). */
export const LobbyMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('lobby'),
  joinCode: JoinCodeSchema,
  joinUrl: z
    .url({ protocol: /^https?$/ })
    .max(MAX_JOIN_URL_LENGTH)
    .optional(),
  phase: PhaseSchema,
  players: z.array(LobbyPlayerSchema).max(MAX_PLAYERS).refine(hasUniqueSlots, 'Slots doppelt'),
});

/** Geprüfte Controller-Eingabe; `at` ist die Server-Empfangszeit in ms (monoton, Server-Uhr). */
export const InputMessageSchema = z.strictObject({
  v: VersionSchema,
  type: z.literal('input'),
  intent: InputIntentSchema,
  at: z.number().nonnegative(),
});

export const ServerToHostMessageSchema = z.discriminatedUnion('type', [
  LobbyMessageSchema,
  InputMessageSchema,
  ErrorMessageSchema,
  HeartbeatAckMessageSchema,
]);

export const ServerMessageSchema = z.discriminatedUnion('type', [
  WelcomeMessageSchema,
  ContextMessageSchema,
  FeedbackMessageSchema,
  LobbyMessageSchema,
  InputMessageSchema,
  ErrorMessageSchema,
  HeartbeatAckMessageSchema,
]);
