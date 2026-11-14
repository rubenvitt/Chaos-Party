import { describe, expect, it } from 'vitest';
import { TokenBucket } from './rate-limit.ts';

describe('TokenBucket', () => {
  it('lässt den Puffer sofort zu und füllt mit der Rate nach', () => {
    const bucket = new TokenBucket(10, 2, 0);
    let passed = 0;
    for (let i = 0; i < 30; i++) if (bucket.take(0)) passed++;
    expect(passed).toBe(20);
    expect(bucket.take(50)).toBe(false);
    expect(bucket.take(100)).toBe(true);
    expect(bucket.take(100)).toBe(false);
  });

  it('füllt nie über die Kapazität und ignoriert rückwärtslaufende Zeit', () => {
    const bucket = new TokenBucket(10, 1, 0);
    expect(bucket.available).toBe(10);
    bucket.take(60_000);
    expect(bucket.available).toBe(9);
    bucket.take(0);
    expect(bucket.available).toBe(8);
  });

  it('schreibt beim Vergrößern den Zuwachs gut und kappt beim Verkleinern', () => {
    const bucket = new TokenBucket(10, 1, 0);
    for (let i = 0; i < 10; i++) bucket.take(0);
    bucket.setRate(20, 1, 0);
    expect(bucket.available).toBe(10);
    bucket.setRate(5, 1, 0);
    expect(bucket.available).toBe(5);
  });
});
