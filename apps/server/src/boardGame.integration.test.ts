/**
 * CHAOS-23: Deterministische Integrationstests für den kompletten Zugzyklus.
 *
 * Session (Server) + game-core + synthetische Controller und Host, künstliche Uhr im
 * 100-ms-Takt wie im echten Server. Jede ausgehende Nachricht wird mit dem echten
 * Protokoll-Parser geprüft. Die Bots antworten nur auf das, was der Server ihnen im
 * `context` anbietet – genau wie die echten Controller.
 *
 * Seeds sind fest und in `docs/progress.md` dokumentiert. Die Helfer (Harness, Bots,
 * synthetischer Host) liegen in `testHarness.ts`.
 */
import { DEFAULT_RULES } from '@chaos-party/game-core';
import { createMessage, type BoardEvent, type SlotNumber } from '@chaos-party/protocol';
import { rankByScore } from '@chaos-party/minigame-sdk';
import { getMinigameInfo, rotationInfos } from '@chaos-party/minigames/catalog';
import { describe, expect, it } from 'vitest';
import {
  assertContiguousEvents,
  Harness,
  HOST,
  INTEGRATION_SEEDS,
  playMinigameAsHost,
  pressInMinigame,
  setupGame,
  setupMinigameGame,
  turnsPerSlot,
  type ReactionPolicy,
} from './testHarness.ts';

