/**
 * Bot-Partie gegen das gebaute Bündel in einem nackten `node:vm`-Kontext (CHAOS-139): ohne
 * `setTimeout`, `performance`, `structuredClone`, `console`, `URL` – so nah an JavaScriptCore,
 * wie es ohne Mac geht. Gleicher Ablauf wie der Swift-Harness (`../harness/main.swift`):
 * Controller mit echten Protokoll-Nachrichten, virtuelle Uhr mit 60 Ticks je Spielsekunde,
 * `renderState` wird gegen den Vertrag geprüft.
 *
 * Für Vitest (`bundle.test.ts`) und die Kommandozeile (`pnpm --filter @chaos-party/apple-host bots`).
 */
import { setImmediate as nextMacrotask } from 'node:timers/promises';
import { createContext, runInContext } from 'node:vm';
import {
  RenderStateSchema,
  type ChaosHostApi,
  type ChaosHostInstance,
  type ChaosHostInternals,
  type HostEnv,
  type RenderState,
} from '../src/contract.ts';

export const JOIN_CODE = 'AB12';
const STEP_MS = 1000 / 60;
/** Großer Startwert wie `CACurrentMediaTime() * 1000`: Der Kern muss ab dem ersten Tick zählen. */
const CLOCK_OFFSET_MS = 123_456_789;
const PROTOCOL_VERSION = 4;

export interface LoadedBundle {
  readonly api: ChaosHostApi;
  readonly internals: ChaosHostInternals;
  /** Namen der Globals, die das nackte Kontext vor dem Laden hatte (ohne ECMAScript-Builtins). */
  readonly hostGlobals: readonly string[];
}

/** Bündel in ein frisches, nacktes Kontext laden. */
export function loadBundle(code: string): LoadedBundle {
  const context = createContext({});
  const before = runInContext('Object.getOwnPropertyNames(globalThis)', context) as string[];
  runInContext(code, context, { filename: 'chaos-host.js' });
  const global = context as { ChaosHost?: ChaosHostApi; ChaosHostInternals?: ChaosHostInternals };
  if (!global.ChaosHost || !global.ChaosHostInternals) {
    throw new Error('Bündel setzt ChaosHost/ChaosHostInternals nicht');
  }
  return { api: global.ChaosHost, internals: global.ChaosHostInternals, hostGlobals: before };
}

/**
 * Wie Swift ein JS-Objekt ruft: danach laufen alle Mikrotasks leer (JavaScriptCore macht das
 * nach jedem Aufruf aus Swift; ohne das löst z. B. Havok nie auf). Node leert sie, sobald der
 * Aufrufer abgibt; ein Makrotask-Schritt wartet, bis die Kette ganz durch ist.
 */
export async function settle(): Promise<void> {
  await nextMacrotask();
}

/** Deterministischer Zufall (xorshift32) statt SecRandom: gleiche Partie bei gleichem Seed. */
export function seededBytes(seed: number): (n: number) => number[] {
  let state = seed >>> 0 || 1;
  return (n) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      out.push(state & 0xff);
    }
    return out;
  };
}

interface Controller {
  readonly id: number;
  readonly name: string;
  readonly character: string;
  seq: number;
  slot: number | null;
  actions: string[];
  readonly answered: Set<number>;
  lastHeartbeat: number;
  lastInput: number;
  pressed: boolean;
  picked: boolean;
}

