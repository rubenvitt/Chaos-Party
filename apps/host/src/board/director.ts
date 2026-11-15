/**
 * Regie der Brettphase am Host (CHAOS-19/20): nimmt `board`-Nachrichten des Servers an und
 * spielt ihre Ereignisse nacheinander ab. Der Host rechnet keine Regeln – er zeigt den
 * autoritativen Stand (`view`) und animiert nur den Weg dorthin.
 *
 * - Jede Nachricht wird zu „Ereignisse …, dann Stand übernehmen“ in einer Warteschlange.
 *   Erst wenn die Ereignisse einer Nachricht gespielt sind, gilt ihr `view` als gezeigt
 *   („übernommen“). Figuren stehen dann exakt auf den Feldern aus dem `view`.
 * - `eventSeq` (lückenlos ab 0): Doppeltes wird verworfen, eine Lücke (verpasste Nachricht,
 *   Neuverbindung) oder die erste Nachricht springen ohne Animation direkt auf den Stand.
 * - Rückstand (z. B. Tab im Hintergrund): ab 2,5 s wird dreifach schnell gespielt, ab 8 s
 *   wird gesprungen.
 * - Zeit vergeht nur über `advance(ms)` – die Szene ruft das je Frame auf (Testmodus: 1/60 s).
 *
 * Framework-frei: Die Szene liest `getFrame()` je Frame, der React-HUD abonniert
 * `getHud()` (ändert sich nur bei sichtbaren Änderungen, für `useSyncExternalStore`).
 */
import { getBoard } from '@chaos-party/game-core';
import type { BoardEvent, BoardMessage, BoardView, SlotNumber } from '@chaos-party/protocol';
import { hopAt, planEvent, POPUP_MS, type PopupSpec } from './animation.ts';
import { eventText, type EventText } from './texts.ts';

export interface FrameHop {
  readonly from: string;
  readonly to: string;
  /** Fortschritt des aktuellen Sprungs 0…1. */
  readonly t: number;
}

export interface FramePawn {
  readonly slot: SlotNumber;
  /** Feld, auf dem die Figur steht (beim Hüpfen: das Feld, von dem sie gerade abspringt). */
  readonly spaceId: string;
  readonly hop: FrameHop | null;
  readonly connected: boolean;
}

export interface FramePopup extends PopupSpec {
  readonly id: number;
  /** 0 beim Erscheinen … 1 beim Verschwinden. */
  readonly progress: number;
}

/** Was die Szene je Frame zeichnet. */
export interface BoardFrame {
  /** Übernommener Stand (oder `null` vor der ersten Nachricht). */
  readonly view: BoardView | null;
  readonly pawns: readonly FramePawn[];
  readonly popups: readonly FramePopup[];
}

export interface HudMessage extends EventText {
  readonly id: number;
}

export interface MinigameSummary {
  /** Platzierung des Minispiels (Index 0 = Platz 1); leer, solange es läuft. */
  readonly ranking: readonly SlotNumber[];
  /** Münzgewinn je Slot aus `coins-changed` mit Grund `minigame`. */
  readonly rewards: Readonly<Partial<Record<SlotNumber, number>>>;
}

/** Was der React-HUD zeigt; neues Objekt nur bei sichtbarer Änderung. */
export interface HudSnapshot {
  /** Übernommener Stand; Münzen bereits um gespielte `coins-changed` aktualisiert. */
  readonly view: BoardView | null;
  /** Letzte Meldungen, älteste zuerst. */
  readonly messages: readonly HudMessage[];
  /** Ganze Restsekunden des offenen Prompts (z. B. Reaktionsfenster) oder `null`. */
  readonly promptSeconds: number | null;
  /** Ganze Restsekunden der laufenden automatischen Phase (z. B. Minispiel) oder `null`. */
  readonly phaseSeconds: number | null;
  readonly minigame: MinigameSummary | null;
  readonly animating: boolean;
}

