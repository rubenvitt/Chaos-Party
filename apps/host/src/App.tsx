import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoardStage } from './board/BoardStage.tsx';
import { createDemoMessages, DEMO_DELAYS_MS } from './board/demo.ts';
import type { BoardScene } from './board/types.ts';
import { serverWebSocketUrl, type HostConfig } from './config.ts';
import { DebugOverlay } from './debug/DebugOverlay.tsx';
import { createFrameMeter, type FrameMeter } from './debug/frameMeter.ts';
import { Hud, type PhysicsStatus } from './Hud.tsx';
import { createKeyboardInputSource } from './input/keyboardInputSource.ts';
import { createWebSocketInputSource } from './input/webSocketInputSource.ts';
import { LobbyPanel } from './lobby/LobbyPanel.tsx';
import { PlayerToasts } from './lobby/PlayerToasts.tsx';
import { useHostSession } from './net/useHostSession.ts';
import { createLocalPlayers, playersFromLobby, type HostPlayer } from './players.ts';
import { createGameScene } from './scene/createGameScene.ts';
import type { GameScene } from './scene/types.ts';
import type { ChaosTestHook } from './testHook.ts';
import './testHook.ts';

interface AppProps {
  readonly config: HostConfig;
}

const NO_PLAYERS: readonly HostPlayer[] = [];

/**
 * Host-Oberfläche: Babylon-Canvas unten, React-HUD und Lobby darüber.
 * Zustand fließt nur in eine Richtung: React → Szene (`setPlayers`, Eingaben),
 * Szene → React nur `ready` (C5).
 *
 * Zwei Betriebsarten (ADR-007):
 * - **Server** (Standard): Verbindung zu `/ws`, Spieler aus der Lobby, Eingaben von den
 *   Controllern; Tastatur steuert zusätzlich beigetretene Slots (Fehlersuche).
 * - **Lokal** (`?local=1`): keine Verbindung, `?players=` Demo-Spieler per Tastatur;
 *   mit `&board=1` stattdessen das Spielbrett mit Beispiel-Spielstand (`&demo=1` animiert).
 *
 * Szenen nach Phase: `lobby` und `play` zeigen die Arena (M1), `board` die Brett-Szene (M2).
 */
