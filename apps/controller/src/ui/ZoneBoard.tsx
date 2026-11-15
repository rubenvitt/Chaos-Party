import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from 'react';
import { PLAYER_SLOTS, type Button, type PlayerInfo, type SlotNumber } from '@chaos-party/protocol';
import { chooseIntent, choiceById, describePrompt, isLocked, ownPrompt } from '../board/prompt.ts';
import { describeWaiting } from '../board/status.ts';
import { createMoveSender, type MoveSender } from '../input/moveSender.ts';
import { describePlay } from '../minigame/view.ts';
import type { SlotIntent } from '../net/client.ts';
import type { FeedbackPulse, PendingChoice, SlotContext } from '../state/reducer.ts';
import {
  BADGE_STRIP,
  boardZoneFrames,
  buildZones,
  MAX_ZONES,
  parseChoiceControl,
  rectCenter,
  ZONE_PADDING,
  type ControlGeometry,
  type Size,
  type ZoneGeometry,
} from '../zones/geometry.ts';
import { routeTouchEvent, TOUCH_EVENT_TYPES } from '../zones/touchRouter.ts';
import { contextKey, zoneControlsInput } from '../zones/zoneInput.ts';
import { createZoneTracker, type ZoneEffect, type ZoneTracker } from '../zones/zoneTracker.ts';
import { ChoiceFace, CountdownBar, ReactionBuzz, StatusBar, WaitingCard } from './board.tsx';
import { readableTextColor, slotColorVars } from './color.ts';
import { MinigameCard, MinigameHeader } from './minigame.tsx';
import { useInterruption } from './useInterruption.ts';

export interface ZoneBoardProps {
  players: readonly PlayerInfo[];
  contexts: Readonly<Partial<Record<SlotNumber, SlotContext>>>;
  feedback: Readonly<Partial<Record<SlotNumber, FeedbackPulse>>>;
  /** Gesendete, noch unbeantwortete Wahlen je Slot (Brettphase, CHAOS-22). */
  choices?: Readonly<Partial<Record<SlotNumber, PendingChoice>>>;
  send: (intent: SlotIntent) => void;
}

const NO_CHOICES: Readonly<Partial<Record<SlotNumber, PendingChoice>>> = {};

/* ---------------------------------------------------------------------------
 * Größe der Spielfläche (= Layout-Viewport; die Fläche ist `position: fixed`).
 * ------------------------------------------------------------------------- */

function subscribeViewport(onChange: () => void): () => void {
  window.addEventListener('resize', onChange);
  window.addEventListener('orientationchange', onChange);
  return () => {
    window.removeEventListener('resize', onChange);
    window.removeEventListener('orientationchange', onChange);
  };
}

function viewportSnapshot(): string {
  const root = document.documentElement;
  return `${String(root.clientWidth)}x${String(root.clientHeight)}`;
}

function parseSize(key: string): Size {
  const [width = 0, height = 0] = key.split('x').map(Number);
  return { width, height };
}

/* ---------------------------------------------------------------------------
 * Anzeige direkt im DOM nachführen (kein React-Rendern pro Fingerbewegung, A7).
 * ------------------------------------------------------------------------- */

function syncView(board: HTMLElement | null, tracker: ZoneTracker) {
  if (!board) return;
  for (const zoneEl of board.querySelectorAll<HTMLElement>('[data-zone-slot]')) {
    const slot = Number(zoneEl.dataset.zoneSlot) as SlotNumber;
    const view = tracker.view(slot);

    const stickEl = zoneEl.querySelector<HTMLElement>('[data-role="stick"]');
    const base = stickEl?.querySelector<HTMLElement>('[data-role="stick-base"]');
    const knob = stickEl?.querySelector<HTMLElement>('[data-role="stick-knob"]');
    if (stickEl && base && knob) {
      if (view.stick) {
        const dx = view.stick.origin.x - Number(stickEl.dataset.cx);
        const dy = view.stick.origin.y - Number(stickEl.dataset.cy);
        base.style.transform = `translate(-50%, -50%) translate(${String(dx)}px, ${String(dy)}px)`;
        knob.style.transform = `translate(${String(view.stick.knob.dx)}px, ${String(view.stick.knob.dy)}px)`;
      } else {
        base.style.transform = '';
        knob.style.transform = '';
      }
      const active = view.stick ? 'true' : 'false';
      stickEl.dataset.active = active;
      base.dataset.active = active;
    }

    for (const buttonEl of zoneEl.querySelectorAll<HTMLElement>('[data-role="button"]')) {
      const pressed = view.pressed.includes(buttonEl.dataset.button as Button);
      buttonEl.dataset.pressed = pressed ? 'true' : 'false';
    }
    const readyEl = zoneEl.querySelector<HTMLElement>('[data-role="ready"]');
    if (readyEl) readyEl.dataset.pressed = view.readyHeld ? 'true' : 'false';

    for (const choiceEl of zoneEl.querySelectorAll<HTMLElement>('[data-role="choice"]')) {
      const held = view.choicesHeld.some((kind) => kind === choiceEl.dataset.control);
      choiceEl.dataset.pressed = held ? 'true' : 'false';
    }
  }
}

