/**
 * JS-Kern des Apple-Hosts (ADR-019 §2, CHAOS-138/139): Session-Server, game-core und Host-Rolle
 * samt headless Minispielen in einem Bündel für JavaScriptCore. Vertrag: `./contract.ts`.
 *
 * - Controller-Verbindungen kommen von Swift (`open/message/closed`) und gehen unverändert an
 *   die `Session` aus `apps/server` (gleiche Prüfungen, Fristen, Rate-Limits).
 * - Die Host-Rolle ist `connectHost` aus `apps/host` an einem Socket im Prozess: `host-hello`,
 *   Herzschlag, `host-ready`, Start und Befehle wie am PC. Minispiele laufen headless
 *   (`./stage.ts`), Ergebnisse gehen über den `ResultSender` des Browser-Hosts zurück.
 */
// Muss das erste Modul bleiben: setzt `setTimeout`, `performance` usw., bevor Babylon lädt.
import { clock } from './install.ts';
import HavokPhysics from '@babylonjs/havok';
import { DEFAULT_BOARD, getBoard } from '@chaos-party/game-core';
import { getMinigameModule } from '@chaos-party/minigames';
import { ROTATION } from '@chaos-party/minigames/catalog';
import type { HavokInstance } from '@chaos-party/minigame-sdk/babylon';
import {
  encode,
  type BoardMessage,
  type BoardView,
  type LobbyMessage,
} from '@chaos-party/protocol';
import {
  DEFAULT_TICK_MS,
  Session,
  type ConnectionId,
  type Outgoing,
} from '../../server/src/session.ts';
import { spreadPawns } from '../../host/src/board/layout.ts';
import { eventText, playerName } from '../../host/src/board/texts.ts';
import {
  connectHost,
  type HostCommand,
  type HostConnection,
  type SocketLike,
} from '../../host/src/net/hostConnection.ts';
import { createResultSender } from '../../host/src/net/resultSender.ts';
import {
  intentToMinigameInput,
  minigameStageOf,
  planPlay,
  playersFromView,
  stageKeyOf,
} from '../../host/src/minigame/plan.ts';
import { resultPayload } from '../../host/src/minigame/results.ts';
import type {
  BoardState,
  ChaosHostApi,
  ChaosHostInstance,
  ChaosHostInternals,
  ContractPhase,
  HostCommandName,
  HostEnv,
  MinigameState,
  RenderState,
} from './contract.ts';
import { base64url, randomBytes, randomInt, setRandomSource } from './nodeCrypto.ts';
import { createNoticeTracker } from './notice.ts';
import { createHeadlessStage, describe, type HeadlessStage } from './stage.ts';

const now = clock.now;

/** So viele Ticker-Meldungen hält `renderState().board.messages`. */
const MAX_MESSAGES = 6;
const OPEN = 1;
const CLOSED = 3;

type HostSocket = SocketLike & { readyState: number };

function loadHavok(wasm: Uint8Array | number[], log: (line: string) => void) {
  const bytes = Uint8Array.from(wasm);
  // Nur synchron: der asynchrone Weg (`WebAssembly.instantiate`) löst in JSC nie auf (Probe).
  const options = {
    print: log,
    printErr: log,
    instantiateWasm(
      imports: WebAssembly.Imports,
      done: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ) {
      const module = new WebAssembly.Module(bytes);
      const instance = new WebAssembly.Instance(module, imports);
      done(instance, module);
      return instance.exports;
    },
  };
  return (HavokPhysics as unknown as (o: typeof options) => Promise<HavokInstance>)(options);
}