export interface BotMatchOptions {
  readonly code: string;
  readonly wasm: Uint8Array;
  /** Ganze Partie bis zum Endstand; sonst bis zur Ergebnisanzeige des ersten Minispiels. */
  readonly full: boolean;
  readonly seed?: number;
  /** Jedes n-te `renderState` gegen den Vertrag prüfen (Phasenwechsel immer). */
  readonly validateEvery?: number;
  /** Abbruch nach so viel virtueller Spielzeit. */
  readonly limitMs?: number;
  /**
   * So viele ganze Partien nacheinander, verbunden über „Revanche“ (nur mit `full`; Standard 1).
   * Speichermessung über mehrere Partien (CHAOS-141).
   */
  readonly matches?: number;
  /**
   * Nach jeder ganzen Partie (Endstand erreicht), vor der Revanche; Zählung ab 1, dazu die
   * wartenden Zeitgeber des Kerns.
   */
  readonly onMatchEnd?: (match: number, pendingTimers: number) => void | Promise<void>;
  /** JS-Zeit je Bild (`tick` mit den Mikrotasks danach + `renderState`, echte ms) und Phase des Vorbilds (CHAOS-141). */
  readonly onFrame?: (frame: FrameTiming) => void;
  /** Erstes `renderState` je Phase/Stufe (für Beispielnachrichten). */
  readonly onPhase?: (key: string, state: RenderState) => void;
  readonly log?: ((line: string) => void) | undefined;
  /** Wie die App: `host-ready` erst nach `sceneReady()`, das nach dem ersten `tick` kommt (CHAOS-142). */
  readonly deferSceneReady?: boolean;
}

export interface FrameTiming {
  readonly key: string;
  readonly ms: number;
  readonly tickMs: number;
  readonly virtualMs: number;
}

export interface BotMatchResult {
  readonly ok: boolean;
  readonly virtualMs: number;
  readonly finalReached: boolean;
  /** Ganze Partien bis zum Endstand (mit `matches` > 1 auch nach Revanche). */
  readonly matchesPlayed: number;
  readonly roundsPlayed: number;
  /** Runden, in denen `board.notice` zu sehen war (CHAOS-157). */
  readonly noticeRounds: readonly number[];
  readonly minigamesBuilt: readonly string[];
  readonly resultsAccepted: number;
  /** Ausnahmen, die aus dem Bündel bis zum Aufrufer durchschlugen. */
  readonly exceptions: readonly string[];
  /** Log-Zeilen des Kerns, die auf einen Fehler deuten (wie der Swift-Harness). */
  readonly problems: readonly string[];
  readonly serverErrors: readonly string[];
  readonly contractErrors: readonly string[];
  readonly phases: readonly string[];
  readonly maxRenderStateBytes: number;
  readonly rotation: readonly string[];
}

/**
 * „Sabotage wird stärker!“ in einer ganzen Partie (10 Runden, `sabotageGrowthRounds: 5`): nur in
 * Runde 6 (CHAOS-157).
 */
export const FULL_MATCH_NOTICE_ROUNDS = '6';

/** Log-Zeilen, die eine Partie zwar überlebt, die aber nie vorkommen dürfen. */
export const PROBLEM_MARKERS = [
  'Fehler',
  'ERROR',
  'fehlgeschlagen',
  'Laufzeit wertet',
  'nicht mehr gebraucht',
  'abgelehnt',
  'noch nicht geladen',
];

