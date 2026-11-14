import { useEffect, useRef, useState } from 'react';
import type { HostConfig } from './config.ts';
import { Hud, type PhysicsStatus } from './Hud.tsx';
import { createKeyboardInputSource } from './input/keyboardInputSource.ts';
import { createLocalPlayers } from './players.ts';
import { createGameScene } from './scene/createGameScene.ts';
import type { GameScene } from './scene/types.ts';
import './testHook.ts';

interface AppProps {
  readonly config: HostConfig;
}

/**
 * Host-Oberfläche: Babylon-Canvas unten, React-HUD darüber.
 * Zustand fließt nur in eine Richtung: React → Szene (`setPlayers`), Szene → React nur `ready`.
 */
export function App({ config }: AppProps) {
  const { seed, test } = config;
  // Bis CHAOS-9/11 Spieler per Netzwerk beitreten, sind es lokale Demo-Spieler.
  const [players] = useState(() => createLocalPlayers(config.players));
  const [physics, setPhysics] = useState<PhysicsStatus>('loading');
  const [sceneReady, setSceneReady] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GameScene | null>(null);
  const playersRef = useRef(players);

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
    const stopInput = createKeyboardInputSource(window).start(scene);

    let active = true;
    const hook = test
      ? {
          ready: false,
          physicsReady: false,
          stepFrames: (n: number) => {
            scene.stepFrames(n);
          },
          getPlayerPositions: () => scene.getPlayerPositions(),
        }
      : undefined;
    if (hook) window.__chaos = hook;

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
      stopInput();
      scene.dispose();
      canvas.remove();
      sceneRef.current = null;
      if (hook && window.__chaos === hook) delete window.__chaos;
    };
  }, [seed, test]);

  useEffect(() => {
    playersRef.current = players;
    sceneRef.current?.setPlayers(players);
  }, [players]);

  return (
    <main className="host" data-physics={physics} data-scene={sceneReady ? 'ready' : 'loading'}>
      <div className="stage" ref={stageRef} />
      <Hud players={players} physics={physics} showKeyHints />
    </main>
  );
}
