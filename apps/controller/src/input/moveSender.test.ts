import { describe, expect, it } from 'vitest';
import type { Stick } from './joystick.ts';
import { createMoveSender, MOVE_INTERVAL_MS, planMoveSend, type Timers } from './moveSender.ts';

describe('planMoveSend', () => {
  const fresh = { lastSent: null, lastSentAt: null };

  it('sendet den ersten Wert sofort', () => {
    expect(planMoveSend(fresh, 0, { x: 0.5, y: 0 })).toEqual({ kind: 'send' });
  });

  it('überspringt unveränderte Werte', () => {
    const state = { lastSent: { x: 0.5, y: 0 }, lastSentAt: 0 };
    expect(planMoveSend(state, 100, { x: 0.5, y: 0 })).toEqual({ kind: 'skip' });
  });

  it('verzögert Änderungen innerhalb des Intervalls', () => {
    const state = { lastSent: { x: 0.5, y: 0 }, lastSentAt: 100 };
    expect(planMoveSend(state, 110, { x: 0.6, y: 0 })).toEqual({
      kind: 'defer',
      waitMs: MOVE_INTERVAL_MS - 10,
    });
    expect(planMoveSend(state, 100 + MOVE_INTERVAL_MS, { x: 0.6, y: 0 })).toEqual({
      kind: 'send',
    });
  });

  it('sendet Loslassen sofort, auch innerhalb des Intervalls', () => {
    const state = { lastSent: { x: 0.5, y: 0 }, lastSentAt: 100 };
    expect(planMoveSend(state, 101, { x: 0, y: 0 })).toEqual({ kind: 'send' });
  });
});

function fakeTimers() {
  let now = 0;
  let nextId = 1;
  const queue = new Map<number, { at: number; callback: () => void }>();
  const timers: Timers = {
    now: () => now,
    setTimeout(callback, ms) {
      const id = nextId++;
      queue.set(id, { at: now + ms, callback });
      return id;
    },
    clearTimeout(handle) {
      queue.delete(handle as number);
    },
  };
  function advance(ms: number) {
    const target = now + ms;
    for (;;) {
      const due = [...queue.entries()]
        .filter(([, t]) => t.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      queue.delete(due[0]);
      now = due[1].at;
      due[1].callback();
    }
    now = target;
  }
  return { timers, advance, pending: () => queue.size };
}

describe('createMoveSender', () => {
  it('drosselt auf ≈ 30 Hz und liefert den letzten Wert nach', () => {
    const { timers, advance } = fakeTimers();
    const sent: Stick[] = [];
    const sender = createMoveSender((stick) => sent.push(stick), { timers });

    // 1 s lang alle 4 ms ein neuer Wert (250 Ereignisse wie bei 240-Hz-Touch).
    for (let i = 1; i <= 250; i++) {
      sender.update({ x: Math.min(1, i / 250), y: 0 });
      advance(4);
    }
    advance(100);
    expect(sent.length).toBeGreaterThan(20);
    expect(sent.length).toBeLessThanOrEqual(32);
    expect(sent.at(-1)).toEqual({ x: 1, y: 0 });
  });

  it('sendet Loslassen sofort und verwirft den vorgemerkten Zwischenwert', () => {
    const { timers, advance, pending } = fakeTimers();
    const sent: Stick[] = [];
    const sender = createMoveSender((stick) => sent.push(stick), { timers });

    sender.update({ x: 0.2, y: 0 });
    advance(5);
    sender.update({ x: 0.4, y: 0 }); // vorgemerkt
    expect(pending()).toBe(1);
    sender.update({ x: 0, y: 0 });
    expect(sent).toEqual([
      { x: 0.2, y: 0 },
      { x: 0, y: 0 },
    ]);
    expect(pending()).toBe(0);
    advance(100);
    expect(sent).toHaveLength(2);
  });

  it('sendet nichts, wenn der Wert zum zuletzt gesendeten zurückkehrt', () => {
    const { timers, advance } = fakeTimers();
    const sent: Stick[] = [];
    const sender = createMoveSender((stick) => sent.push(stick), { timers });
    sender.update({ x: 0.2, y: 0 });
    advance(5);
    sender.update({ x: 0.3, y: 0 });
    sender.update({ x: 0.2, y: 0 });
    advance(100);
    expect(sent).toEqual([{ x: 0.2, y: 0 }]);
  });

  it('reset vergisst Zustand und Timer', () => {
    const { timers, advance, pending } = fakeTimers();
    const sent: Stick[] = [];
    const sender = createMoveSender((stick) => sent.push(stick), { timers });
    sender.update({ x: 0.2, y: 0 });
    sender.update({ x: 0.3, y: 0 });
    sender.reset();
    expect(pending()).toBe(0);
    advance(100);
    sender.update({ x: 0.2, y: 0 });
    expect(sent).toEqual([
      { x: 0.2, y: 0 },
      { x: 0.2, y: 0 },
    ]);
  });
});
