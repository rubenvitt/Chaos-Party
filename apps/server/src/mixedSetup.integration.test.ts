/**
 * CHAOS-38: gemischte Aufstellung über die Session – zwei „iPhones“ (je eine Verbindung, ein
 * Slot) und ein geteiltes „iPad“ mit zwei Zonen (eine Verbindung, zwei Slots, ein Token;
 * ADR-005/008/009) spielen eine komplette Partie mit echten Minispielen aus der Rotation.
 *
 * Geprüft: Figurenwahl je Zone (auch Konflikt zwischen den Zonen desselben iPads), Bereit je
 * Zone, gleichzeitige Minispiel-Eingaben aller vier Slots im selben Server-Takt mit richtiger
 * Slot-Zuordnung, Spoofing eines fremden Slots vom iPad, Reconnect des iPads mit beiden Zonen
 * mitten im Minispiel. Künstliche Uhr, fester Seed.
 */
import { createMessage, type SlotNumber } from '@chaos-party/protocol';
import { rotationInfos } from '@chaos-party/minigames/catalog';
import { describe, expect, it } from 'vitest';
import {
  assertContiguousEvents,
  Harness,
  INTEGRATION_SEEDS,
  playMinigameAsHost,
  pressInMinigame,
} from './testHarness.ts';

const IPHONE_1 = 1;
const IPHONE_2 = 2;
const IPAD = 3;

function minigames() {
  return rotationInfos().map((info) => ({
    id: info.id,
    playMs: info.durationMs,
    scoring: info.scoring,
  }));
}

/** Je Slot eine Eingabe passend zum angebotenen Kontext; alle im selben Takt. */
function burst(h: Harness, order: SlotNumber[]): void {
  for (const slot of order) {
    const context = h.contexts.get(slot)?.context;
    const controller = h.controllerOf(slot);
    if (!context) throw new Error(`kein Kontext für ${String(slot)}`);
    if (context.actions.includes('button-a')) {
      h.send(controller.id, createMessage('press', { slot, seq: ++controller.seq, button: 'a' }));
    } else {
      h.send(
        controller.id,
        createMessage('move', { slot, seq: ++controller.seq, x: 0.5, y: -0.5 }),
      );
    }
  }
}