export function App({ config }: AppProps) {
  const { seed, test, local, debug } = config;
  const localBoard = local && config.board;
  // Nur mit `?debug=1` (CHAOS-45): Bildrate und Eingabe→Frame messen.
  const [meter] = useState<FrameMeter | null>(() => (debug ? createFrameMeter() : null));
  const session = useHostSession(local ? null : serverWebSocketUrl(window.location));
  const [localPlayers] = useState(() => createLocalPlayers(config.players));
  const lobbyPlayers = session.lobby?.players;
  const players = useMemo(
    () => (local ? localPlayers : lobbyPlayers ? playersFromLobby(lobbyPlayers) : NO_PLAYERS),
    [local, localPlayers, lobbyPlayers],
  );
  const phase = local ? (localBoard ? 'board' : 'play') : (session.lobby?.phase ?? 'lobby');
  const boardMode = phase === 'board';
  const { director } = session;

  const [physics, setPhysics] = useState<PhysicsStatus>('loading');
  const [sceneReady, setSceneReady] = useState(false);
  const [boardReady, setBoardReady] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const boardSceneRef = useRef<BoardScene | null>(null);
  const playersRef = useRef(players);
  const { hub } = session;

  useEffect(() => {
    // In der Brettphase läuft die Brett-Szene (BoardStage); die Arena wird entsorgt.
    if (boardMode) return;
    const stage = stageRef.current;
    if (!stage) return;
    // Canvas imperativ anlegen: jede Szene bekommt einen frischen WebGL-Kontext,
    // auch wenn React (StrictMode) den Effekt doppelt ausführt.
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-label', 'Spielszene');
    stage.appendChild(canvas);

    const scene = createGameScene(canvas, { seed, testMode: test });
    sceneRef.current = scene;
    scene.setPlayers(playersRef.current);

    let active = true;
    const hook: ChaosTestHook | undefined = test
      ? {
          ready: false,
          physicsReady: false,
          stepFrames: (n: number) => {
            scene.stepFrames(n);
          },
          getPlayerPositions: () => scene.getPlayerPositions(),
          networkInputs: 0,
          lastMoves: {},
          scene: 'arena',
        }
      : undefined;
    if (hook) window.__chaos = hook;

    // Messung (nur Debug): Frame-Ende aus der Szene, Eingang jeder Server-Eingabe aus dem
    // Verteiler – synchron im `message`-Ereignis der WebSocket-Verbindung.
    const stopFrameMeter = meter
      ? scene.onFrameRendered(() => {
          meter.frameEnded(performance.now());
        })
      : undefined;
    const stopInputMeter = meter
      ? hub.subscribe(() => {
          meter.inputReceived(performance.now());
        })
      : undefined;

    // Tastatur immer (lokal: Demo-Spieler; mit Server: beigetretene Slots), dazu Netzwerk.
    const stopKeyboard = createKeyboardInputSource(window).start(scene);
    const stopNetwork = local
      ? undefined
      : createWebSocketInputSource(hub, ({ slot, input }) => {
          if (!hook) return;
          hook.networkInputs++;
          if (input.type === 'move') hook.lastMoves[slot] = { x: input.x, y: input.y };
        }).start(scene);

    scene.physicsReady.then(
      () => {
        if (!active) return;
        if (hook) hook.physicsReady = true;
        setPhysics('ready');
      },
      (error: unknown) => {
        if (!active) return;
        console.error('Havok-Physik konnte nicht geladen werden', error);
        setPhysics('error');
      },
    );
    scene.ready.then(
      () => {
        if (!active) return;
        if (hook) hook.ready = true;
        setSceneReady(true);
      },
      (error: unknown) => {
        if (!active) return;
        console.error('Szene konnte nicht aufgebaut werden', error);
      },
    );

    return () => {
      active = false;
      stopKeyboard();
      stopNetwork?.();
      stopFrameMeter?.();
      stopInputMeter?.();
      scene.dispose();
      canvas.remove();
      sceneRef.current = null;
      if (hook && window.__chaos === hook) delete window.__chaos;
    };
  }, [seed, test, local, hub, meter, boardMode]);

  // Lokaler Brett-Modus: Beispiel-Spielstand, mit `demo` die Ereignisfolge in Schleife
  // (nicht im Testmodus – dort speisen Tests Nachrichten über den Testhaken ein).
  useEffect(() => {
    if (!localBoard) return;
    const messages = createDemoMessages();
    const first = messages[0];
    if (first) director.receive(first);
    if (!config.demo || test) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    // Jede Runde der Schleife beginnt mit einer Lücke in `eventSeq` → Sprung zurück zum Start.
    let offset = 0;
    const play = (index: number) => {
      const message = messages[index];
      if (!message) {
        offset += 1000;
        schedule(0, 2500);
        return;
      }
      director.receive({ ...message, eventSeq: message.eventSeq + offset });
      schedule(index + 1, DEMO_DELAYS_MS[index + 1] ?? 2000);
    };
    const schedule = (index: number, delay: number) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        play(index);
      }, delay);
      timers.add(timer);
    };
    schedule(1, DEMO_DELAYS_MS[1] ?? 1500);
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [localBoard, config.demo, test, director]);

  const getRenderer = useCallback(
    () => (boardMode ? boardSceneRef.current : sceneRef.current)?.getRendererInfo() ?? null,
    [boardMode],
  );
  const onBoardScene = useCallback((scene: BoardScene | null) => {
    boardSceneRef.current = scene;
  }, []);
  const { arena, rounds } = config;
  const { start } = session;
  const onStart = useCallback(
    () => start({ mode: arena ? 'arena' : 'board', ...(rounds === null ? {} : { rounds }) }),
    [start, arena, rounds],
  );

  useEffect(() => {
    playersRef.current = players;
    sceneRef.current?.setPlayers(players);
  }, [players]);

  return (
    <main
      className="host"
      data-physics={boardMode ? 'off' : physics}
      data-scene={(boardMode ? boardReady : sceneReady) ? 'ready' : 'loading'}
      data-mode={local ? 'local' : 'server'}
      data-phase={phase}
    >
      {boardMode ? (
        <BoardStage
          director={director}
          connection={session.status}
          test={test}
          local={local}
          meter={meter}
          onReady={setBoardReady}
          onScene={onBoardScene}
        />
      ) : (
        <>
          <div className="stage" ref={stageRef} />
          <Hud
            players={players}
            physics={physics}
            showKeyHints={local}
            showPlayers={local || phase === 'play'}
            connection={session.status}
          />
        </>
      )}
      <PlayerToasts players={players} enabled={!local} />
      {meter && <DebugOverlay meter={meter} getRenderer={getRenderer} testMode={test} />}
      {!local && phase === 'lobby' && session.status !== null && (
        <LobbyPanel
          lobby={session.lobby}
          players={players}
          status={session.status}
          joinHintSeconds={config.joinHintSeconds}
          onStart={onStart}
        />
      )}
    </main>
  );
}
