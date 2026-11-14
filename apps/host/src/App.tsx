import { useEffect, useMemo, useRef, useState } from 'react';
import { serverWebSocketUrl, type HostConfig } from './config.ts';
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
 * - **Lokal** (`?local=1`): keine Verbindung, `?players=` Demo-Spieler per Tastatur.
 */
export function App({ config }: AppProps) {
  const { seed, test, local } = config;
  const session = useHostSession(local ? null : serverWebSocketUrl(window.location));
  const [localPlayers] = useState(() => createLocalPlayers(config.players));
  const lobbyPlayers = session.lobby?.players;
  const players = useMemo(
    () => (local ? localPlayers : lobbyPlayers ? playersFromLobby(lobbyPlayers) : NO_PLAYERS),
    [local, localPlayers, lobbyPlayers],
  );
  const phase = local ? 'play' : (session.lobby?.phase ?? 'lobby');

  const [physics, setPhysics] = useState<PhysicsStatus>('loading');
  const [sceneReady, setSceneReady] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const playersRef = useRef(players);
  const { hub } = session;

  useEffect(() => {
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
        }
      : undefined;
    if (hook) window.__chaos = hook;

    // Tastatur immer (lokal: Demo-Spieler; mit Server: beigetretene Slots), dazu Netzwerk.
    const stopKeyboard = createKeyboardInputSource(window).start(scene);
    const stopNetwork = local
      ? undefined
      : createWebSocketInputSource(hub, () => {
          if (hook) hook.networkInputs++;
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
      scene.dispose();
      canvas.remove();
      sceneRef.current = null;
      if (hook && window.__chaos === hook) delete window.__chaos;
    };
  }, [seed, test, local, hub]);

  useEffect(() => {
    playersRef.current = players;
    sceneRef.current?.setPlayers(players);
  }, [players]);

  return (
    <main
      className="host"
      data-physics={physics}
      data-scene={sceneReady ? 'ready' : 'loading'}
      data-mode={local ? 'local' : 'server'}
      data-phase={phase}
    >
      <div className="stage" ref={stageRef} />
      <Hud
        players={players}
        physics={physics}
        showKeyHints={local}
        showPlayers={local || phase === 'play'}
        connection={session.status}
      />
      <PlayerToasts players={players} enabled={!local} />
      {!local && phase === 'lobby' && session.status !== null && (
        <LobbyPanel
          lobby={session.lobby}
          players={players}
          status={session.status}
          joinHintSeconds={config.joinHintSeconds}
          onStart={session.start}
        />
      )}
    </main>
  );
}
