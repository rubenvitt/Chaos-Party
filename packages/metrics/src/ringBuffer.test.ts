import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ringBuffer.ts';

describe('RingBuffer', () => {
  it('ist anfangs leer', () => {
    const buffer = new RingBuffer(3);
    expect(buffer.size).toBe(0);
    expect(buffer.last).toBeNull();
    expect(buffer.values()).toEqual([]);
  });

  it('liefert Werte vom ältesten zum neuesten, solange er nicht voll ist', () => {
    const buffer = new RingBuffer(3);
    buffer.push(1);
    buffer.push(2);
    expect(buffer.size).toBe(2);
    expect(buffer.values()).toEqual([1, 2]);
    expect(buffer.last).toBe(2);
  });

  it('verdrängt beim Überlauf die ältesten Werte (Umlauf)', () => {
    const buffer = new RingBuffer(3);
    for (const v of [1, 2, 3, 4, 5]) buffer.push(v);
    expect(buffer.size).toBe(3);
    expect(buffer.values()).toEqual([3, 4, 5]);
    expect(buffer.last).toBe(5);
    // Mehrfacher Umlauf.
    for (const v of [6, 7, 8, 9]) buffer.push(v);
    expect(buffer.values()).toEqual([7, 8, 9]);
  });

  it('funktioniert mit Kapazität 1', () => {
    const buffer = new RingBuffer(1);
    buffer.push(4);
    buffer.push(7);
    expect(buffer.values()).toEqual([7]);
    expect(buffer.last).toBe(7);
  });

  it('gibt eine Kopie heraus', () => {
    const buffer = new RingBuffer(2);
    buffer.push(1);
    buffer.values().push(99);
    expect(buffer.values()).toEqual([1]);
  });

  it('leert sich mit clear()', () => {
    const buffer = new RingBuffer(2);
    buffer.push(1);
    buffer.push(2);
    buffer.push(3);
    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.last).toBeNull();
    buffer.push(9);
    expect(buffer.values()).toEqual([9]);
  });

  it('lehnt ungültige Kapazitäten ab', () => {
    expect(() => new RingBuffer(0)).toThrow(RangeError);
    expect(() => new RingBuffer(2.5)).toThrow(RangeError);
  });
});
