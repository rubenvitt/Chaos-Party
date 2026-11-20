/**
 * Brettphase am PC (CHAOS-18/19/20): Babylon-Canvas der Brett-Szene plus React-HUD.
 * Gleiches Muster wie die Arena (ADR-004): Canvas imperativ im Effekt anlegen, Szene liest
 * die Regie je Frame, React liest den HUD-Schnappschuss der Regie (`useSyncExternalStore`).
 */
import { DEFAULT_BOARD, getBoard } from '@chaos-party/game-core';
import { parseServerToHostMessage } from '@chaos-party/protocol';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';
import type { FinaleSpeed, GpuBackend } from '../config.ts';
import { attachPerf } from '../debug/perf.ts';
import { markFirstFrame, markScene } from '../debug/sceneMarks.ts';
import { Finale } from '../finale/Finale.tsx';
import { soundEngine } from '../fx/audio.ts';
import { createHostEngine } from '../scene/engineFactory.ts';
import { boardEventSound } from '../fx/boardSounds.ts';
import type { ConnectionStatus } from '../net/hostConnection.ts';
import type { ChaosBoardTestHook, ChaosTestHook } from '../testHook.ts';
import { BoardHud } from './BoardHud.tsx';
import { createBoardScene } from './createBoardScene.ts';
import { createDemoMessages } from './demo.ts';
import { EdgeMarkers } from './EdgeMarkers.tsx';
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
  /** Grafik-Schnittstelle (`?gpu=`, CHAOS-75); Standard WebGL2. */
  readonly gpu?: GpuBackend;
  /**
   * Minispiel läuft (CHAOS-152): Brett bleibt eingehängt, aber unsichtbar und angehalten
   * (kein Rendern, keine Regie). Beim Zeigen holt die Regie auf, ohne Neuaufbau.
   */
  readonly hidden?: boolean;
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
  gpu = 'webgl',
  hidden = false,
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
  /** Szene für die Randmarker (CHAOS-210); `null` bis zum Aufbau. */
  const [markerScene, setMarkerScene] = useState<BoardScene | null>(null);
  /** Messung des Bretts an- bzw. abmelden (beim Zeigen auch die Marke `erstes-bild`). */
  const perfRef = useRef<((on: boolean) => void) | null>(null);
  useEffect(() => {
    finaleRef.current = finaleShown;
    // Hinter dem Finale (fast deckend, Podest ganz deckend) rendert das Brett nicht weiter:
    // eine Render-Schleife statt zwei, die GPU gehört dem Podest (CHAOS-39).
    sceneRef.current?.setRenderPaused(finaleShown);
  }, [finaleShown]);

  const hiddenRef = useRef(hidden);
  useEffect(() => {
    if (hiddenRef.current === hidden) return;
    hiddenRef.current = hidden;
    const scene = sceneRef.current;
    if (!scene) return;
    if (!hidden) {
      // Was während des Minispiels aufgelaufen ist, nicht nachträglich animieren (wie früher
      // beim Neuaufbau). Standbild-Kennzahl (CHAOS-153): Zeigen bis zum ersten Bild.
      director.settle();
      markScene('brett', 'aufbau');
    }
    // Messung (nur Debug): Ausgeblendet zählt das Brett weder Zeit noch Heap (Minispiel misst).
    perfRef.current?.(!hidden);
    scene.setHidden(hidden);
  }, [hidden, director]);

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
    // Standbild-Kennzahl je Szenenwechsel (nur Debug, CHAOS-153): ab hier bis zum ersten Bild.
    // Steht das Finale schon beim Aufbau (z. B. Neuladen während der Zählung), zeichnet das Brett
    // dahinter nie ein Bild; der Aufbau fällt dann ins Fenster „zählung → podest“.
    // Ausgeblendet (Neuladen während eines Minispiels): Das Fenster öffnet erst das Zeigen.
    const marked = !finaleRef.current && !hiddenRef.current;
    if (marked) markScene('brett', 'aufbau');
    const canvas = document.createElement('canvas');
    canvas.className = 'game-canvas';
    canvas.setAttribute('aria-label', 'Spielbrett');
    stage.appendChild(canvas);

    /** Baut die Szene auf der fertigen Engine auf; liefert das Aufräumen. */
    const mount = (engine?: AbstractEngine): (() => void) => {
      // Was vor dem Aufbau aufgelaufen ist, nicht nachträglich animieren.
      director.settle();
      const scene = createBoardScene(canvas, {
        board,
        source: director,
        testMode: test,
        ...(engine ? { engine } : {}),
      });
      sceneRef.current = scene;
      setMarkerScene(scene);
      scene.setRenderPaused(finaleRef.current);
      scene.setHidden(hiddenRef.current);
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
            getLightMood: () => scene.getLightMood(),
            getEdgeMarkers: () => scene.getEdgeMarkers().map((m) => ({ ...m })),
            getCamera: () => {
              const camera = scene.getCamera();
              return camera
                ? {
                    kind: camera.shot.kind,
                    focus: camera.focus,
                    distance: camera.distance,
                    shotFocus: camera.shot.focus,
                    shotDistance: camera.shot.distance,
                  }
                : null;
            },
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

      // Messung (nur Debug, CHAOS-39): hinter dem Finale heißt das Brett „finale“. Während eines
      // Minispiels abgemeldet (CHAOS-152); `markFirstFrame` nach `attachPerf` anmelden.
      let stopPerf: (() => void) | null = null;
      let stopFirstFrame: () => void = () => undefined;
      const setPerf = (on: boolean, firstFrame: boolean): void => {
        stopFirstFrame();
        stopFirstFrame = () => undefined;
        stopPerf?.();
        stopPerf = null;
        if (!on) return;
        stopPerf = attachPerf(() => (finaleRef.current ? 'finale' : 'brett'), scene);
        if (firstFrame) stopFirstFrame = markFirstFrame('brett', scene);
      };
      setPerf(!hiddenRef.current, marked);
      perfRef.current = (on) => {
        setPerf(on, on);
      };

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
        setPerf(false, false);
        perfRef.current = null;
        scene.dispose();
        if (sceneRef.current === scene) sceneRef.current = null;
        setMarkerScene((current) => (current === scene ? null : current));
        onSceneRef.current(null);
        onReadyRef.current(false);
        if (hook && window.__chaos === hook) delete window.__chaos;
      };
    };

    // WebGL2 (Standard, Testmodus): synchron wie bisher. WebGPU startet asynchron (CHAOS-75).
    let unmount: (() => void) | null = null;
    let cancelled = false;
    if (gpu === 'webgpu' && !test) {
      void createHostEngine(canvas, { testMode: test, backend: gpu }).then((created) => {
        if (created.fallbackReason) {
          console.warn(`WebGPU nicht verfügbar, Brett läuft mit WebGL2: ${created.fallbackReason}`);
        }
        if (cancelled) {
          created.engine.dispose();
          return;
        }
        unmount = mount(created.engine);
      });
    } else {
      unmount = mount();
    }

    return () => {
      cancelled = true;
      unmount?.();
      canvas.remove();
    };
  }, [board, director, test, local, gpu]);

  return (
    // Ausgeblendet per `visibility` statt `display: none`: Die Leinwand behält ihre Größe.
    <div
      className="board-layer"
      data-hidden={hidden || undefined}
      inert={hidden}
      aria-hidden={hidden || undefined}
    >
      <div className="stage" ref={stageRef} />
      {/* Ausgeblendet ohne HUD: keine doppelten Test-IDs und Live-Regionen neben dem Minispiel. */}
      {!hidden && <BoardHud hud={hud} boardName={board.name} connection={connection} />}
      {/* Über dem HUD: Am oberen Rand läge ein Marker sonst unter dem Ereignis-Ticker. */}
      {!hidden && <EdgeMarkers scene={markerScene} />}
      {hud.view?.gamePhase === 'game-results' && hud.view.ranking && (
        <Finale
          view={hud.view}
          ranking={hud.view.ranking}
          speed={finaleSpeed}
          test={test}
          // Ohne Verbindung ginge der Klick ins Leere: Knopf sperren, bis sie wieder steht.
          onRematch={connection === null || connection === 'connected' ? onRematch : null}
        />
      )}
    </div>
  );
}
