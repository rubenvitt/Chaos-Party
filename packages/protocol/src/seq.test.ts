import { describe, expect, it } from 'vitest';
import { acceptSeq, createSeqGuard } from './seq.ts';

describe('acceptSeq', () => {
  it.each([
    [undefined, 0, true],
    [undefined, 5, true],
    [0, 1, true],
    [3, 10, true],
    [3, 3, false],
    [3, 2, false],
    [3, 0, false],
    [undefined, -1, false],
    [undefined, 1.5, false],
    [undefined, Number.NaN, false],
    [undefined, Number.POSITIVE_INFINITY, false],
    [1, Number.MAX_SAFE_INTEGER + 1, false],
  ])('last=%s, seq=%s → %s', (last, seq, expected) => {
    expect(acceptSeq(last, seq)).toBe(expected);
  });
});

describe('createSeqGuard', () => {
  it('verwirft doppelte, vertauschte und alte Nummern, erlaubt Lücken', () => {
    const guard = createSeqGuard();
    expect(guard.last).toBeUndefined();
    const arrivals = [1, 2, 2, 4, 3, 1, 7, 7, 8];
    const accepted = arrivals.filter((seq) => guard.accept(seq));
    expect(accepted).toEqual([1, 2, 4, 7, 8]);
    expect(guard.last).toBe(8);
  });

  it('ungültige Nummern ändern den Zustand nicht', () => {
    const guard = createSeqGuard();
    guard.accept(5);
    expect(guard.accept(Number.NaN)).toBe(false);
    expect(guard.accept(-1)).toBe(false);
    expect(guard.last).toBe(5);
    expect(guard.accept(6)).toBe(true);
  });

  it('jede Verbindung hat ihren eigenen Wächter', () => {
    const a = createSeqGuard();
    const b = createSeqGuard();
    expect(a.accept(10)).toBe(true);
    expect(b.accept(1)).toBe(true);
    expect(a.accept(2)).toBe(false);
  });
});
