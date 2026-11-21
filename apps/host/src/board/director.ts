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
 * - Windstoß und Platztausch (CHAOS-52): Ein `moved` direkt nach `board-event` `gust` wird als
 *   Flug gezeigt; beim Platztausch fliegen beide Figuren (zwei `moved` mit je einem Feld)
 *   gleichzeitig über Kreuz.
 * - Gleichzeitige Popups über derselben Stelle stapeln sich (`FramePopup.stack`, CHAOS-189).
 * - Zeit vergeht nur über `advance(ms)` – die Szene ruft das je Frame auf (Testmodus: 1/60 s).
 *
 * Framework-frei: Die Szene liest `getFrame()` je Frame, der React-HUD abonniert
 * `getHud()` (ändert sich nur bei sichtbaren Änderungen, für `useSyncExternalStore`).
 */
import { getBoard, isIce } from '@chaos-party/game-core';
import type {
  BoardEvent,
  BoardMessage,
  BoardView,
  CharacterId,
  SlotNumber,
} from '@chaos-party/protocol';
import { hopAt, planEvent, POPUP_MS, type MoveStyle, type PopupSpec } from './animation.ts';
import { eventNotice, eventText, playerName, type EventText, type NoticeText } from './texts.ts';

export interface FrameHop {
  readonly from: string;
  readonly to: string;
  /** Fortschritt des aktuellen Sprungs bzw. Flugs 0…1. */
  readonly t: number;
  /** `walk`: Sprung zum Nachbarfeld; `gust`/`swap`: ein Flug von `from` direkt nach `to`. */
  readonly style: MoveStyle;
}

export interface FramePawn {
  readonly slot: SlotNumber;
  /** Feld, auf dem die Figur steht (beim Hüpfen: das Feld, von dem sie gerade abspringt). */
  readonly spaceId: string;
  readonly hop: FrameHop | null;
  readonly connected: boolean;
  /** Gewählte Figur (v4, `BoardPlayer.character`). */
  readonly character: CharacterId;
}

export interface FramePopup extends PopupSpec {
  readonly id: number;
  /**
   * Stapelebene (CHAOS-189): 0 = unten; gleichzeitig sichtbare Popups über derselben Stelle
   * (Figur auf dem Feld oder das Feld selbst) bekommen die nächste freie Ebene und werden um
   * `stack × POPUP_STACK_HEIGHT` entlang der Bildschirm-Senkrechten versetzt, statt sich zu
   * überdecken.
   */
  readonly stack: number;
  /** 0 beim Erscheinen … 1 beim Verschwinden. */
  readonly progress: number;
}

/**
 * Zuletzt gespieltes Ereignis für die Kamera-Regie (CHAOS-194, `camera.ts`): Was gerade
 * passiert und seit wann. Auch Ereignisse ohne Dauer (`round-started`) stehen hier, damit die
 * Kamera kurz auf ihnen verweilen kann.
 */
export interface FrameCue {
  readonly event: BoardEvent;
  readonly style: MoveStyle;
  /** Nur bei `moved`: Feld vor dem ersten Sprung. */
  readonly start: string | null;
  /** Platztausch: das `moved` der anderen Figur und ihr Startfeld. */
  readonly partner: { readonly event: MovedEvent; readonly start: string } | null;
  /**
   * Seit dem Start vergangene Regie-Zeit (ms); läuft nach dem Ende weiter. Beim Aufholen
   * (dreifach schnell) zählt sie wie die Animation, nicht wie die Uhr.
   */
  readonly elapsedMs: number;
  readonly durationMs: number;
}

/** Was die Szene je Frame zeichnet. */
export interface BoardFrame {
  /** Übernommener Stand (oder `null` vor der ersten Nachricht). */
  readonly view: BoardView | null;
  readonly pawns: readonly FramePawn[];
  readonly popups: readonly FramePopup[];
  /**
   * Die zuletzt gestarteten Ereignisse, älteste zuerst (höchstens `MAX_CUES`, keins älter als
   * `CUE_MS`). Leer nach einem Sprung oder `settle()`.
   */
  readonly cues: readonly FrameCue[];
}

export interface HudMessage extends EventText {
  readonly id: number;
}