function create(env: HostEnv): ChaosHostInstance {
  const log = (line: string) => {
    env.log(line);
  };
  const toLine = (args: unknown[]) =>
    args.map((a) => (typeof a === 'string' ? a : describe(a))).join(' ');
  // Babylon, Runner und Session loggen über `console`; in JSC landet das sonst nirgends.
  // Ganzes Objekt ersetzen: Ein nacktes Kontext (Tests mit `node:vm`) hat gar kein `console`.
  const write =
    (prefix: string) =>
    (...args: unknown[]) => {
      log(`${prefix}${toLine(args)}`);
    };
  (globalThis as { console: unknown }).console = {
    log: write(''),
    info: write(''),
    debug: write(''),
    warn: write('WARN '),
    error: write('ERROR '),
  };
  setRandomSource((n) => env.randomBytes(n));

  let havok: HavokInstance | null = null;
  loadHavok(env.havokWasm, log).then(
    (instance) => {
      havok = instance;
      log('Havok geladen');
    },
    (error: unknown) => {
      log(`Havok-Fehler: ${describe(error)}`);
    },
  );

  // `joinUrl` bewusst nicht an die Session: zods URL-Prüfung braucht `URL`, das JSC fehlt. Der
  // QR-Code kommt ohnehin von Swift (`renderState().lobby.joinUrl`).
  const session = new Session({
    joinCode: env.joinCode,
    now,
    createToken: () => randomBytes(24).toString('base64url'),
    randomSeed: () => randomInt(0, 2 ** 31),
    logError: (error) => {
      log(`Session-Fehler: ${describe(error)}`);
    },
  });

  // --- Verbindungen ---------------------------------------------------------------------------
  /** Host-Sockets im Prozess; negative IDs kollidieren nie mit denen von Swift. */
  const hostSockets = new Map<ConnectionId, HostSocket>();
  let nextHostId = -1;
  /** Zustellungen an Host bzw. Session; nacheinander abgearbeitet, nie verschachtelt. */
  const inbox: (() => void)[] = [];
  let flushing = false;

  const flush = () => {
    if (flushing) return;
    flushing = true;
    try {
      for (let job = inbox.shift(); job; job = inbox.shift()) {
        try {
          job();
        } catch (error) {
          log(`Fehler: ${describe(error)}`);
        }
      }
    } finally {
      flushing = false;
    }
  };

  const apply = (actions: Outgoing[]) => {
    for (const action of actions) {
      const host = hostSockets.get(action.to);
      if (host) {
        if (action.kind === 'send') {
          const data = encode(action.message);
          inbox.push(() => host.onmessage?.({ data }));
        } else {
          hostSockets.delete(action.to);
          host.readyState = CLOSED;
          inbox.push(() => host.onclose?.({ code: action.code }));
        }
        continue;
      }
      if (action.kind === 'send') env.send(action.to, encode(action.message));
      else env.close(action.to, action.code, action.reason);
    }
  };

  const createHostSocket = (): SocketLike => {
    const id = nextHostId--;
    const socket: HostSocket = {
      readyState: OPEN,
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      send(data) {
        inbox.push(() => {
          apply(session.message(id, data));
        });
      },
      close() {
        if (socket.readyState === CLOSED) return;
        socket.readyState = CLOSED;
        hostSockets.delete(id);
        inbox.push(() => {
          apply(session.disconnect(id));
        });
      },
    };
    hostSockets.set(id, socket);
    inbox.push(() => {
      apply(session.connect(id));
      socket.onopen?.({});
    });
    return socket;
  };

  // --- Host-Rolle -----------------------------------------------------------------------------
  let lobby: LobbyMessage | null = null;
  let view: BoardView | null = null;
  let receivedAt = 0;
  let nextEventSeq: number | null = null;
  const messages: string[] = [];
  /** Große Einblendung „Sabotage wird stärker!“ (CHAOS-157). */
  const notices = createNoticeTracker();
  let stage: { key: string; headless: HeadlessStage } | null = null;
  let lastAdvanceAt: number | null = null;
  let lastSessionTickAt = -Infinity;
  /** Erster `tick`-Wert: Die Uhr des Kerns zählt ab 0 (Session und Host starten bei 0). */
  let clockBase: number | null = null;
  const resultSender = createResultSender({ warn: log });

  const labelOf = (spaceId: string) =>
    (getBoard(view?.boardId ?? '') ?? DEFAULT_BOARD).spaces.find((s) => s.id === spaceId)?.label;

  const disposeStage = () => {
    if (!stage) return;
    try {
      stage.headless.dispose();
    } catch (error) {
      log(`Minispiel-Entsorgen: ${describe(error)}`);
    }
    stage = null;
    lastAdvanceAt = null;
  };

  /** Bühne an den neuesten Brett-Stand anpassen (wie `MinigameScreen` im Browser-Host). */
  const syncStage = () => {
    const key = stageKeyOf(view, (id) => getMinigameModule(id) !== undefined);
    if (stage?.key !== key) {
      disposeStage();
      const module = key && view?.minigame ? getMinigameModule(view.minigame.id) : undefined;
      if (key && view?.minigame && module) {
        if (module.info.physics && !havok) {
          log(`Minispiel ${module.info.id}: Havok noch nicht geladen`);
          return;
        }
        const round = view.minigame.round;
        const plan = planPlay(view, receivedAt, now());
        const headless = createHeadlessStage({
          module,
          players: playersFromView(view),
          seed: view.minigame.seed,
          timeLimitMs: plan.kind === 'play' ? plan.timeLimitMs : module.info.durationMs,
          havok,
          log,
          onResult: (result) => {
            log(
              `Minispiel ${result.result.minigameId} fertig nach ${result.elapsedMs} ms` +
                (result.forced ? ' (Laufzeit wertet)' : ''),
            );
            resultSender.submit(resultPayload(result.result, round));
          },
        });
        stage = { key, headless };
        log(`Minispiel ${module.info.id} (Runde ${round}, Seed ${view.minigame.seed}) aufgebaut`);
      }
    }
    if (!stage || !view) return;
    stage.headless.setPaused(view.paused);
    for (const player of view.players) {
      stage.headless.runner.setConnected(player.slot, player.connected);
    }
    if (minigameStageOf(view) === 'play' && planPlay(view, receivedAt, now()).kind === 'play') {
      stage.headless.start();
    }
  };

  const onBoard = (message: BoardMessage) => {
    view = message.view;
    receivedAt = now();
    const fresh =
      nextEventSeq === null
        ? message.events
        : message.events.slice(Math.max(0, nextEventSeq - message.eventSeq));
    nextEventSeq = Math.max(nextEventSeq ?? 0, message.eventSeq + message.events.length);
    for (const event of fresh) {
      const text = eventText(event, view, labelOf);
      if (text) messages.push(text.text);
      notices.push(event, receivedAt);
    }
    messages.splice(0, Math.max(0, messages.length - MAX_MESSAGES));
    resultSender.onView(view);
    syncStage();
  };

  const connection: HostConnection = connectHost(
    'inproc://host',
    {
      onStatus: (status) => {
        log(`Host-Verbindung: ${status}`);
        if (status !== 'connected') resultSender.onDisconnected();
      },
      onLobby: (message) => {
        lobby = message;
        if (message.phase === 'lobby') {
          view = null;
          nextEventSeq = null;
          messages.length = 0;
          notices.clear();
          disposeStage();
        }
      },
      onBoard,
      onInput: (intent) => {
        const mapped = intentToMinigameInput(intent);
        if (mapped && stage) stage.headless.runner.input(mapped.slot, mapped.input);
      },
      onServerError: (error) => {
        log(`Server-Fehler an Host: ${error.code} ${error.message}`);
        resultSender.onError(error);
      },
      onResultAck: (ack) => {
        log(
          `minigame-result-ack ${ack.minigameId} Runde ${ack.round}: ${ack.accepted ? 'angenommen' : `abgelehnt (${ack.code ?? '?'})`}`,
        );
        resultSender.onAck(ack);
      },
    },
    {
      createSocket: createHostSocket,
      setTimer: (callback, ms) => clock.setTimeout(callback, ms),
      clearTimer: (handle) => {
        clock.clearTimeout(handle as number);
      },
      now,
      wake: null,
      warn: log,
    },
  );
  resultSender.setTransport((result) => connection.sendMinigameResult(result));
  // `host-ready` erst, wenn die App Brett und Figuren geladen hat (CHAOS-142, CHAOS-68); ohne
  // `deferSceneReady` (Harness, Tests) ist der Host sofort bereit.
  if (env.deferSceneReady !== true) connection.setSceneReady(true);
  flush();

  // --- renderState ----------------------------------------------------------------------------
  const contractPhase = (): ContractPhase => {
    if (session.phase !== 'board' || !view) return 'lobby';
    if (view.paused) return 'paused';
    if (view.gamePhase === 'game-results') return 'final';
    return minigameStageOf(view) ? 'minigame' : 'board';
  };

  const boardState = (current: BoardView): BoardState => {
    const board = getBoard(current.boardId) ?? DEFAULT_BOARD;
    const spaces = new Map(board.spaces.map((space) => [space.id, space]));
    const offsets = spreadPawns(current.players);
    return {
      round: current.round,
      rounds: current.rounds,
      activeSlot: current.activeSlot,
      spaces: board.spaces.map((space) => ({
        id: space.id,
        x: space.position.x,
        z: space.position.z,
        kind: space.kind,
      })),
      pawns: current.players.map((player) => {
        const at = spaces.get(player.spaceId)?.position ?? { x: 0, z: 0 };
        const offset = offsets.get(player.slot) ?? { x: 0, z: 0 };
        return {
          slot: player.slot,
          spaceId: player.spaceId,
          x: at.x + offset.x,
          z: at.z + offset.z,
          character: player.character,
        };
      }),
      messages: [...messages],
      notice: notices.current(now()),
    };
  };

  const minigameState = (current: BoardView): MinigameState | null => {
    const minigame = current.minigame;
    const stageName = minigameStageOf(current);
    if (!minigame || !stageName) return null;
    const runner = stage?.headless.runner;
    let hud = '';
    if (runner && runner.state !== 'created' && runner.state !== 'preparing') {
      try {
        const data = runner.hud();
        const scores = data.scores
          .map(
            (entry) =>
              `${playerName(current, entry.slot)} ${entry.score}${entry.status ? ` (${entry.status})` : ''}`,
          )
          .join(' · ');
        hud = `${Math.ceil(data.remainingMs / 1000)} s · ${scores}${data.banner ? ` · ${data.banner}` : ''}`;
      } catch (error) {
        hud = `HUD-Fehler: ${describe(error)}`;
      }
    }
    return {
      id: minigame.id,
      stage: stageName,
      elapsedMs: runner?.elapsedMs ?? 0,
      bodies: stage?.headless.bodies() ?? [],
      hud,
    };
  };

  const COMMANDS: Record<Exclude<HostCommandName, 'start'>, HostCommand> = {
    pause: { type: 'pause' },
    resume: { type: 'resume' },
    'end-game': { type: 'end-game' },
    rematch: { type: 'rematch' },
  };

  return {
    open(connId) {
      apply(session.connect(connId));
      flush();
    },
    message(connId, text) {
      apply(session.message(connId, text));
      flush();
    },
    closed(connId) {
      apply(session.disconnect(connId));
      flush();
    },
    tick(nowMs) {
      // Beliebige monotone ms-Uhr (z. B. CACurrentMediaTime) wird auf „ab erstem tick“ verschoben;
      // ein Sprung von 0 auf Epoch-ms hielte sonst den Host für 30 s still und würfe ihn raus.
      clockBase ??= nowMs;
      clock.advance(nowMs - clockBase);
      if (now() - lastSessionTickAt >= DEFAULT_TICK_MS) {
        lastSessionTickAt = now();
        apply(session.tick());
      }
      flush();
      if (stage) {
        const seconds = lastAdvanceAt === null ? 0 : (now() - lastAdvanceAt) / 1000;
        lastAdvanceAt = now();
        try {
          stage.headless.advance(seconds);
        } catch (error) {
          log(`Minispiel-Schritt: ${describe(error)}`);
        }
      }
      flush();
    },
    renderState() {
      const players = (lobby?.players ?? []).map((player) => ({
        slot: player.slot,
        name: player.label,
        color: player.color,
        connected: player.connected,
        ready: player.ready,
        character: player.character,
      }));
      const state: RenderState = {
        phase: contractPhase(),
        lobby: { joinUrl: env.joinUrl, joinCode: env.joinCode, players },
        board: view ? boardState(view) : null,
        minigame: view ? minigameState(view) : null,
      };
      return JSON.stringify(state);
    },
    sceneReady() {
      log('Szene geladen: host-ready');
      connection.setSceneReady(true);
      flush();
    },
    hostCommand(cmd) {
      const command = Object.hasOwn(COMMANDS, cmd)
        ? COMMANDS[cmd as keyof typeof COMMANDS]
        : undefined;
      const sent =
        cmd === 'start' ? connection.sendStart() : command ? connection.sendCommand(command) : null;
      if (sent === null) log(`Unbekannter Host-Befehl: ${cmd}`);
      else if (!sent) log(`Host-Befehl ${cmd} nicht gesendet (nicht verbunden)`);
      flush();
    },
  };
}

const api: ChaosHostApi = { create };
const internals: ChaosHostInternals = { base64url, rotation: ROTATION };
Object.assign(globalThis, { ChaosHost: api, ChaosHostInternals: internals });