describe('Gemischte Aufstellung: 2 iPhones + iPad mit 2 Zonen (CHAOS-38)', () => {
  it('komplette Partie mit Figurenwahl je Zone, gleichzeitigen Eingaben und iPad-Reconnect', () => {
    const h = new Harness(
      { game: { seed: INTEGRATION_SEEDS.four, rounds: 2, minigames: minigames() } },
      { useItems: true, reaction: 'brace' },
      INTEGRATION_SEEDS.four,
    );
    h.host();
    h.join(IPHONE_1);
    h.join(IPHONE_2);
    h.join(IPAD, 2);
    expect(h.controller(IPAD).slots).toEqual([3, 4]);
    expect(h.lobby?.players.map((p) => [p.slot, p.connected])).toEqual([
      [1, true],
      [2, true],
      [3, true],
      [4, true],
    ]);
    // Jede Zone hat ihren eigenen Lobby-Kontext.
    expect(h.contexts.get(3)?.context.lobby).toMatchObject({ character: null });
    expect(h.contexts.get(4)?.context.lobby).toMatchObject({ character: null });

    // Figurenwahl je Zone; Zone 4 will die Figur der Nachbarzone → character-taken.
    h.pickCharacter(IPAD, 3, 'sock');
    h.pickCharacter(IPAD, 4, 'sock');
    expect(h.errors).toEqual([{ to: IPAD, code: 'character-taken' }]);
    expect(h.contexts.get(4)?.context.lobby).toMatchObject({
      character: null,
      takenCharacters: ['sock'],
    });
    h.errors.length = 0;
    h.pickCharacter(IPAD, 4, 'robot');
    h.pickCharacter(IPHONE_1, 1, 'cactus');
    expect(h.contexts.get(2)?.context.lobby?.takenCharacters).toEqual(['robot', 'cactus', 'sock']);

    // Bereit je Zone: erst Zone 3, dann Zone 4 – die Lobby zeigt es je Slot.
    const ipad = h.controller(IPAD);
    h.send(IPAD, createMessage('ready', { slot: 3, seq: ++ipad.seq }));
    expect(h.lobby?.players.find((p) => p.slot === 3)?.ready).toBe(true);
    expect(h.lobby?.players.find((p) => p.slot === 4)?.ready).toBe(false);
    expect(h.contexts.get(3)?.context.layout).toBe('wait');
    expect(h.contexts.get(4)?.context.layout).toBe('lobby');
    h.send(IPAD, createMessage('ready', { slot: 4, seq: ++ipad.seq }));
    h.ready(IPHONE_1);
    h.ready(IPHONE_2);
    expect(h.lobby?.players.every((p) => p.ready)).toBe(true);
    h.start();
    expect(h.boards.at(-1)?.view.players.map((p) => [p.slot, p.character])).toEqual([
      [1, 'cactus'],
      [2, 'raccoon'],
      [3, 'sock'],
      [4, 'robot'],
    ]);

    const sent = new Set<number>();
    const startedAt = new Map<number, number>();
    const pressed = new Map<SlotNumber, number>();
    let bursts = 0;
    let ipadReconnected = false;
    let spoofChecked = false;
    h.runToEnd(400_000, (x) => {
      const view = x.boards.at(-1)?.view;
      if (view?.gamePhase === 'minigame-play' && !view.paused) {
        const playing = [1, 2, 3, 4].every(
          (slot) => x.contexts.get(slot as SlotNumber)?.context.layout === 'joystick-buttons',
        );
        if (playing && !sent.has(view.round) && (startedAt.get(view.round) ?? x.clock) < x.clock) {
          // Gleichzeitig: alle vier Slots im selben Takt, iPad-Zonen zwischen den iPhones.
          if (bursts < view.round) {
            bursts = view.round;
            const before = x.hostInputs.length;
            burst(x, [1, 3, 2, 4]);
            const forwarded = x.hostInputs.slice(before);
            expect(forwarded.map((input) => input.intent.slot)).toEqual([1, 3, 2, 4]);
            expect(new Set(forwarded.map((input) => input.at)).size).toBe(1);
          }
          // Spoofing: das iPad sendet für Slot 1 → not-your-slot, nichts geht an den Host.
          if (!spoofChecked) {
            spoofChecked = true;
            const before = x.hostInputs.length;
            const pad = x.controllerOf(3);
            x.send(pad.id, createMessage('press', { slot: 1, seq: ++pad.seq, button: 'a' }));
            expect(x.errors.at(-1)).toEqual({ to: pad.id, code: 'not-your-slot' });
            expect(x.hostInputs.length).toBe(before);
            x.errors.length = 0;
          }
          // Runde 2: iPad verliert mitten im Minispiel die Verbindung, kommt mit beiden Zonen zurück.
          if (view.round === 2 && !ipadReconnected) {
            ipadReconnected = true;
            const pad = x.controllerOf(3);
            x.disconnect(pad.id);
            const lost = x.boards.at(-1)?.view.players.filter((p) => !p.connected);
            expect(lost?.map((p) => p.slot)).toEqual([3, 4]);
            x.reconnect(pad.id, 33);
            expect(x.controller(33).slots).toEqual([3, 4]);
            for (const slot of [3, 4] as SlotNumber[]) {
              expect(x.contexts.get(slot)?.context).toMatchObject({
                layout: 'joystick-buttons',
                minigame: { stage: 'play' },
              });
            }
            const before = x.hostInputs.length;
            burst(x, [4, 3]);
            expect(x.hostInputs.slice(before).map((input) => input.intent.slot)).toEqual([4, 3]);
          }
        }
      }
      pressInMinigame(x, pressed);
      playMinigameAsHost(x, { sent, startedAt });
      if (x.gamePhase === 'round-end') pressed.clear();
    });

    expect([bursts, ipadReconnected, spoofChecked]).toEqual([2, true, true]);
    const last = h.boards.at(-1)?.view;
    expect(last?.gamePhase).toBe('game-results');
    expect(last?.ranking).toHaveLength(4);
    expect(last?.players.every((p) => p.connected)).toBe(true);
    assertContiguousEvents(h);
    const results = h.events.flatMap((e) => (e.type === 'minigame-results' ? [e] : []));
    expect(results).toHaveLength(2);
    expect(results.every((e) => !e.aborted)).toBe(true);
    expect(h.acks.every((ack) => ack.accepted)).toBe(true);
    // Jede Zone sieht ihren eigenen Endplatz.
    for (const entry of last?.ranking ?? []) {
      expect(h.contexts.get(entry.slot)?.context.board?.place).toBe(entry.place);
    }
    expect(h.errors).toEqual([]);
  });

  it('60-Hz-Joystick in beiden iPad-Zonen und auf zwei iPhones gleichzeitig: keine Drosselung', () => {
    const h = new Harness(
      { game: { seed: INTEGRATION_SEEDS.four, rounds: 1, minigames: minigames() } },
      { useItems: false, reaction: 'brace' },
    );
    h.host();
    h.join(IPHONE_1);
    h.join(IPHONE_2);
    h.join(IPAD, 2);
    for (const id of h.controllers.keys()) h.ready(id);
    h.start();
    h.runUntil((x) => x.gamePhase === 'minigame-play');
    const usesStick = h.contexts.get(1)?.context.actions.includes('move') ?? false;
    const before = h.hostInputs.length;
    // 10 s lang 60 Nachrichten/s je Slot (in 100-ms-Takten je 6 pro Slot).
    let sentCount = 0;
    for (let tick = 0; tick < 100; tick++) {
      for (let n = 0; n < 6; n++) {
        for (const slot of [1, 2, 3, 4] as SlotNumber[]) {
          const controller = h.controllerOf(slot);
          h.send(
            controller.id,
            usesStick
              ? createMessage('move', { slot, seq: ++controller.seq, x: n / 6, y: 0 })
              : createMessage('press', { slot, seq: ++controller.seq, button: 'a' }),
          );
          sentCount++;
        }
      }
      h.tick();
      if (h.gamePhase !== 'minigame-play') break;
    }
    expect(sentCount).toBe(100 * 6 * 4);
    expect(h.errors.filter((e) => e.code === 'rate-limited')).toEqual([]);
    expect(h.hostInputs.length - before).toBe(sentCount);
    expect([...h.controllers.values()].every((c) => c.connected)).toBe(true);
  });
});