/**
 * Geteiltes iPad (CHAOS-13, ADR-008): eine Spielerzone pro Platz dieser Verbindung.
 *
 * Eingabe über **Touch Events** auf der ganzen Fläche: Der Zonen-Tracker ordnet
 * jede Berührung beim Aufsetzen einer Zone und einem Bedienelement zu (reine
 * Geometrie, dieselben Rechtecke wie die Darstellung). Alle Kinder haben
 * `pointer-events: none`, damit das Ziel jeder Berührung die stabile Fläche ist –
 * verschwindende Knöpfe (Kontextwechsel) können so keine Touch-Folgen verschlucken.
 */
export function ZoneBoard({
  players,
  contexts,
  feedback,
  choices = NO_CHOICES,
  send,
}: ZoneBoardProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const sizeKey = useSyncExternalStore(subscribeViewport, viewportSnapshot);
  const viewport = useMemo(() => parseSize(sizeKey), [sizeKey]);
  const [tracker] = useState(createZoneTracker);
  /** Kontext, in dem die Zone `ready` gesendet hat (blendet den Knopf aus). */
  const [readySent, setReadySent] = useState<Partial<Record<SlotNumber, string>>>({});

  const seated = useMemo(() => players.slice(0, MAX_ZONES), [players]);
  const zones = useMemo(
    () =>
      buildZones(
        seated.map((p) => p.slot),
        viewport,
        (slot) => zoneControlsInput(contexts[slot], readySent[slot], slot, choices[slot]),
      ),
    [seated, viewport, contexts, readySent, choices],
  );

  const movers = useMemo(() => {
    const map = new Map<SlotNumber, MoveSender>();
    for (const { slot } of seated) {
      map.set(
        slot,
        createMoveSender((stick) => {
          send({ type: 'move', slot, x: stick.x, y: stick.y });
        }),
      );
    }
    return map;
  }, [seated, send]);

  // Neueste Werte für Ereignis-Handler (vor dem setZones-Effekt aktualisiert).
  const latest = useRef({ contexts, choices, movers, send });
  useLayoutEffect(() => {
    latest.current = { contexts, choices, movers, send };
  });

  const apply = useCallback(
    (effects: readonly ZoneEffect[]) => {
      const {
        contexts: ctxs,
        choices: pending,
        movers: senders,
        send: sendIntent,
      } = latest.current;
      for (const effect of effects) {
        switch (effect.type) {
          case 'stick':
            senders.get(effect.slot)?.update(effect.stick);
            break;
          case 'press':
          case 'release':
            sendIntent({ type: effect.type, slot: effect.slot, button: effect.button });
            break;
          case 'ready': {
            const context = ctxs[effect.slot];
            if (!context?.actions.includes('ready')) break;
            sendIntent({ type: 'ready', slot: effect.slot });
            const key = contextKey(context);
            setReadySent((prev) => ({ ...prev, [effect.slot]: key }));
            break;
          }
          case 'choose': {
            // Nur für den angezeigten Prompt dieser Zone; die Sitzung sperrt danach (CHAOS-22).
            const intent = chooseIntent(
              effect.slot,
              ctxs[effect.slot],
              pending[effect.slot],
              effect.option,
              effect.promptId,
            );
            if (intent) sendIntent(intent);
            break;
          }
        }
      }
      syncView(boardRef.current, tracker);
    },
    [tracker],
  );

  // Neue Zonen (Kontext, Drehen, Größe): Tracker nachführen, ggf. loslassen.
  useLayoutEffect(() => {
    apply(tracker.setZones(zones));
  }, [apply, tracker, zones]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onTouch = (event: TouchEvent) => {
      // Kein Scrollen/Zoomen, keine nachgeahmten Maus-Klicks.
      if (event.cancelable) event.preventDefault();
      const rect = board.getBoundingClientRect();
      apply(routeTouchEvent(tracker, event, { x: rect.left, y: rect.top }));
    };
    for (const type of TOUCH_EVENT_TYPES) {
      board.addEventListener(type, onTouch, { passive: false });
    }
    return () => {
      for (const type of TOUCH_EVENT_TYPES) board.removeEventListener(type, onTouch);
    };
  }, [apply, tracker]);

  // App-Wechsel, Sperrbildschirm, Verschwinden: alle Zonen lassen los.
  useInterruption(() => {
    apply(tracker.cancelAll());
  });

  const orientation = viewport.width >= viewport.height ? 'landscape' : 'portrait';

  return (
    <div
      ref={boardRef}
      className="zone-board"
      data-testid="zone-board"
      data-seats={seated.length}
      data-orientation={orientation}
    >
      {zones.map((zone) => {
        const player = seated.find((p) => p.slot === zone.slot);
        if (!player) return null;
        return (
          <Zone
            key={zone.slot}
            zone={zone}
            player={player}
            players={seated}
            context={contexts[zone.slot]}
            feedback={feedback[zone.slot]}
            pending={choices[zone.slot]}
          />
        );
      })}
    </div>
  );
}