/** Große Einblendung in der Bildmitte (CHAOS-120). */
export interface HudNotice extends NoticeText {
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
  /** Laufende Einblendung (z. B. „Sabotage wird stärker!“) oder `null`. */
  readonly notice: HudNotice | null;
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
  /**
   * Meldet jedes Ereignis in dem Moment, in dem die Regie es abspielt (Klänge, CHAOS-33).
   * Übersprungene Ereignisse (Sprung, `settle`) werden nicht gemeldet. Liefert die Abmeldung.
   */
  onEvent(listener: (event: BoardEvent) => void): () => void;
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
/** So lange steht eine Einblendung in der Bildmitte. */
export const NOTICE_MS = 4000;
/** Höchstens so viele Meldungen gleichzeitig. */
export const MAX_MESSAGES = 4;
/** So viele zuletzt gestartete Ereignisse meldet `getFrame().cues`. */
export const MAX_CUES = 8;
/** Ältere Ereignisse fallen aus `cues`. */
export const CUE_MS = 4000;
export const CATCH_UP_MS = 2500;
export const JUMP_MS = 8000;
const CATCH_UP_SPEED = 3;

function boardLabel(boardId: string, spaceId: string): string | undefined {
  return getBoard(boardId)?.spaces.find((s) => s.id === spaceId)?.label;
}

export type MovedEvent = Extract<BoardEvent, { type: 'moved' }>;

interface EventItem {
  readonly kind: 'event';
  readonly event: BoardEvent;
  /** Nur bei `moved` bedeutsam. */
  readonly style: MoveStyle;
  /** Platztausch: das `moved` der anderen Figur, gleichzeitig gespielt. */
  readonly partner: MovedEvent | null;
}

type QueueItem =
  EventItem | { readonly kind: 'commit'; readonly view: BoardView; readonly receivedAt: number };

interface Running {
  readonly event: BoardEvent;
  readonly style: MoveStyle;
  readonly durationMs: number;
  elapsedMs: number;
  /** Nur bei `moved`: Feld vor dem ersten Sprung. */
  readonly start: string | null;
  /** Platztausch: die andere Figur und ihr Startfeld. */
  readonly partner: { readonly event: MovedEvent; readonly start: string } | null;
  readonly stepMs: number;
}

/**
 * Ereignisse einer Nachricht → Warteschlange (CHAOS-52): `moved` direkt nach einem Windstoß
 * bekommt den Stil `gust`; beim Platztausch werden die beiden `moved` (je ein Feld, zwei
 * verschiedene Figuren, die erste ist der Spieler am Zug) zu einem Schritt `swap`. Alles
 * andere bleibt ein Ereignis je Eintrag mit Stil `walk`.
 */
export function toQueueItems(events: readonly BoardEvent[]): EventItem[] {
  const items: EventItem[] = [];
  let flight: { readonly kind: 'gust' | 'swap'; readonly slot: SlotNumber } | null = null;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) continue;
    const pending = flight;
    flight = null;
    if (event.type === 'board-event' && (event.event === 'gust' || event.event === 'swap')) {
      flight = { kind: event.event, slot: event.slot };
    } else if (event.type === 'moved' && event.slot === pending?.slot) {
      if (pending.kind === 'gust') {
        items.push({ kind: 'event', event, style: 'gust', partner: null });
        continue;
      }
      const next = events[i + 1];
      if (
        event.path.length === 1 &&
        next?.type === 'moved' &&
        next.slot !== event.slot &&
        next.path.length === 1
      ) {
        items.push({ kind: 'event', event, style: 'swap', partner: next });
        i++;
        continue;
      }
    }
    items.push({ kind: 'event', event, style: 'walk', partner: null });
  }
  return items;
}