export interface DirectorStats {
  /** Angenommene `board`-Nachrichten (ohne veraltete). */
  readonly received: number;
  /** Gespielte oder übersprungene Ereignisse. */
  readonly eventsProcessed: number;
  /** Nächste erwartete `eventSeq` (`null` vor der ersten Nachricht). */
  readonly nextEventSeq: number | null;
  /** Sprünge wegen Lücke, erster Nachricht oder Rückstand. */
  readonly jumps: number;
}

export interface BoardDirector {
  receive(message: BoardMessage): void;
  /** Lässt `ms` Millisekunden Regie-Zeit vergehen. */
  advance(ms: number): void;
  /** Spielt alles Ausstehende ohne Animation ab (z. B. wenn die Szene neu startet). */
  settle(): void;
  getFrame(): BoardFrame;
  getHud(): HudSnapshot;
  subscribe(listener: () => void): () => void;
  /** Feld je Slot, wie gerade gezeigt (Testhaken). */
  getPawnSpaces(): Partial<Record<SlotNumber, string>>;
  readonly animating: boolean;
  readonly stats: DirectorStats;
}

export interface DirectorOptions {
  /** Wegweiser eines Felds für Meldungen („Blau nimmt: Pilzpfad“); Standard: aus `getBoard`. */
  readonly labelOf?: (boardId: string, spaceId: string) => string | undefined;
  /** Ab diesem Rückstand (ms) dreifach schnell. */
  readonly catchUpMs?: number;
  /** Ab diesem Rückstand (ms) wird gesprungen. */
  readonly jumpMs?: number;
}

/** So lange steht eine Meldung im Ticker. */
export const MESSAGE_MS = 5000;
/** Höchstens so viele Meldungen gleichzeitig. */
export const MAX_MESSAGES = 4;
export const CATCH_UP_MS = 2500;
export const JUMP_MS = 8000;
const CATCH_UP_SPEED = 3;

function boardLabel(boardId: string, spaceId: string): string | undefined {
  return getBoard(boardId)?.spaces.find((s) => s.id === spaceId)?.label;
}

type QueueItem =
  | { readonly kind: 'event'; readonly event: BoardEvent }
  | { readonly kind: 'commit'; readonly view: BoardView; readonly receivedAt: number };

interface Running {
  readonly event: BoardEvent;
  readonly durationMs: number;
  elapsedMs: number;
  /** Nur bei `moved`: Feld vor dem ersten Sprung. */
  readonly start: string | null;
  readonly stepMs: number;
}

interface ActivePopup extends PopupSpec {
  readonly id: number;
  readonly startedAt: number;
}

interface TimedMessage extends HudMessage {
  readonly createdAt: number;
}