interface ZoneProps {
  zone: ZoneGeometry;
  player: PlayerInfo;
  players: readonly PlayerInfo[];
  context: SlotContext | undefined;
  feedback: FeedbackPulse | undefined;
  pending: PendingChoice | undefined;
}

function rectStyle(rect: { x: number; y: number; width: number; height: number }): CSSProperties {
  return { left: rect.x, top: rect.y, width: rect.width, height: rect.height };
}

const Zone = memo(function Zone({ zone, player, players, context, feedback, pending }: ZoneProps) {
  const layout = context?.layout ?? 'wait';
  const style = {
    ...rectStyle(zone.rect),
    '--player': player.color,
    '--on-player': readableTextColor(player.color),
  } as CSSProperties;
  const contentStyle: CSSProperties = {
    width: zone.local.width,
    height: zone.local.height,
    transform: `translate(-50%, -50%) rotate(${String(zone.rotation)}deg)`,
  };
  const control = (kind: ControlGeometry['kind']) => zone.controls.find((c) => c.kind === kind);
  const ready = control('ready');
  const stick = control('stick');
  const minigame = context?.minigame;
  const play = context && layout === 'joystick-buttons' ? describePlay(context) : null;
  const buttons = (['a', 'b'] as const).flatMap((button) => {
    const geometry = control(button === 'a' ? 'button-a' : 'button-b');
    const label = play?.buttons.find((entry) => entry.button === button)?.label ?? null;
    return geometry ? [{ button, geometry, label }] : [];
  });
  const badge = (
    <header className="player-badge zone-badge" data-testid="player-badge">
      <span className="player-symbol" aria-hidden="true">
        {PLAYER_SLOTS[player.slot].symbol}
      </span>
      <span className="player-label ui-text">{player.label}</span>
    </header>
  );

  return (
    <section
      className={`zone layout-${layout}${minigame ? ` minigame-${minigame.stage}` : ''}`}
      style={style}
      data-testid={`zone-${String(zone.slot)}`}
      data-zone-slot={zone.slot}
      data-layout={layout}
      data-phase={context?.phase ?? 'none'}
      data-minigame-stage={minigame?.stage ?? 'none'}
      data-rotation={zone.rotation}
    >
      <div className="zone-content" style={contentStyle}>
        {play && play.title !== null ? (
          // Minispiel läuft (CHAOS-33): Plakette und Titel nebeneinander im Kopfstreifen.
          <div className="zone-head">
            {badge}
            <MinigameHeader title={play.title} className="zone-minigame-header" />
          </div>
        ) : (
          badge
        )}

        {layout === 'lobby' &&
          (ready ? (
            <div
              className="ready-button zone-ready"
              data-testid="ready-button"
              data-role="ready"
              style={rectStyle(ready.rect)}
            >
              <span className="ui-text">Bereit!</span>
            </div>
          ) : (
            <div className="zone-message ready-done" data-testid="ready-done">
              <span className="ready-check" aria-hidden="true">
                ✓
              </span>
              <p className="panel-lead ui-text">Du bist dabei! Gleich geht&apos;s los …</p>
            </div>
          ))}

        {layout === 'wait' && (
          <div className="zone-message" data-testid="wait-panel">
            <span className="wait-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <p className="panel-lead ui-text">Schau auf den großen Bildschirm!</p>
          </div>
        )}

        {layout === 'joystick-buttons' && stick && (
          <div
            className="joystick-zone"
            data-testid="joystick"
            data-role="stick"
            data-active="false"
            data-cx={rectCenter(stick.rect).x - stick.rect.x}
            data-cy={rectCenter(stick.rect).y - stick.rect.y}
            style={rectStyle(stick.rect)}
          >
            <div
              className="joystick-base"
              data-role="stick-base"
              data-active="false"
              style={{ width: zone.stickRadius * 2, height: zone.stickRadius * 2 }}
            >
              <div className="joystick-knob" data-role="stick-knob" />
            </div>
            <span className="joystick-hint ui-text" data-testid="joystick-hint">
              {play?.stickHint}
            </span>
          </div>
        )}

        {layout === 'joystick-buttons' &&
          buttons.map(({ button, geometry, label }) => (
            <div
              key={button}
              className={`action-button action-${button} zone-button${label === null ? '' : ' has-label'}`}
              data-testid={`button-${button}`}
              data-role="button"
              data-button={button}
              aria-label={`Knopf ${button.toUpperCase()}${label === null ? '' : `: ${label}`}`}
              style={rectStyle(geometry.rect)}
            >
              <span className="action-letter ui-text">{button.toUpperCase()}</span>
              {label !== null && (
                <span className="action-label ui-text" data-testid={`button-${button}-label`}>
                  {label}
                </span>
              )}
            </div>
          ))}

        {layout === 'board' && context && (
          <ZoneBoardContent zone={zone} players={players} context={context} pending={pending} />
        )}

        {feedback && (
          <span
            key={feedback.id}
            className={`feedback feedback-${feedback.kind}`}
            data-testid="feedback"
          />
        )}
      </div>
    </section>
  );
});

