/**
 * Brettphase am PC (CHAOS-18/19/20): Babylon-Canvas der Brett-Szene plus React-HUD.
 * Gleiches Muster wie die Arena (ADR-004): Canvas imperativ im Effekt anlegen, Szene liest
 * die Regie je Frame, React liest den HUD-Schnappschuss der Regie (`useSyncExternalStore`).
 */
import { DEFAULT_BOARD, getBoard } from '@chaos-party/game-core';
import { parseServerToHostMessage } from '@chaos-party/protocol';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { FinaleSpeed } from '../config.ts';
import { attachPerf } from '../debug/perf.ts';
import { Finale } from '../finale/Finale.tsx';
import { soundEngine } from '../fx/audio.ts';
import { boardEventSound } from '../fx/boardSounds.ts';
import type { ConnectionStatus } from '../net/hostConnection.ts';
import type { ChaosBoardTestHook, ChaosTestHook } from '../testHook.ts';
import { BoardHud } from './BoardHud.tsx';
import { createBoardScene } from './createBoardScene.ts';
import { createDemoMessages } from './demo.ts';
import type { BoardDirector } from './director.ts';
import type { BoardScene } from './types.ts';

interface BoardStageProps {
  readonly director: BoardDirector;
  readonly connection: ConnectionStatus | null;
  readonly test: boolean;
  /** Lokaler Brett-Modus: Der Testhaken darf Nachrichten einspeisen. */
  readonly local: boolean;
  readonly onReady: (ready: boolean) => void;
  readonly onScene: (scene: BoardScene | null) => void;
  /** Tempo der Trophäenzählung (CHAOS-37). */
  readonly finaleSpeed: FinaleSpeed;
  /** „Nochmal spielen“ im Siegerbildschirm; `null` = Knopf aus. */
  readonly onRematch: (() => void) | null;
}

export function BoardStage({
  director,
  connection,
  test,
  local,
  onReady,
  onScene,
  finaleSpeed,
  onRematch,
}: BoardStageProps) {
  const subscribe = useCallback((listener: () => void) => director.subscribe(listener), [director]);
  const getHud = useCallback(() => director.getHud(), [director]);
  const hud = useSyncExternalStore(subscribe, getHud);
  const boardId = hud.view?.boardId ?? DEFAULT_BOARD.id;
  const board = getBoard(boardId) ?? DEFAULT_BOARD;
  const stageRef = useRef<HTMLDivElement>(null);
  const onReadyRef = useRef(onReady);
  const onSceneRef = useRef(onScene);

  useEffect(() => {
    onReadyRef.current = onReady;
    onSceneRef.current = onScene;
  }, [onReady, onScene]);

  // Finale (Trophäenzählung bzw. Siegerbildschirm) liegt über dem Brett.
  const finaleShown = hud.view?.gamePhase === 'game-results' && Boolean(hud.view.ranking);
  const finaleRef = useRef(finaleShown);
  const sceneRef = useRef<BoardScene | null>(null);
  useEffect(() => {
    finaleRef.current = finaleShown;
    // Hinter dem Finale (fast deckend, Podest ganz deckend) rendert das Brett nicht weiter:
    // eine Render-Schleife statt zwei, die GPU gehört dem Podest (CHAOS-39).
    sceneRef.current?.setRenderPaused(finaleShown);
  }, [finaleShown]);

  // Klänge zu den Ereignissen, sobald die Regie sie abspielt (CHAOS-33).
  useEffect(
    () =>
      director.onEvent((event) => {
        const cue = boardEventSound(event);
        if (cue) soundEngine().play(cue.name, cue.options);
      }),
    [director],
  );

  useEffect(() => {
    if (board.id !== boardId) console.warn(`Unbekanntes Brett „${boardId}“ – zeige ${board.id}`);
  }, [board.id, boardId]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-label', 'Spielbrett');
    stage.appendChild(canvas);

    // Was vor dem Aufbau aufgelaufen ist, nicht nachträglich animieren.
    director.settle();
    const scene = createBoardScene(canvas, { board, source: director, testMode: test });
    sceneRef.current = scene;
    scene.setRenderPaused(finaleRef.current);
    onSceneRef.current(scene);

    let active = true;
    const boardHook: ChaosBoardTestHook | undefined = test
      ? {
          ready: false,
          get animating() {
            return director.animating;
          },
          get eventsProcessed() {
            return director.stats.eventsProcessed;
          },
          get nextEventSeq() {
            return director.stats.nextEventSeq;
          },
          get messagesReceived() {
            return director.stats.received;
          },
          get jumps() {
            return director.stats.jumps;
          },
          advance: (ms: number) => {
            director.advance(ms);
          },
          getPawnSpaces: () => director.getPawnSpaces(),
          getPawnCharacters: () => scene.getPawnCharacters(),
          getHud: () => {
            const view = director.getHud().view;
            return {
              gamePhase: view?.gamePhase ?? null,
              activeSlot: view?.activeSlot ?? null,
              messages: director.getHud().messages.map((m) => m.text),
            };
          },
          ...(local
            ? {
                receive: (message: unknown) => {
                  const parsed = parseServerToHostMessage(JSON.stringify(message));
                  if (!parsed.ok || parsed.message.type !== 'board') return false;
                  director.receive(parsed.message);
                  return true;
                },
                demoMessages: createDemoMessages(),
              }
            : {}),
        }
      : undefined;
    const hook: ChaosTestHook | undefined = boardHook
      ? {
          ready: false,
          physicsReady: false,
          scene: 'board',
          stepFrames: (n: number) => {
            scene.stepFrames(n);
          },
          getPlayerPositions: () => scene.getPawnPositions(),
          networkInputs: 0,
          lastMoves: {},
          board: boardHook,
        }
      : undefined;
    if (hook) window.__chaos = hook;

    // Messung (nur Debug, CHAOS-39): hinter dem Finale heißt das Brett „finale“.
    const stopPerf = attachPerf(() => (finaleRef.current ? 'finale' : 'brett'), scene);

    scene.ready.then(
      () => {
        if (!active) return;
        if (hook) hook.ready = true;
        if (boardHook) boardHook.ready = true;
        onReadyRef.current(true);
      },
      (error: unknown) => {
        if (!active) return;
        console.error('Brett-Szene konnte nicht aufgebaut werden', error);
      },
    );

    return () => {
      active = false;
      stopPerf();
      scene.dispose();
      if (sceneRef.current === scene) sceneRef.current = null;
      canvas.remove();
      onSceneRef.current(null);
      onReadyRef.current(false);
      if (hook && window.__chaos === hook) delete window.__chaos;
    };
  }, [board, director, test, local]);

  return (
    <>
      <div className="stage" ref={stageRef} />
      <BoardHud hud={hud} boardName={board.name} connection={connection} />
      {hud.view?.gamePhase === 'game-results' && hud.view.ranking && (
        <Finale
          view={hud.view}
          ranking={hud.view.ranking}
          speed={finaleSpeed}
          test={test}
          onRematch={onRematch}
        />
      )}
    </>
  );
}