export function createBoardDirector(options: DirectorOptions = {}): BoardDirector {
  const labelOf = options.labelOf ?? boardLabel;
  const catchUpMs = options.catchUpMs ?? CATCH_UP_MS;
  const jumpMs = options.jumpMs ?? JUMP_MS;

  let now = 0;
  let queue: QueueItem[] = [];
  let running: Running | null = null;
  let nextSeq: number | null = null;
  let committed: { view: BoardView; receivedAt: number } | null = null;
  /** Neuester empfangener Stand (Takt `stepMs`, Namen für Meldungen). */
  let latest: BoardView | null = null;
  const pawnSpaces = new Map<SlotNumber, string>();
  const coinOverride = new Map<SlotNumber, number>();
  let popups: ActivePopup[] = [];
  let messages: TimedMessage[] = [];
  let minigame: MinigameSummary | null = null;
  let nextId = 1;
  let received = 0;
  let eventsProcessed = 0;
  let jumps = 0;

  /** Erhöht sich bei jeder sichtbaren Änderung für den HUD. */
  let version = 0;
  let hud: HudSnapshot = {
    view: null,
    messages: [],
    promptSeconds: null,
    phaseSeconds: null,
    minigame: null,
    animating: false,
  };
  let hudVersion = -1;
  const listeners = new Set<() => void>();

  const stepMsOf = () => latest?.stepMs ?? committed?.view.stepMs ?? 0;

  function commit(view: BoardView, receivedAt: number) {
    committed = { view, receivedAt };
    pawnSpaces.clear();
    for (const player of view.players) pawnSpaces.set(player.slot, player.spaceId);
    coinOverride.clear();
    // Minispiel-Zusammenfassung gilt bis zum Ende der Minispiel-Phasen.
    if (!view.gamePhase.startsWith('minigame')) minigame = null;
    version++;
  }

  function startEvent(event: BoardEvent) {
    const nameView = latest ?? committed?.view ?? null;
    const text = eventText(event, nameView, (spaceId) =>
      nameView ? labelOf(nameView.boardId, spaceId) : undefined,
    );
    if (text) {
      messages.push({ ...text, id: nextId++, createdAt: now });
      if (messages.length > MAX_MESSAGES) messages = messages.slice(-MAX_MESSAGES);
      version++;
    }
    const plan = planEvent(event, stepMsOf());
    if (plan.popup) popups.push({ ...plan.popup, id: nextId++, startedAt: now });

    switch (event.type) {
      case 'coins-changed':
        coinOverride.set(event.slot, event.balance);
        if (event.reason === 'minigame') {
          const rewards = { ...(minigame?.rewards ?? {}), [event.slot]: event.delta };
          minigame = { ranking: minigame?.ranking ?? [], rewards };
        }
        version++;
        break;
      case 'minigame-started':
        minigame = { ranking: [], rewards: {} };
        version++;
        break;
      case 'minigame-results':
        minigame = { ranking: event.ranking, rewards: minigame?.rewards ?? {} };
        version++;
        break;
      default:
        break;
    }

    running = {
      event,
      durationMs: plan.durationMs,
      elapsedMs: 0,
      start: event.type === 'moved' ? (pawnSpaces.get(event.slot) ?? event.path[0] ?? null) : null,
      stepMs: stepMsOf(),
    };
    version++;
  }

  function finishEvent(current: Running) {
    const { event } = current;
    if (event.type === 'moved') {
      const last = event.path[event.path.length - 1];
      if (last !== undefined) pawnSpaces.set(event.slot, last);
    }
    eventsProcessed++;
    running = null;
    version++;
  }

  function backlogMs(): number {
    let total = running ? running.durationMs - running.elapsedMs : 0;
    const stepMs = stepMsOf();
    for (const item of queue) {
      if (item.kind === 'event') total += planEvent(item.event, stepMs).durationMs;
    }
    return total;
  }

  /** Spielt mit `budget` ms Regie-Zeit ab; Übernahmen und Ereignisse ohne Dauer sofort. */
  function pump(budget: number) {
    let left = budget;
    for (;;) {
      if (!running) {
        const item = queue.shift();
        if (!item) break;
        if (item.kind === 'commit') {
          commit(item.view, item.receivedAt);
          continue;
        }
        startEvent(item.event);
      }
      const current = running;
      if (!current) continue;
      const need = current.durationMs - current.elapsedMs;
      if (left >= need) {
        left -= need;
        finishEvent(current);
        continue;
      }
      current.elapsedMs += left;
      break;
    }
  }

  /** Alles Ausstehende ohne Animation übernehmen. */
  function flush() {
    if (running) finishEvent(running);
    let lastCommit: Extract<QueueItem, { kind: 'commit' }> | null = null;
    for (const item of queue) {
      if (item.kind === 'commit') lastCommit = item;
      else eventsProcessed++;
    }
    queue = [];
    if (lastCommit) commit(lastCommit.view, lastCommit.receivedAt);
    if (popups.length > 0) {
      popups = [];
      version++;
    }
  }

  function expire() {
    const keepPopups = popups.filter((p) => now - p.startedAt < POPUP_MS);
    if (keepPopups.length !== popups.length) popups = keepPopups;
    const keepMessages = messages.filter((m) => now - m.createdAt < MESSAGE_MS);
    if (keepMessages.length !== messages.length) {
      messages = keepMessages;
      version++;
    }
  }

  function secondsLeft(remainingMs: number | null | undefined, receivedAt: number): number | null {
    if (remainingMs === null || remainingMs === undefined) return null;
    return Math.max(0, Math.ceil((remainingMs - (now - receivedAt)) / 1000));
  }

  function isAnimating(): boolean {
    return running !== null || queue.some((item) => item.kind === 'event');
  }

  function refreshHud() {
    const promptSeconds = committed
      ? secondsLeft(committed.view.prompt?.remainingMs, committed.receivedAt)
      : null;
    const phaseSeconds = committed
      ? secondsLeft(committed.view.remainingMs, committed.receivedAt)
      : null;
    const animating = isAnimating();
    if (
      hudVersion === version &&
      hud.promptSeconds === promptSeconds &&
      hud.phaseSeconds === phaseSeconds &&
      hud.animating === animating
    ) {
      return;
    }
    let view = committed?.view ?? null;
    if (view && coinOverride.size > 0) {
      const base = view;
      view = {
        ...base,
        players: base.players.map((p) => {
          const coins = coinOverride.get(p.slot);
          return coins === undefined ? p : { ...p, coins };
        }),
      };
    }
    hud = {
      view,
      messages: messages.map((m) => ({ id: m.id, text: m.text, slot: m.slot, tone: m.tone })),
      promptSeconds,
      phaseSeconds,
      minigame,
      animating,
    };
    hudVersion = version;
    for (const listener of [...listeners]) listener();
  }

  function getFrame(): BoardFrame {
    const view = committed?.view ?? null;
    const pawns: FramePawn[] = (view?.players ?? []).map((player) => {
      let spaceId = pawnSpaces.get(player.slot) ?? player.spaceId;
      let hop: FrameHop | null = null;
      if (running?.event.type === 'moved' && running.event.slot === player.slot) {
        hop = hopAt(
          running.start ?? spaceId,
          running.event.path,
          running.stepMs,
          running.elapsedMs,
        );
        if (hop) spaceId = hop.from;
      }
      return { slot: player.slot, spaceId, hop, connected: player.connected };
    });
    const frames: FramePopup[] = popups.map(({ startedAt, ...spec }) => ({
      ...spec,
      progress: Math.min(1, Math.max(0, (now - startedAt) / POPUP_MS)),
    }));
    return { view, pawns, popups: frames };
  }

  return {
    receive(message) {
      const { view, events, eventSeq } = message;
      const end = eventSeq + events.length;
      if (nextSeq === null || eventSeq > nextSeq) {
        // Erste Nachricht oder Lücke: ohne Animation auf den Stand springen.
        flush();
        commit(view, now);
        jumps++;
        eventsProcessed += events.length;
      } else if (end < nextSeq) {
        // Veraltet (älter als das Gezeigte): ignorieren.
        return;
      } else {
        const fresh = events.slice(nextSeq - eventSeq);
        for (const event of fresh) queue.push({ kind: 'event', event });
        queue.push({ kind: 'commit', view, receivedAt: now });
      }
      received++;
      latest = view;
      nextSeq = end;
      pump(0);
      refreshHud();
    },
    advance(ms) {
      if (!(ms > 0)) return;
      now += ms;
      const backlog = backlogMs();
      if (backlog > jumpMs) {
        flush();
        jumps++;
      } else {
        pump(backlog > catchUpMs ? ms * CATCH_UP_SPEED : ms);
      }
      expire();
      refreshHud();
    },
    settle() {
      flush();
      refreshHud();
    },
    getFrame,
    getHud() {
      return hud;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getPawnSpaces() {
      const result: Partial<Record<SlotNumber, string>> = {};
      for (const pawn of getFrame().pawns) result[pawn.slot] = pawn.spaceId;
      return result;
    },
    get animating() {
      return isAnimating();
    },
    get stats() {
      return { received, eventsProcessed, nextEventSeq: nextSeq, jumps };
    },
  };
}
