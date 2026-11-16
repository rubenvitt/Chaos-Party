/**
 * CHAOS-38: Host-Verbindungsverlust im laufenden Brettspiel (ADR-015, Nachtrag „Auto-Pause“).
 *
 * Verliert der Host (PC-Tab) die Verbindung – Neuladen, Absturz, eingefrorener Tab –, pausiert
 * die Session die Partie selbst: keine Frist läuft ab, kein Minispiel wird abgebrochen, keine
 * Eingabe geht verloren an einen fehlenden Host. Kommt ein Host zurück, setzt die Session eine
 * solche Auto-Pause fort und schickt ihm den vollständigen Stand (Lobby + Brett mit Restzeiten
 * und Minispiel-Stand). Eine Pause, die der Host selbst ausgelöst hat, bleibt bis `resume`.
 * Künstliche Uhr, feste Seeds.
 */
import { createMessage, type SlotNumber } from '@chaos-party/protocol';
import { rankByScore } from '@chaos-party/minigame-sdk';
import { getMinigameInfo, rotationInfos } from '@chaos-party/minigames/catalog';
import { describe, expect, it } from 'vitest';
import {
  assertContiguousEvents,
  type Harness,
  HOST,
  INTEGRATION_SEEDS,
  playMinigameAsHost,
  pressInMinigame,
  setupGame,
  setupMinigameGame,
  TICK_MS,
} from './testHarness.ts';

const ROTATION = rotationInfos().map((info) => info.id);

/** Lässt die Zeit laufen, ohne dass Bots antworten. */
function idle(h: Harness, ms: number): void {
  for (let t = 0; t < ms; t += TICK_MS) h.tick();
}

function lastView(h: Harness) {
  const view = h.boards.at(-1)?.view;
  if (!view) throw new Error('kein Brett-Stand');
  return view;
}

/** Ereignistypen ohne absolute Zeitpunkte (Reaktionsfrist verschiebt sich mit einer Pause). */
function eventTypes(h: Harness): string[] {
  return h.events.map((event) => event.type);
}

