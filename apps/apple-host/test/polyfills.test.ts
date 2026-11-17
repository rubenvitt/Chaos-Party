import { describe, expect, it } from 'vitest';
import { createClock, installPolyfills, jsonClone } from '../src/polyfills.ts';

describe('createClock', () => {
  it('startet bei 0 und läuft nie zurück', () => {
    const clock = createClock();
    expect(clock.now()).toBe(0);
    clock.advance(50);
    clock.advance(20);
    expect(clock.now()).toBe(50);
  });

  it('feuert Zeitgeber erst, wenn ihre Zeit erreicht ist, mit Argumenten', () => {
    const clock = createClock();
    const calls: unknown[][] = [];
    clock.setTimeout((...args) => calls.push(args), 100, 'a', 1);
    clock.advance(99);
    expect(calls).toEqual([]);
    clock.advance(100);
    expect(calls).toEqual([['a', 1]]);
    clock.advance(500);
    expect(calls).toHaveLength(1);
  });

  it('feuert in Fälligkeitsreihenfolge, bei Gleichstand in Stellreihenfolge', () => {
    const clock = createClock();
    const order: string[] = [];
    clock.setTimeout(() => order.push('c'), 30);
    clock.setTimeout(() => order.push('a1'), 10);
    clock.setTimeout(() => order.push('a2'), 10);
    clock.setTimeout(() => order.push('b'), 20);
    clock.advance(30);
    expect(order).toEqual(['a1', 'a2', 'b', 'c']);
  });

  it('führt im selben Schritt auch Zeitgeber aus, die ein Zeitgeber neu stellt und die fällig sind', () => {
    const clock = createClock();
    const order: string[] = [];
    clock.setTimeout(() => {
      order.push('erst');
      clock.setTimeout(() => order.push('sofort'), 0);
      clock.setTimeout(() => order.push('später'), 1000);
    }, 10);
    clock.advance(20);
    expect(order).toEqual(['erst', 'sofort']);
    expect(clock.pending()).toBe(1);
  });

  it('löscht Zeitgeber; unbekannte IDs und undefined sind harmlos', () => {
    const clock = createClock();
    let fired = false;
    const id = clock.setTimeout(() => (fired = true), 5);
    clock.clearTimeout(id);
    clock.clearTimeout(undefined);
    clock.clearTimeout(9999);
    clock.advance(10);
    expect(fired).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it('behandelt negative und ungültige Verzögerungen wie 0', () => {
    const clock = createClock();
    const order: string[] = [];
    clock.setTimeout(() => order.push('negativ'), -5);
    clock.setTimeout(() => order.push('nan'), Number.NaN);
    clock.advance(0);
    expect(order).toEqual(['negativ', 'nan']);
  });
});

describe('installPolyfills', () => {
  it('setzt fehlende Globals wie in einem nackten JSContext', () => {
    const target: Record<string, unknown> = {};
    const clock = createClock();
    installPolyfills(target, clock);
    expect(target.setTimeout).toBe(clock.setTimeout);
    expect(target.clearTimeout).toBe(clock.clearTimeout);
    expect(target.global).toBe(target);
    clock.advance(42);
    expect((target.performance as { now(): number }).now()).toBe(42);
    const clone = target.structuredClone as (v: unknown) => unknown;
    const value = { a: [1, { b: 'x' }] };
    expect(clone(value)).toEqual(value);
    expect(clone(value)).not.toBe(value);
    // Kein DOM: Babylon würde sonst Browser-Pfade nehmen.
    expect('window' in target || 'self' in target || 'document' in target).toBe(false);
  });

  it('ersetzt Zeitgeber immer, lässt vorhandenes performance/structuredClone/global stehen', () => {
    const performance = { now: () => 7 };
    const structuredClone = () => 'eigen';
    const global = {};
    const target: Record<string, unknown> = {
      setTimeout: () => 0,
      performance,
      structuredClone,
      global,
    };
    const clock = createClock();
    installPolyfills(target, clock);
    expect(target.setTimeout).toBe(clock.setTimeout);
    expect(target.performance).toBe(performance);
    expect(target.structuredClone).toBe(structuredClone);
    expect(target.global).toBe(global);
  });
});

describe('jsonClone', () => {
  it('kopiert reine Daten tief und lässt undefined durch', () => {
    expect(jsonClone<unknown>(undefined)).toBeUndefined();
    expect(jsonClone(null)).toBeNull();
    const value = { list: [1, 2], nested: { ok: true } };
    const copy = jsonClone(value);
    copy.list.push(3);
    expect(value.list).toEqual([1, 2]);
  });
});