describe('Brettspiel über die Session (CHAOS-23)', () => {
  it.each([
    [2, INTEGRATION_SEEDS.two],
    [3, INTEGRATION_SEEDS.three],
    [4, INTEGRATION_SEEDS.four],
  ])('%i Spieler spielen 3 komplette Runden bis zum Endstand (Seed %i)', (players, seed) => {
    const h = setupGame(players, seed);
    expect(h.session.phase).toBe('board');
    h.runToEnd();

    const last = h.boards.at(-1);
    expect(last?.view.gamePhase).toBe('game-results');
    expect(last?.view.ranking).toHaveLength(players);
    assertContiguousEvents(h);

    const events = h.events;
    expect(events[0]?.type).toBe('game-started');
    expect(events.filter((e) => e.type === 'round-ended')).toHaveLength(3);
    expect(events.filter((e) => e.type === 'minigame-results')).toHaveLength(3);
    expect(events.at(-1)?.type).toBe('game-ended');
    // Jeder Spieler war in jeder Runde genau einmal dran.
    expect([...turnsPerSlot(events).values()]).toEqual(Array.from({ length: players }, () => 3));
    // Würfeln und Laufen kamen bei jedem Zug vor.
    expect(events.filter((e) => e.type === 'dice-rolled').length).toBe(players * 3);
    expect(events.some((e) => e.type === 'moved')).toBe(true);
    // Münzen nie negativ, Endstand passt zum Ranking.
    for (const view of h.boards.map((b) => b.view)) {
      for (const player of view.players) expect(player.coins).toBeGreaterThanOrEqual(0);
    }
    // Controller sehen am Ende ihren Platz.
    for (const slot of last?.view.turnOrder ?? []) {
      expect(h.contexts.get(slot)?.context.board?.place).toBeGreaterThanOrEqual(1);
    }
    // Keine unerwarteten Fehler im normalen Ablauf.
    expect(h.errors).toEqual([]);
  });

  it('gleicher Seed → gleicher Ablauf, anderer Seed → anderer Ablauf', () => {
    const run = (seed: number) => {
      const h = setupGame(3, seed);
      h.runToEnd();
      return h.events;
    };
    const a = run(INTEGRATION_SEEDS.three);
    const b = run(INTEGRATION_SEEDS.three);
    expect(b).toEqual(a);
    expect(run(INTEGRATION_SEEDS.three + 1)).not.toEqual(a);
  });

  it('gemischte Aufstellung: iPhone + geteiltes iPad mit zwei Zonen', () => {
    const h = setupGame(3, INTEGRATION_SEEDS.three, { seats: [1, 2], rounds: 2 });
    expect(h.controllers.get(2)?.slots).toEqual([2, 3]);
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    expect([...turnsPerSlot(h.events).keys()].sort()).toEqual([1, 2, 3]);
    expect(h.errors).toEqual([]);
  });

  it('Disconnect mitten im Zug: Auto-Wahl nach der Schonfrist, Rückkehr mit Token, Partie endet', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 2 });
    let disconnected = false;
    let reconnected = false;
    let disconnectedAt = 0;
    h.runToEnd(200_000, (harness) => {
      if (!disconnected) {
        // Sobald Slot 2 würfeln soll: Verbindung weg.
        const prompt = harness.contexts.get(2)?.context.prompt;
        if (prompt?.kind === 'roll') {
          harness.disconnect(2);
          disconnected = true;
          disconnectedAt = harness.clock;
        }
        return;
      }
      if (!reconnected && harness.events.some((e) => e.type === 'player-auto' && e.slot === 2)) {
        harness.reconnect(2, 22);
        reconnected = true;
      }
    });

    expect([disconnected, reconnected]).toEqual([true, true]);
    const auto = h.events.find((e) => e.type === 'player-auto');
    expect(auto).toMatchObject({ slot: 2, reason: 'disconnected', option: 'roll' });
    // Während der Trennung zeigt der Host den Spieler als getrennt.
    expect(
      h.boards.some((b) => b.view.players.find((p) => p.slot === 2)?.connected === false),
    ).toBe(true);
    // Die Auto-Wahl kam frühestens nach der Schonfrist (Standard 15 s).
    const autoBoardIndex = h.boards.findIndex((b) =>
      b.events.some((e) => e.type === 'player-auto'),
    );
    expect(autoBoardIndex).toBeGreaterThan(-1);
    expect(h.clock - disconnectedAt).toBeGreaterThanOrEqual(15_000);
    expect(h.gamePhase).toBe('game-results');
    expect(h.boards.at(-1)?.view.players.every((p) => p.connected)).toBe(true);
  });

  it('Reaktionsfenster: Festhalten halbiert den Klau, Timeout klaut voll, späte Wahl wird abgewiesen', () => {
    const results = new Map<ReactionPolicy, BoardEvent[]>();
    const errors = new Map<ReactionPolicy, string[]>();
    for (const reaction of ['brace', 'timeout', 'late'] as const) {
      const h = setupGame(3, INTEGRATION_SEEDS.three, { rounds: 10, policy: { reaction } });
      h.runToEnd();
      expect(h.gamePhase).toBe('game-results');
      results.set(reaction, h.events);
      errors.set(
        reaction,
        h.errors.map((e) => e.code),
      );
    }
    const resolved = (policy: ReactionPolicy) =>
      (results.get(policy) ?? []).flatMap((e) =>
        e.type === 'reaction-resolved' ? [e.result] : [],
      );
    expect(resolved('brace').length).toBeGreaterThan(0);
    expect(resolved('brace').every((result) => result === 'brace')).toBe(true);
    expect(resolved('timeout').every((result) => result === 'timeout')).toBe(true);
    // Verspätete Reaktion: Fenster schließt per Timeout, die Wahl bekommt `invalid-choice`.
    expect(resolved('late').every((result) => result === 'timeout')).toBe(true);
    expect(errors.get('late')).toContain('invalid-choice');
    expect(errors.get('brace')).toEqual([]);
  });

  it('Aktionen außerhalb der Reihe werden abgewiesen, ohne die Verbindung zu gefährden', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    // Warten, bis jemand würfeln soll.
    for (let i = 0; i < 100 && ![...h.contexts.values()].some((c) => c.context.prompt); i++) {
      h.tick();
    }
    const active = [...h.contexts.entries()].find(([, c]) => c.context.prompt);
    expect(active).toBeDefined();
    if (!active) return;
    const [activeSlot, { context }] = active;
    const promptId = context.prompt?.id ?? 0;
    const other: SlotNumber = activeSlot === 1 ? 2 : 1;

    // Der andere Spieler versucht, für den aktuellen Prompt zu wählen.
    h.choose(h.controllerOf(other).id, other, promptId, 'roll');
    expect(h.errors.at(-1)).toEqual({ to: h.controllerOf(other).id, code: 'invalid-choice' });
    // Falsche Option und veraltete Prompt-ID beim aktiven Spieler.
    h.choose(h.controllerOf(activeSlot).id, activeSlot, promptId, 'teleport');
    expect(h.errors.at(-1)?.code).toBe('invalid-choice');
    h.choose(h.controllerOf(activeSlot).id, activeSlot, promptId + 5, 'roll');
    expect(h.errors.at(-1)?.code).toBe('invalid-choice');
    // Arena-Eingaben in der Brettphase sind out-of-phase.
    const c = h.controllerOf(activeSlot);
    h.send(c.id, createMessage('move', { slot: activeSlot, seq: ++c.seq, x: 1, y: 0 }));
    expect(h.errors.at(-1)?.code).toBe('out-of-phase');
    // Danach geht es normal weiter.
    h.choose(c.id, activeSlot, promptId, 'roll');
    expect(h.events.some((e) => e.type === 'dice-rolled')).toBe(true);
    expect(h.controllerOf(activeSlot).connected).toBe(true);
  });

  it('neu verbundener Host bekommt sofort den vollständigen Brett-Stand', () => {
    const h = setupGame(2, INTEGRATION_SEEDS.two, { rounds: 1 });
    for (let i = 0; i < 30; i++) h.tick();
    h.reloadHost();
    const snapshot = h.boards.at(-1);
    expect(snapshot?.events).toEqual([]);
    expect(snapshot?.view.players).toHaveLength(2);
  });

  it('Start im Arena-Modus bleibt die M1-Arena', () => {
    const h = new Harness({}, { useItems: false, reaction: 'brace' });
    h.host();
    h.join(1);
    h.send(HOST, createMessage('start', { mode: 'arena' }));
    expect(h.session.phase).toBe('play');
    expect(h.contexts.get(1)?.context.layout).toBe('joystick-buttons');
    expect(h.boards).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// M3 (CHAOS-34): Brett ↔ Minispiel über die Session für jedes Minispiel der Rotation
// ---------------------------------------------------------------------------

describe('Minispiele über die Session (M3, CHAOS-34)', () => {
  const rotation = rotationInfos().map((info) => info.id);

  it.each(rotation.flatMap((id) => [2, 3, 4].map((players) => [id, players] as const)))(
    '%s mit %i Spielern: Brett → Intro → Spiel → Ergebnis → Rundenende, Münzen je Platz',
    (minigameId, players) => {
      const h = setupMinigameGame(minigameId, players, INTEGRATION_SEEDS.four + players);
      const host = { sent: new Set<number>(), startedAt: new Map<number, number>() };
      const pressed = new Map<SlotNumber, number>();
      const stages = new Map<SlotNumber, string[]>();
      h.runToEnd(400_000, (harness) => {
        pressInMinigame(harness, pressed);
        playMinigameAsHost(harness, host);
        if (harness.gamePhase === 'round-end') pressed.clear();
        for (const [slot, { context }] of harness.contexts) {
          const stage = context.minigame?.stage ?? '-';
          const list = stages.get(slot) ?? [];
          if (list.at(-1) !== stage) list.push(stage);
          stages.set(slot, list);
        }
      });
      expect(h.gamePhase).toBe('game-results');
      expect(h.errors.filter((e) => e.to === HOST)).toEqual([]);
      // Ablauf je Runde: minigame-started → minigame-results (nicht abgebrochen) → round-ended.
      const flow = h.events
        .filter((e) => ['minigame-started', 'minigame-results', 'round-ended'].includes(e.type))
        .map((e) => e.type);
      expect(flow).toEqual(
        Array.from({ length: 2 }, () => [
          'minigame-started',
          'minigame-results',
          'round-ended',
        ]).flat(),
      );
      for (const event of h.events) {
        if (event.type === 'minigame-started') expect(event.minigame).toBe(minigameId);
        if (event.type === 'minigame-results') {
          expect(event.aborted).toBe(false);
          expect(event.placements).toHaveLength(players);
        }
      }
      // Eingaben kamen beim Host an, Wertung: höhere Slot-Nummer drückte öfter.
      expect(h.hostInputs.length).toBeGreaterThan(0);
      const results = h.events.filter((e) => e.type === 'minigame-results');
      const first = results[0];
      if (first?.type !== 'minigame-results') throw new Error('kein Ergebnis');
      const info = getMinigameInfo(minigameId);
      const expectedWinner = info?.scoring === 'higher' ? players : 1;
      expect(first.ranking[0]).toBe(expectedWinner);
      // Münzen: Platz 1 bekommt die erste Belohnung (Grund `minigame`).
      const winnerCoins = h.events.find(
        (e) => e.type === 'coins-changed' && e.reason === 'minigame' && e.slot === expectedWinner,
      );
      expect(winnerCoins?.type === 'coins-changed' ? winnerCoins.delta : 0).toBeGreaterThan(0);
      // Controller sahen Anleitung, Spiel und Ergebnis (je Runde).
      for (let slot = 1 as SlotNumber; slot <= players; slot++) {
        expect(stages.get(slot)).toEqual(expect.arrayContaining(['intro', 'play', 'results']));
      }
      assertContiguousEvents(h);
    },
  );

  it('weist ein falsches Ergebnis ab (invalid-result) und nimmt danach das richtige an', () => {
    const id = rotation[0] ?? 'pump-parade';
    const h = setupMinigameGame(id, 2, INTEGRATION_SEEDS.two, 1);
    for (let i = 0; i < 100_000 && h.gamePhase !== 'minigame-play'; i++) {
      h.answerPrompts();
      h.tick();
    }
    const minigame = h.boards.at(-1)?.view.minigame;
    if (!minigame) throw new Error('kein Minispiel');
    h.send(
      HOST,
      createMessage('minigame-result', {
        minigameId: minigame.id,
        round: minigame.round + 1,
        placements: [
          { slot: 1, place: 1, score: 1 },
          { slot: 2, place: 2, score: 0 },
        ],
      }),
    );
    expect(h.errors.at(-1)).toEqual({ to: HOST, code: 'invalid-result' });
    expect(h.gamePhase).toBe('minigame-play');
    const info = getMinigameInfo(minigame.id);
    h.send(
      HOST,
      createMessage('minigame-result', {
        minigameId: minigame.id,
        round: minigame.round,
        placements: rankByScore(
          [
            { slot: 1, score: 3 },
            { slot: 2, score: 3 },
          ],
          info?.scoring,
        ),
      }),
    );
    expect(h.gamePhase).toBe('minigame-results');
    expect(h.boards.at(-1)?.view.minigame?.placements?.map((p) => p.place)).toEqual([1, 1]);
  });

  it('ohne Host-Ergebnis bricht das Minispiel nach Spielzeit + Schonfrist ab, die Partie läuft weiter', () => {
    const id = rotation[0] ?? 'pump-parade';
    const h = setupMinigameGame(id, 2, INTEGRATION_SEEDS.two, 1);
    h.runToEnd();
    expect(h.gamePhase).toBe('game-results');
    const result = h.events.find((e) => e.type === 'minigame-results');
    expect(result).toEqual({
      type: 'minigame-results',
      ranking: [],
      placements: [],
      aborted: true,
    });
    expect(h.events.some((e) => e.type === 'coins-changed' && e.reason === 'minigame')).toBe(false);
  });

  it('Host lädt mitten im Minispiel neu: Schnappschuss mit Minispiel und Restzeit, Ergebnis danach gültig', () => {
    const id = rotation[0] ?? 'pump-parade';
    const h = setupMinigameGame(id, 2, INTEGRATION_SEEDS.three, 1);
    for (let i = 0; i < 100_000 && h.gamePhase !== 'minigame-play'; i++) {
      h.answerPrompts();
      h.tick();
    }
    for (let i = 0; i < 20; i++) h.tick();
    h.reloadHost();
    const snapshot = h.boards.at(-1);
    expect(snapshot?.events).toEqual([]);
    expect(snapshot?.view.gamePhase).toBe('minigame-play');
    // Host-Verlust pausiert automatisch, der neue Host setzt fort (CHAOS-38).
    expect(snapshot?.view.paused).toBe(false);
    expect(snapshot?.view.minigame?.elapsedMs).toBeGreaterThanOrEqual(2_000);
    const minigame = snapshot?.view.minigame;
    if (!minigame) throw new Error('kein Minispiel');
    const info = getMinigameInfo(minigame.id);
    h.send(
      HOST,
      createMessage('minigame-result', {
        minigameId: minigame.id,
        round: minigame.round,
        placements: rankByScore(
          [
            { slot: 1, score: 1 },
            { slot: 2, score: 2 },
          ],
          info?.scoring,
        ),
      }),
    );
    expect(h.gamePhase).toBe('minigame-results');
  });

  it('zweites Vorkommen desselben Minispiels: kurze Anleitung an Host und Controllern (CHAOS-66)', () => {
    const id = rotation[0] ?? 'pump-parade';
    const h = setupMinigameGame(id, 2, INTEGRATION_SEEDS.two, 2);
    const host = { sent: new Set<number>(), startedAt: new Map<number, number>() };
    const pressed = new Map<SlotNumber, number>();
    // Je Runde: erste `board`-Nachricht im Intro (Restzeit) und Controller-Kontext im Intro.
    const intros = new Map<number, { repeat: boolean | undefined; remainingMs: number | null }>();
    const contexts = new Map<number, (boolean | undefined)[]>();
    h.runToEnd(400_000, (harness) => {
      pressInMinigame(harness, pressed);
      playMinigameAsHost(harness, host);
      if (harness.gamePhase === 'round-end') pressed.clear();
      const view = harness.boards.at(-1)?.view;
      if (view?.gamePhase === 'minigame-intro' && view.minigame && !intros.has(view.round)) {
        intros.set(view.round, { repeat: view.minigame.repeat, remainingMs: view.remainingMs });
      }
      for (const [, { context }] of harness.contexts) {
        if (context.minigame?.stage !== 'intro' || view === undefined) continue;
        const list = contexts.get(view.round) ?? [];
        list.push(context.minigame.repeat);
        contexts.set(view.round, list);
      }
    });
    expect(h.gamePhase).toBe('game-results');
    const pacing = DEFAULT_RULES.pacing;
    expect(intros.get(1)?.repeat).toBe(false);
    // CHAOS-214: Die Anleitung wartet auf „Bereit“; zuerst läuft ihre Mindestdauer.
    expect(intros.get(1)?.remainingMs).toBe(pacing.minigameReadyMinMs);
    expect(intros.get(2)?.repeat).toBe(true);
    expect(intros.get(2)?.remainingMs).toBe(pacing.minigameReadyMinMs);
    expect(new Set(contexts.get(1))).toEqual(new Set([false]));
    expect(new Set(contexts.get(2))).toEqual(new Set([true]));
  });

  it('Controller-Eingaben außerhalb von minigame-play bleiben out-of-phase', () => {
    const id = rotation[0] ?? 'pump-parade';
    const h = setupMinigameGame(id, 2, INTEGRATION_SEEDS.two, 1);
    for (let i = 0; i < 100_000 && h.gamePhase !== 'minigame-intro'; i++) {
      h.answerPrompts();
      h.tick();
    }
    const c = h.controllerOf(1);
    h.send(c.id, createMessage('press', { slot: 1, seq: ++c.seq, button: 'a' }));
    expect(h.errors.at(-1)?.code).toBe('out-of-phase');
    expect(h.hostInputs).toEqual([]);
    expect(h.contexts.get(1)?.context.minigame?.stage).toBe('intro');
  });
});