describe('Host-Verbindungsverlust (CHAOS-38)', () => {
  it('Host trennt sich beim Würfeln → Auto-Pause; neuer Host bekommt den Stand, Partie geht weiter', () => {
    const h = setupGame(3, INTEGRATION_SEEDS.three, { rounds: 2 });
    h.runUntil((x) => x.openPrompt('roll') !== null);
    const open = h.openPrompt('roll');
    if (!open) throw new Error('kein Würfel-Prompt');
    const eventsBefore = h.events.length;
    const boardsBefore = h.boards.length;

    h.dropHost();
    expect(h.session.snapshot()).toMatchObject({ hostConnected: false, pausedBy: 'host-lost' });
    expect(h.session.snapshot().game?.state.paused).toBe(true);
    // Controller sehen sofort die Pause: nichts angeboten, kein Prompt.
    for (const slot of [1, 2, 3] as SlotNumber[]) {
      const context = h.contexts.get(slot)?.context;
      expect(context?.board?.paused).toBe(true);
      expect(context?.actions).toEqual([]);
      expect(context?.prompt).toBeUndefined();
    }
    // Wahl während der Pause: abgewiesen, nichts passiert.
    const owner = h.controllerOf(open.slot);
    h.choose(owner.id, open.slot, open.prompt.id, 'roll');
    expect(h.errors.at(-1)).toEqual({ to: owner.id, code: 'paused' });
    h.errors.length = 0;

    // Fünf Minuten ohne Host: keine Ereignisse, keine Auto-Wahl, Controller bleiben verbunden.
    idle(h, 5 * 60_000);
    expect(h.session.snapshot().game?.state.phase).toBe('roll');
    expect(h.boards.length).toBe(boardsBefore);
    expect([...h.controllers.values()].every((c) => c.connected)).toBe(true);

    // Neuer Host (Seite neu geladen): Lobby + vollständiger Brett-Stand, Partie läuft weiter.
    const lobbiesBefore = h.lobbies.length;
    h.host();
    expect(h.lobbies.length).toBe(lobbiesBefore + 1);
    expect(h.lobby).toMatchObject({ phase: 'board' });
    const snapshot = h.boards.at(-1);
    expect(snapshot?.events).toEqual([]);
    expect(snapshot?.eventSeq).toBe(eventsBefore);
    expect(snapshot?.view).toMatchObject({
      paused: false,
      gamePhase: 'roll',
      activeSlot: open.slot,
      prompt: { id: open.prompt.id, kind: 'roll' },
    });
    expect(h.session.snapshot().pausedBy).toBeNull();
    // Derselbe Prompt ist wieder wählbar.
    expect(h.contexts.get(open.slot)?.context).toMatchObject({
      actions: ['choose'],
      prompt: { id: open.prompt.id },
    });
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    assertContiguousEvents(h);
    expect(h.events.some((e) => e.type === 'player-auto')).toBe(false);
    expect(h.errors).toEqual([]);
  });

  it('Host-Abriss zwischen zwei Takten, während ein Übergang fällig ist: kein Ereignis geht verloren', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    // Kurz nach dem Würfeln: Bewegung/Feldwirkung stehen als automatische Übergänge an.
    h.runUntil((x) => x.events.some((e) => e.type === 'dice-rolled'));
    const due = h.session.snapshot().game?.state.resumeAt;
    if (due === null || due === undefined) throw new Error('kein Übergang geplant');
    const eventsBefore = h.events.length;
    // Der Tab schließt, nachdem der Übergang fällig wurde, aber vor dem nächsten Server-Takt.
    h.clock = due + 50;
    h.dropHost();
    idle(h, 10_000);
    h.host();
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    assertContiguousEvents(h);
    expect(h.events.length).toBeGreaterThan(eventsBefore);
    // Dieselben Ereignisse wie ohne Abriss.
    const reference = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    reference.runToEnd();
    expect(eventTypes(h)).toEqual(eventTypes(reference));
  });

  it('eingefrorener Host-Tab: nach dem Herzschlag-Timeout getrennt und pausiert, ohne Ereignisverlust', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 3 });
    h.runUntil((x) => x.openPrompt('roll') !== null);
    h.hostHeartbeats = false;
    // Letzter Herzschlag lag höchstens 5 s zurück; Grenze 30 s Stille (ADR-009). Die Bots spielen
    // weiter, bis der Server den stummen Host trennt.
    h.runUntil((x) => !x.hostConnected, 400);
    expect(h.closes.at(-1)).toMatchObject({ to: HOST, reason: 'heartbeat-timeout' });
    expect(h.session.snapshot().pausedBy).toBe('host-lost');
    const state = h.session.snapshot().game?.state;
    idle(h, 60_000);
    expect(h.session.snapshot().game?.state.phase).toBe(state?.phase);
    h.hostHeartbeats = true;
    h.host();
    expect(lastView(h).paused).toBe(false);
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    assertContiguousEvents(h);
  });

  it('Host-Verlust mitten im Minispiel: kein Abbruch, Spielzeit steht, Eingaben und Ergebnis danach gültig', () => {
    const id = ROTATION[0] ?? 'pump-parade';
    const h = setupMinigameGame(id, 2, INTEGRATION_SEEDS.two, 1);
    h.runUntil((x) => x.gamePhase === 'minigame-play');
    idle(h, 3_000);
    const playStartedAt = h.session.snapshot().game?.state.minigame?.playStartedAt ?? h.clock;
    const elapsedAtLoss = h.clock - playStartedAt;
    expect(elapsedAtLoss).toBe(3_000);
    h.dropHost();
    // Controller sehen das Minispiel weiter, aber ohne Eingaben; Eingaben werden abgewiesen.
    expect(h.contexts.get(1)?.context).toMatchObject({
      layout: 'board',
      actions: [],
      minigame: { stage: 'play' },
    });
    const c1 = h.controllerOf(1);
    h.send(c1.id, createMessage('press', { slot: 1, seq: ++c1.seq, button: 'a' }));
    expect(h.errors.at(-1)).toEqual({ to: c1.id, code: 'paused' });
    h.errors.length = 0;
    // Weit über Spielzeit + Schonfrist ohne Host.
    const info = getMinigameInfo(id);
    if (!info) throw new Error('Minispiel fehlt');
    idle(h, info.durationMs + 60_000);
    expect(h.session.snapshot().game?.state.minigame?.aborted).toBe(false);
    expect(h.session.snapshot().game?.state.phase).toBe('minigame-play');

    h.host();
    const view = lastView(h);
    expect(view).toMatchObject({ paused: false, gamePhase: 'minigame-play' });
    expect(view.minigame?.aborted).toBe(false);
    expect(view.minigame?.rewards).toBeNull();
    // Spielzeit stand während der Abwesenheit still: der neue Host startet mit derselben Restzeit.
    expect(view.minigame?.elapsedMs).toBe(elapsedAtLoss);
    expect(h.contexts.get(1)?.context.layout).toBe('joystick-buttons');

    const sent = new Set<number>();
    const startedAt = new Map<number, number>();
    const pressed = new Map<SlotNumber, number>();
    const inputsBefore = h.hostInputs.length;
    h.runUntil(
      (x) => x.gamePhase === 'minigame-results',
      10_000,
      (x) => {
        pressInMinigame(x, pressed);
        playMinigameAsHost(x, { sent, startedAt });
      },
    );
    expect(h.hostInputs.length).toBeGreaterThan(inputsBefore);
    expect(h.acks.at(-1)).toMatchObject({ accepted: true });
    expect(lastView(h).minigame?.aborted).toBe(false);
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    assertContiguousEvents(h);
    expect(h.errors).toEqual([]);
  });

  it('Host rechnet während des Abrisses fertig und sendet nach dem Wiederverbinden: angenommen, Doppeltes abgelehnt', () => {
    const id = ROTATION[1] ?? ROTATION[0] ?? 'pump-parade';
    const h = setupMinigameGame(id, 3, INTEGRATION_SEEDS.three, 1);
    h.runUntil((x) => x.gamePhase === 'minigame-play');
    const view = lastView(h);
    const minigame = view.minigame;
    if (!minigame) throw new Error('kein Minispiel');
    const info = getMinigameInfo(minigame.id);
    h.dropHost();
    // Länger weg als Spielzeit + Schonfrist: ohne Auto-Pause wäre das Minispiel abgebrochen.
    idle(h, minigame.playMs + 30_000);
    h.host();
    const result = createMessage('minigame-result', {
      minigameId: minigame.id,
      round: minigame.round,
      placements: rankByScore(
        view.players.map((p) => ({ slot: p.slot, score: p.slot })),
        info?.scoring,
      ),
    });
    h.send(HOST, result);
    expect(h.acks.at(-1)).toMatchObject({ accepted: true, round: minigame.round });
    expect(lastView(h)).toMatchObject({ paused: false, gamePhase: 'minigame-results' });
    // Doppelt gesendet (Host weiß nach dem Reload nicht, ob es ankam): abgelehnt, Partie läuft weiter.
    h.send(HOST, result);
    expect(h.acks.at(-1)).toMatchObject({ accepted: false, code: 'invalid-result' });
    h.errors.length = 0;
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    assertContiguousEvents(h);
  });

  it('manuelle Pause bleibt über einen Host-Reload bestehen, bis der Host resume schickt', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    h.runUntil((x) => x.openPrompt('roll') !== null);
    h.pause();
    expect(h.session.snapshot().pausedBy).toBe('host');
    h.reloadHost();
    expect(h.session.snapshot().pausedBy).toBe('host');
    expect(lastView(h).paused).toBe(true);
    idle(h, 60_000);
    expect(lastView(h).paused).toBe(true);
    h.resume();
    expect(h.session.snapshot().pausedBy).toBeNull();
    // Reload ohne eigene Pause: Auto-Pause und sofort weiter.
    h.reloadHost();
    expect(h.session.snapshot().pausedBy).toBeNull();
    expect(lastView(h).paused).toBe(false);
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    assertContiguousEvents(h);
    expect(h.errors).toEqual([]);
  });

  it('Host-Reload im Endstand und in der Lobby: keine Pause; Revanche und Neustart danach', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    h.runToEnd();
    h.dropHost();
    expect(h.session.snapshot().pausedBy).toBeNull();
    h.host();
    expect(lastView(h)).toMatchObject({ gamePhase: 'game-results', paused: false });
    h.rematch();
    expect(h.session.phase).toBe('lobby');
    h.reloadHost();
    expect(h.session.snapshot()).toMatchObject({ phase: 'lobby', pausedBy: null });
    for (const id of h.controllers.keys()) h.ready(id);
    h.start();
    expect(lastView(h)).toMatchObject({ gamePhase: 'turn-start', paused: false });
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    assertContiguousEvents(h);
    expect(h.errors).toEqual([]);
  });

  it('gleicher Seed → gleicher Ablauf mit und ohne Host-Verlust (auch mitten im Minispiel)', () => {
    const run = (withLoss: boolean) => {
      const h = setupGame(3, INTEGRATION_SEEDS.three, { rounds: 2 });
      let losses = 0;
      h.runToEnd(200_000, (x) => {
        if (!withLoss) return;
        const phase = x.gamePhase;
        if ((losses === 0 && phase === 'minigame-intro') || (losses === 1 && phase === 'move')) {
          losses++;
          x.dropHost();
          idle(x, 45_000);
          x.host();
        }
      });
      expect(h.gamePhase).toBe('game-results');
      assertContiguousEvents(h);
      return { types: eventTypes(h), losses };
    };
    const lossy = run(true);
    expect(lossy.losses).toBe(2);
    expect(lossy.types).toEqual(run(false).types);
  });
});
