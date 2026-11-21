import { RUMMELPLATZ, WACKELWALD } from '@chaos-party/game-core';
import { describe, expect, it } from 'vitest';
import { CAROUSEL_TURN_MS, carouselYaw, createRideMotion, WHEEL_SPEED } from './rides.ts';

const rotation = RUMMELPLATZ.rotations?.[0];
const TAU = Math.PI * 2;
const norm = (a: number) => ((a % TAU) + TAU) % TAU;

describe('Fahrgeschäfte (CHAOS-199)', () => {
  it('Karussell zeigt je Runde auf den Ausgang: West, Süd, Ost', () => {
    if (!rotation) throw new Error('Rummelplatz ohne Karussell');
    // Ausgang West liegt links (−x), Süd vorn (−z), Ost rechts (+x) vom Karussell.
    expect(Math.sin(carouselYaw(RUMMELPLATZ, rotation, 1))).toBeLessThan(-0.8);
    expect(Math.cos(carouselYaw(RUMMELPLATZ, rotation, 2))).toBeLessThan(-0.8);
    expect(Math.sin(carouselYaw(RUMMELPLATZ, rotation, 3))).toBeGreaterThan(0.8);
  });

  it('springt beim ersten Stand und fährt beim Rundenwechsel vorwärts mit einer Extrarunde', () => {
    if (!rotation) throw new Error('Rummelplatz ohne Karussell');
    const motion = createRideMotion(RUMMELPLATZ);
    motion.advance(16, 1);
    expect(norm(motion.state.carousel ?? 0)).toBeCloseTo(
      norm(carouselYaw(RUMMELPLATZ, rotation, 1)),
    );
    const start = motion.state.carousel ?? 0;
    motion.advance(16, 2);
    let last = motion.state.carousel ?? 0;
    let peak = last;
    for (let t = 0; t < CAROUSEL_TURN_MS; t += 100) {
      motion.advance(100, 2);
      const now = motion.state.carousel ?? 0;
      if (t < CAROUSEL_TURN_MS - 200) expect(now).toBeGreaterThanOrEqual(last - 1e-9);
      last = now;
      peak = Math.max(peak, now);
    }
    motion.advance(100, 2);
    expect(norm(motion.state.carousel ?? 0)).toBeCloseTo(
      norm(carouselYaw(RUMMELPLATZ, rotation, 2)),
    );
    // Mehr als eine volle Umdrehung, dann auf [0, 2π) zurückgelegt.
    expect(peak - start).toBeGreaterThan(TAU);
  });

  it('settle springt ohne Fahrt; Riesenrad dreht sich gleichmäßig', () => {
    if (!rotation) throw new Error('Rummelplatz ohne Karussell');
    const motion = createRideMotion(RUMMELPLATZ);
    motion.advance(0, 1);
    motion.settle(3);
    motion.advance(10, 3);
    expect(norm(motion.state.carousel ?? 0)).toBeCloseTo(
      norm(carouselYaw(RUMMELPLATZ, rotation, 3)),
    );
    motion.advance(1000, 3);
    expect(motion.state.wheel).toBeCloseTo(1.01 * WHEEL_SPEED);
  });

  it('Brett ohne Karussell: kein Karussellwinkel', () => {
    const motion = createRideMotion(WACKELWALD);
    motion.advance(500, 1);
    expect(motion.state.carousel).toBeNull();
  });
});