export async function runBotMatch(options: BotMatchOptions): Promise<BotMatchResult> {
  const { api, internals } = loadBundle(options.code);
  const outbox: [number, string][] = [];
  const logLines: string[] = [];
  const exceptions: string[] = [];
  const serverErrors: string[] = [];
  const contractErrors: string[] = [];
  const phases: string[] = [];
  const log = options.log ?? (() => undefined);
  const env: HostEnv = {
    send: (id, text) => {
      outbox.push([id, text]);
    },
    close: (id, code, reason) => {
      exceptions.push(`Host schließt Verbindung ${String(id)}: ${String(code)} ${reason}`);
    },
    log: (line) => {
      logLines.push(line);
      log(`  js: ${line}`);
    },
    randomBytes: seededBytes(options.seed ?? 1),
    havokWasm: options.wasm,
    joinUrl: `http://192.168.0.2:8787/?code=${JOIN_CODE}`,
    joinCode: JOIN_CODE,
    ...(options.deferSceneReady === true ? { deferSceneReady: true } : {}),
  };

  const guard = <T>(label: string, run: () => T): T | undefined => {
    try {
      return run();
    } catch (error) {
      exceptions.push(
        `${label}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
      );
      return undefined;
    }
  };

  const host = guard('create', () => api.create(env));
  await settle();
  if (!host) return summary();
  const instance: ChaosHostInstance = host;
  if (options.deferSceneReady === true) {
    guard('tick', () => {
      instance.tick(CLOCK_OFFSET_MS);
    });
    await settle();
    if (logLines.some((line) => line.includes('host-ready'))) {
      exceptions.push('host-ready vor sceneReady()');
    }
    guard('sceneReady', () => {
      instance.sceneReady();
    });
    await settle();
  }

  const controllers: Controller[] = [
    { id: 1, name: 'Anna', character: 'raccoon' },
    { id: 2, name: 'Ben', character: 'sock' },
  ].map((c) => ({
    ...c,
    seq: 0,
    slot: null,
    actions: [],
    answered: new Set<number>(),
    lastHeartbeat: 0,
    lastInput: 0,
    pressed: false,
    picked: false,
  }));

  let now = 0;
  const send = (c: Controller, type: string, fields: Record<string, unknown>) => {
    const text = JSON.stringify({ v: PROTOCOL_VERSION, type, ...fields });
    guard(`message ${type}`, () => {
      instance.message(c.id, text);
    });
  };
  const nextSeq = (c: Controller) => ++c.seq;

  const handle = (c: Controller, text: string) => {
    const m = JSON.parse(text) as Record<string, unknown>;
    switch (m.type) {
      case 'welcome': {
        const players = m.players as { slot: number }[];
        c.slot = players[0]?.slot ?? null;
        break;
      }
      case 'context': {
        c.actions = (m.actions as string[] | undefined) ?? [];
        const slot = c.slot;
        if (slot === null) return;
        if (c.actions.includes('pick-character') && !c.picked) {
          c.picked = true;
          send(c, 'pick-character', { slot, seq: nextSeq(c), character: c.character });
        } else if (c.actions.includes('ready') && c.picked) {
          send(c, 'ready', { slot, seq: nextSeq(c) });
        }
        const prompt = m.prompt as { id: number; options: { id: string }[] } | undefined;
        const option = prompt?.options[0]?.id;
        if (c.actions.includes('choose') && prompt && option && !c.answered.has(prompt.id)) {
          c.answered.add(prompt.id);
          send(c, 'choose', { slot, seq: nextSeq(c), promptId: prompt.id, option });
        }
        break;
      }
      case 'error':
        serverErrors.push(`${c.name}: ${String(m.code)} ${String(m.message)}`);
        break;
      default:
        break;
    }
  };

  const drain = () => {
    while (outbox.length > 0) {
      const batch = outbox.splice(0);
      for (const [id, text] of batch) {
        const c = controllers.find((entry) => entry.id === id);
        if (!c) exceptions.push(`send an unbekannte Verbindung ${String(id)}`);
        else handle(c, text);
      }
    }
  };

  /** Eingaben im Minispiel: Stick im Kreis (10/s), A abwechselnd drücken/loslassen. */
  const play = (c: Controller) => {
    const slot = c.slot;
    if (slot === null) return;
    if (now - c.lastHeartbeat >= 5000) {
      c.lastHeartbeat = now;
      send(c, 'heartbeat', { t: now });
    }
    if (now - c.lastInput < 100) return;
    c.lastInput = now;
    if (c.actions.includes('move')) {
      const angle = now / 700 + slot;
      send(c, 'move', { slot, seq: nextSeq(c), x: Math.cos(angle), y: Math.sin(angle) });
    }
    if (c.actions.includes('button-a') && Math.floor(now / 100) % 4 === slot) {
      c.pressed = !c.pressed;
      send(c, c.pressed ? 'press' : 'release', { slot, seq: nextSeq(c), button: 'a' });
    }
  };

  for (const c of controllers) {
    guard('open', () => {
      instance.open(c.id);
    });
    send(c, 'join', { joinCode: JOIN_CODE, seats: 1, names: [c.name] });
  }
  await settle();
  drain();

  const matches = options.full ? Math.max(1, options.matches ?? 1) : 1;
  const limitMs = options.limitMs ?? (options.full ? 40 * 60_000 * matches : 5 * 60_000);
  const validateEvery = options.validateEvery ?? 1;
  let lastKey = '';
  let started = false;
  let frame = 0;
  let maxRenderStateBytes = 0;
  let finalReached = false;
  let matchesPlayed = 0;
  let roundsPlayed = 0;
  const noticeRounds: number[] = [];
  let firstResults = false;

  while (now < limitMs) {
    now += STEP_MS;
    frame++;
    const tickStart = performance.now();
    guard('tick', () => {
      instance.tick(now + CLOCK_OFFSET_MS);
    });
    // Mit den Mikrotasks danach (JavaScriptCore leert sie im selben Aufruf aus Swift).
    await settle();
    const tickMs = performance.now() - tickStart;
    drain();
    for (const c of controllers) play(c);
    await settle();
    drain();
    const renderStart = performance.now();
    const text = guard('renderState', () => instance.renderState());
    const frameMs = tickMs + performance.now() - renderStart;
    options.onFrame?.({ key: lastKey, ms: frameMs, tickMs, virtualMs: now });
    if (text === undefined) break;
    maxRenderStateBytes = Math.max(maxRenderStateBytes, text.length);
    const raw = JSON.parse(text) as RenderState;
    const key = raw.phase === 'minigame' ? `minigame-${raw.minigame?.stage ?? '?'}` : raw.phase;
    const changed = key !== lastKey;
    if (changed || frame % validateEvery === 0) {
      const parsed = RenderStateSchema.safeParse(raw);
      if (!parsed.success && contractErrors.length < 10) {
        contractErrors.push(`${key}: ${parsed.error.message}`);
      }
    }
    if (changed) {
      phases.push(key);
      log(`[${String(Math.round(now))} ms] Phase ${lastKey || '-'} → ${key}`);
      options.onPhase?.(key, raw);
      lastKey = key;
    }
    roundsPlayed = Math.max(roundsPlayed, raw.board?.round ?? 0);
    if (raw.board?.notice && !noticeRounds.includes(raw.board.round)) {
      noticeRounds.push(raw.board.round);
    }
    if (!started && raw.lobby.players.length === 2 && raw.lobby.players.every((p) => p.ready)) {
      started = true;
      guard('hostCommand', () => {
        instance.hostCommand('start');
      });
      await settle();
      drain();
    }
    if (key === 'minigame-results' && logLines.some((line) => line.includes('angenommen'))) {
      firstResults = true;
    }
    if (!options.full && firstResults) break;
    if (options.full && changed && raw.phase === 'final') {
      matchesPlayed++;
      await options.onMatchEnd?.(matchesPlayed, internals.pendingTimers());
      if (matchesPlayed >= matches) {
        finalReached = true;
        break;
      }
      // Revanche: zurück in die Lobby, die Bots melden sich wieder bereit, `start` wie oben.
      // Prompt-IDs zählen in der neuen Partie von vorn.
      started = false;
      for (const c of controllers) c.answered.clear();
      guard('hostCommand', () => {
        instance.hostCommand('rematch');
      });
      await settle();
      drain();
    }
  }

  return summary();

  function summary(): BotMatchResult {
    const problems = logLines.filter((line) => PROBLEM_MARKERS.some((m) => line.includes(m)));
    const minigamesBuilt = logLines
      .map((line) => /^Minispiel (\S+) \(Runde/.exec(line)?.[1])
      .filter((id): id is string => id !== undefined);
    const resultsAccepted = logLines.filter((line) => line.includes('angenommen')).length;
    const rotation = [...internals.rotation];
    const allRotation = rotation.every((id) => minigamesBuilt.includes(id));
    const ok =
      exceptions.length === 0 &&
      problems.length === 0 &&
      serverErrors.length === 0 &&
      contractErrors.length === 0 &&
      resultsAccepted >= 1 &&
      resultsAccepted === minigamesBuilt.length &&
      (!options.full ||
        (finalReached && allRotation && noticeRounds.join() === FULL_MATCH_NOTICE_ROUNDS)) &&
      (options.full || firstResults);
    return {
      ok,
      virtualMs: Math.round(now),
      finalReached,
      matchesPlayed,
      roundsPlayed,
      noticeRounds,
      minigamesBuilt,
      resultsAccepted,
      exceptions,
      problems,
      serverErrors,
      contractErrors,
      phases,
      maxRenderStateBytes,
      rotation,
    };
  }
}