interface ActivePopup extends PopupSpec {
  readonly id: number;
  readonly stack: number;
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
  /** Zuletzt gestartete Ereignisse (`FrameCue` ohne Alter), älteste zuerst; Start in Regie-Zeit. */
  let cues: (Omit<FrameCue, 'elapsedMs'> & { readonly startedAt: number })[] = [];
  /** Gespielte Regie-Zeit (ms): wie `now`, beim Aufholen schneller. Uhr der `cues`. */
  let playedMs = 0;
  let messages: TimedMessage[] = [];
  let notice: (HudNotice & { readonly createdAt: number }) | null = null;
  /** Zuletzt gestartetes Ereignis (Rutschpartie erkennen, CHAOS-198). */
  let lastStarted: BoardEvent | null = null;
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
    notice: null,
    promptSeconds: null,
    phaseSeconds: null,
    minigame: null,
    animating: false,
  };
  let hudVersion = -1;
  const listeners = new Set<() => void>();
  const eventListeners = new Set<(event: BoardEvent) => void>();

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

  /** Meldung im Ticker und Ereignis-Abonnenten (Klänge). */
  function announce(event: BoardEvent) {
    const nameView = latest ?? committed?.view ?? null;
    const text = eventText(event, nameView, (spaceId) =>
      nameView ? labelOf(nameView.boardId, spaceId) : undefined,
    );
    if (text) {
      messages.push({ ...text, id: nextId++, createdAt: now });
      if (messages.length > MAX_MESSAGES) messages = messages.slice(-MAX_MESSAGES);
      version++;
    }
    const big = eventNotice(event, nameView);
    if (big) {
      notice = { ...big, id: nextId++, createdAt: now };
      version++;
    }
    for (const listener of [...eventListeners]) listener(event);
  }

  /** Stelle, über der ein Popup gerade steht: das Feld selbst oder das Feld seiner Figur. */
  function anchorOf(popup: PopupSpec): string | null {
    if (popup.slot !== null) {
      const space = pawnSpaces.get(popup.slot);
      return space === undefined ? `slot:${popup.slot}` : `space:${space}`;
    }
    return popup.spaceId === null ? null : `space:${popup.spaceId}`;
  }

  /**
   * Niedrigste Ebene, die kein noch sichtbares Popup über derselben Stelle belegt (CHAOS-189).
   * Abgelaufene Popups zählen nicht, auch wenn `expire` sie erst später entfernt.
   */
  function freeStack(popup: PopupSpec): number {
    const anchor = anchorOf(popup);
    if (anchor === null) return 0;
    const used = new Set<number>();
    for (const other of popups) {
      if (now - other.startedAt < POPUP_MS && anchorOf(other) === anchor) used.add(other.stack);
    }
    let stack = 0;
    while (used.has(stack)) stack++;
    return stack;
  }

  function startOf(event: MovedEvent): string {
    return pawnSpaces.get(event.slot) ?? event.path[0] ?? '';
  }

  /**
   * Rutschpartie auf Eis (CHAOS-198): ein `moved` derselben Figur direkt nach ihrem Lauf, das
   * auf einem Eisfeld beginnt. Der Regelkern schickt es ohne eigenes Ereignis.
   */
  function isSlide(event: BoardEvent, previous: BoardEvent | null): boolean {
    if (event.type !== 'moved' || previous?.type !== 'moved' || previous.slot !== event.slot) {
      return false;
    }
    const board = getBoard((latest ?? committed?.view)?.boardId ?? '');
    const from = previous.path[previous.path.length - 1];
    return board?.ice !== undefined && from !== undefined && isIce(board, from);
  }

  function startEvent(item: EventItem, at: number) {
    const { event, style, partner } = item;
    const slide = style === 'walk' && isSlide(event, lastStarted);
    lastStarted = event;
    announce(event);
    if (partner) announce(partner);
    const plan = planEvent(event, stepMsOf(), style);
    const popup: PopupSpec | null =
      slide && event.type === 'moved'
        ? { kind: 'event', slot: event.slot, spaceId: null, text: 'Rutsch!', tone: 'neutral' }
        : plan.popup;
    if (popup) {
      popups.push({ ...popup, id: nextId++, stack: freeStack(popup), startedAt: now });
    }
    if (slide && event.type === 'moved') {
      const view = latest ?? committed?.view ?? null;
      messages.push({
        text: `${playerName(view, event.slot)} rutscht auf dem Eis weiter!`,
        slot: event.slot,
        tone: 'neutral',
        id: nextId++,
        createdAt: now,
      });
      if (messages.length > MAX_MESSAGES) messages = messages.slice(-MAX_MESSAGES);
    }

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
      style,
      durationMs: plan.durationMs,
      elapsedMs: 0,
      start: event.type === 'moved' ? (pawnSpaces.get(event.slot) ?? event.path[0] ?? null) : null,
      partner: partner ? { event: partner, start: startOf(partner) } : null,
      stepMs: stepMsOf(),
    };
    cues.push({
      event,
      style,
      start: running.start,
      partner: running.partner,
      durationMs: plan.durationMs,
      startedAt: at,
    });
    if (cues.length > MAX_CUES) cues = cues.slice(-MAX_CUES);
    version++;
  }

  function finishEvent(current: Running) {
    const { event, partner } = current;
    for (const moved of [event, partner?.event]) {
      if (moved?.type !== 'moved') continue;
      const last = moved.path[moved.path.length - 1];
      if (last !== undefined) pawnSpaces.set(moved.slot, last);
    }
    eventsProcessed += partner ? 2 : 1;
    running = null;
    version++;
  }

  function backlogMs(): number {
    let total = running ? running.durationMs - running.elapsedMs : 0;
    const stepMs = stepMsOf();
    for (const item of queue) {
      if (item.kind === 'event') total += planEvent(item.event, stepMs, item.style).durationMs;
    }
    return total;
  }

  /** Spielt mit `budget` ms Regie-Zeit ab; Übernahmen und Ereignisse ohne Dauer sofort. */
  function pump(budget: number) {
    let left = budget;
    const base = playedMs;
    playedMs += budget;
    for (;;) {
      if (!running) {
        const item = queue.shift();
        if (!item) break;
        if (item.kind === 'commit') {
          commit(item.view, item.receivedAt);
          continue;
        }
        startEvent(item, base + (budget - left));
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
      else eventsProcessed += item.partner ? 2 : 1;
    }
    queue = [];
    cues = [];
    lastStarted = null;
    if (lastCommit) commit(lastCommit.view, lastCommit.receivedAt);
    if (popups.length > 0) {
      popups = [];
      version++;
    }
  }

  function expire() {
    if (cues.length > 0 && playedMs - (cues[0]?.startedAt ?? playedMs) >= CUE_MS) {
      cues = cues.filter((c) => playedMs - c.startedAt < CUE_MS);
    }
    const keepPopups = popups.filter((p) => now - p.startedAt < POPUP_MS);
    if (keepPopups.length !== popups.length) popups = keepPopups;
    const keepMessages = messages.filter((m) => now - m.createdAt < MESSAGE_MS);
    if (keepMessages.length !== messages.length) {
      messages = keepMessages;
      version++;
    }
    if (notice && now - notice.createdAt >= NOTICE_MS) {
      notice = null;
      version++;
    }
  }

  function secondsLeft(
    remainingMs: number | null | undefined,
    receivedAt: number,
    paused: boolean,
  ): number | null {
    if (remainingMs === null || remainingMs === undefined) return null;
    // Pause (v4): Restzeiten stehen still, der Server schickt beim Fortsetzen neue.
    const elapsed = paused ? 0 : now - receivedAt;
    return Math.max(0, Math.ceil((remainingMs - elapsed) / 1000));
  }

  function isAnimating(): boolean {
    return running !== null || queue.some((item) => item.kind === 'event');
  }

  function refreshHud() {
    const promptSeconds = committed
      ? secondsLeft(committed.view.prompt?.remainingMs, committed.receivedAt, committed.view.paused)
      : null;
    const phaseSeconds = committed
      ? secondsLeft(committed.view.remainingMs, committed.receivedAt, committed.view.paused)
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
      notice: notice && { id: notice.id, title: notice.title, detail: notice.detail },
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
      if (running?.event.type === 'moved') {
        const flightT =
          running.durationMs > 0 ? Math.min(1, running.elapsedMs / running.durationMs) : 1;
        const { event, partner } = running;
        if (event.slot === player.slot) {
          if (running.style === 'walk') {
            const walk = hopAt(
              running.start ?? spaceId,
              event.path,
              running.stepMs,
              running.elapsedMs,
            );
            hop = walk ? { ...walk, style: 'walk' } : null;
          } else {
            const to = event.path[event.path.length - 1];
            hop = to
              ? { from: running.start ?? spaceId, to, t: flightT, style: running.style }
              : null;
          }
        } else if (partner?.event.slot === player.slot) {
          const to = partner.event.path[0];
          hop = to ? { from: partner.start || spaceId, to, t: flightT, style: 'swap' } : null;
        }
        if (hop) spaceId = hop.from;
      }
      return {
        slot: player.slot,
        spaceId,
        hop,
        connected: player.connected,
        character: player.character,
      };
    });
    const frames: FramePopup[] = popups.map(({ startedAt, ...spec }) => ({
      ...spec,
      progress: Math.min(1, Math.max(0, (now - startedAt) / POPUP_MS)),
    }));
    return {
      view,
      pawns,
      popups: frames,
      cues: cues.map(({ startedAt, ...cue }) => ({ ...cue, elapsedMs: playedMs - startedAt })),
    };
  }

  return {
    receive(message) {
      const { view, events, eventSeq } = message;
      const end = eventSeq + events.length;
      // Neue Partie nach „Nochmal spielen“: Der Server zählt `eventSeq` wieder ab 0. Ohne
      // diese Erkennung gälte sie als veraltet und das Brett zeigte weiter den alten Endstand.
      const shown = latest ?? committed?.view ?? null;
      const newGame = eventSeq === 0 && nextSeq !== null && shown?.gamePhase === 'game-results';
      if (nextSeq === null || eventSeq > nextSeq || newGame) {
        // Erste Nachricht, Lücke oder neue Partie: ohne Animation auf den Stand springen.
        flush();
        commit(view, now);
        jumps++;
        eventsProcessed += events.length;
      } else if (end < nextSeq) {
        // Veraltet (älter als das Gezeigte): ignorieren.
        return;
      } else {
        queue.push(...toQueueItems(events.slice(nextSeq - eventSeq)));
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
    onEvent(listener) {
      eventListeners.add(listener);
      return () => {
        eventListeners.delete(listener);
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