interface ZoneBoardContentProps {
  zone: ZoneGeometry;
  players: readonly PlayerInfo[];
  context: SlotContext;
  pending: PendingChoice | undefined;
}

/**
 * Brettphase in einer Zone (CHAOS-22): kompakte Statuszeile, Titel, Countdown und die
 * Wahlknöpfe an genau den Rechtecken, die der Zonen-Tracker prüft (`zone.controls`).
 */
function ZoneBoardContent({ zone, players, context, pending }: ZoneBoardContentProps) {
  if (context.minigame) {
    // Minispiel-Intro/-Ergebnis (CHAOS-33): ganze Fläche unter der Plakette, ohne Stand.
    const body = {
      x: ZONE_PADDING,
      y: BADGE_STRIP,
      width: Math.max(0, zone.local.width - 2 * ZONE_PADDING),
      height: Math.max(0, zone.local.height - BADGE_STRIP - ZONE_PADDING),
    };
    return (
      <div
        className="zone-board-phase"
        data-testid="minigame-panel"
        data-game-phase={context.board?.gamePhase ?? 'none'}
      >
        <div className="zone-minigame" style={rectStyle(body)}>
          <MinigameCard minigame={context.minigame} compact />
        </div>
      </div>
    );
  }
  const frames = boardZoneFrames(zone.local);
  const prompt = ownPrompt(context, zone.slot);
  const view = prompt ? describePrompt(prompt.info) : null;
  const locked = prompt ? isLocked(prompt, pending) : false;
  const choices = zone.controls.flatMap((control) => {
    const parsed = parseChoiceControl(control.kind);
    const choice = parsed && view ? choiceById(view, parsed.option) : undefined;
    return choice ? [{ control, choice }] : [];
  });
  const extraIds = new Set(view?.extra.map((c) => c.id));

  return (
    <div
      className="zone-board-phase"
      data-testid="board-panel"
      data-prompt-kind={view?.kind ?? 'none'}
      data-game-phase={context.board?.gamePhase ?? 'none'}
    >
      {context.board && (
        <div className="zone-status" style={rectStyle(frames.status)}>
          <StatusBar board={context.board} compact />
        </div>
      )}
      {prompt && view ? (
        <div
          className="zone-prompt"
          data-testid="prompt"
          data-kind={view.kind}
          data-prompt-id={prompt.info.id}
          data-locked={locked ? 'true' : 'false'}
        >
          {view.kind === 'reaction' && <ReactionBuzz promptId={prompt.info.id} />}
          <h2 className="prompt-title zone-prompt-title ui-text" style={rectStyle(frames.title)}>
            {locked ? 'Gesendet … warte kurz' : prompt.info.title}
          </h2>
          {locked && <span hidden data-testid="choice-sent" />}
          <div className="zone-timer" style={rectStyle(frames.timer)}>
            <CountdownBar key={prompt.info.id} prompt={prompt} big={view.kind === 'reaction'} />
          </div>
          {choices.map(({ control, choice }) => (
            <div
              key={control.kind}
              className={`choice-button ${extraIds.has(choice.id) ? 'choice-extra' : 'choice-main'} tone-${choice.tone} zone-choice`}
              data-testid={`choice-${choice.id}`}
              data-role="choice"
              data-control={control.kind}
              data-option={choice.id}
              data-pressed="false"
              data-disabled={locked ? 'true' : 'false'}
              data-chosen={locked && pending?.option === choice.id ? 'true' : 'false'}
              style={{
                ...rectStyle(control.rect),
                ...(slotColorVars(choice.slot === null ? null : PLAYER_SLOTS[choice.slot].color) as
                  CSSProperties | undefined),
              }}
            >
              <ChoiceFace choice={choice} />
            </div>
          ))}
        </div>
      ) : (
        <div className="zone-waiting" style={rectStyle(frames.body)}>
          <WaitingCard view={describeWaiting(context.board, zone.slot, players)} compact />
        </div>
      )}
    </div>
  );
}
