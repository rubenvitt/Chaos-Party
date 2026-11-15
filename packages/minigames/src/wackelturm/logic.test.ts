import { createMinigameRng } from '@chaos-party/minigame-sdk';
import { describe, expect, it } from 'vitest';
import {
  accelFor,
  canBump,
  createWackelturm,
  deliveryPoints,
  findRunner,
  goldSpot,
  inOwnNest,
  nestPosition,
  pressBump,
  pressGrab,
  setStick,
  speedFor,
  steadyPace,
  stepWackelturm,
  WACKELTURM_PARAMS as P,
  wobbleIncrease,
  type Runner,
  type WackelturmEvent,
  type WackelturmState,
} from './logic.ts';

const DT = 1 / 60;
const noRandom = () => 0.5;

function runner(state: WackelturmState, slot: 1 | 2 | 3 | 4): Runner {
  const found = findRunner(state, slot);
  if (!found) throw new Error(`Slot ${String(slot)} fehlt`);
  return found;
}

function steps(state: WackelturmState, count: number): WackelturmEvent[] {
  const events: WackelturmEvent[] = [];
  for (let index = 0; index < count; index++) events.push(...stepWackelturm(state, DT, noRandom));
  return events;
}

/** Zustand ohne Gold, damit Tests nur das prüfen, was sie wollen. */
function quietState(slots: readonly (1 | 2 | 3 | 4)[] = [1, 2], limit = 60): WackelturmState {
  return createWackelturm(slots, limit, { ...P, goldEvery: 0 });
}

function placeAt(r: Runner, x: number, z: number): void {
  r.x = x;
  r.z = z;
  r.vx = 0;
  r.vz = 0;
}

describe('Wackelturm-Regeln: Grundwerte', () => {
  it('Nester liegen in den Ecken, alle gleich weit vom Berg', () => {
    const distances = ([1, 2, 3, 4] as const).map((slot) => {
      const nest = nestPosition(slot);
      expect(Math.abs(nest.x)).toBeCloseTo(P.halfX - P.nestInset);
      expect(Math.abs(nest.z)).toBeCloseTo(P.halfZ - P.nestInset);
      return Math.hypot(nest.x, nest.z);
    });
    expect(new Set(distances.map((d) => d.toFixed(6))).size).toBe(1);
    expect(nestPosition(1).z).toBeGreaterThan(0);
    expect(nestPosition(3).z).toBeLessThan(0);
  });

  it('hoher Turm macht langsam und träge', () => {
    expect(speedFor(0)).toBe(P.baseSpeed);
    expect(speedFor(10)).toBeLessThan(speedFor(5));
    expect(accelFor(10)).toBeLessThan(accelFor(0));
  });

  it('Lieferung: Stückzahl, Gold zählt dreifach, ab 6 Stück doppelt', () => {
    expect(deliveryPoints(['normal', 'normal', 'normal'])).toEqual({ points: 3, bonus: false });
    expect(deliveryPoints(Array.from({ length: 6 }, () => 'normal' as const))).toEqual({
      points: 12,
      bonus: true,
    });
    expect(deliveryPoints(['gold', 'normal', 'normal', 'normal', 'normal'])).toEqual({
      points: 7,
      bonus: false,
    });
    expect(deliveryPoints(['gold', 'normal', 'normal', 'normal', 'normal', 'normal'])).toEqual({
      points: 16,
      bonus: true,
    });
    expect(deliveryPoints([])).toEqual({ points: 0, bonus: false });
  });

  it('Wackeln: nichts bis zur sicheren Höhe, quadratisch in Lenken und Tempo', () => {
    expect(wobbleIncrease(P.safeStack, P.accel, P.baseSpeed, DT)).toBe(0);
    const soft = wobbleIncrease(6, P.accel / 2, 0, 1);
    const hard = wobbleIncrease(6, P.accel, 0, 1);
    expect(hard).toBeCloseTo(soft * 4);
    expect(wobbleIncrease(8, 0, 3, 1)).toBeGreaterThan(wobbleIncrease(4, 0, 3, 1));
    expect(wobbleIncrease(6, 0, 3, 1)).toBeGreaterThan(wobbleIncrease(6, 0, 1.5, 1));
  });

  it('steadyPace: niedrige Türme vertragen Vollgas, hohe nicht', () => {
    expect(steadyPace(P.safeStack)).toBe(Number.POSITIVE_INFINITY);
    expect(steadyPace(4)).toBeGreaterThan(1);
    expect(steadyPace(10)).toBeLessThan(1);
    expect(steadyPace(10)).toBeLessThan(steadyPace(7));
  });
});

describe('Wackelturm-Regeln: Greifen und Abliefern', () => {
  it('A greift nur im Berg, mit wachsender Abklingzeit, höchstens maxStack', () => {
    const state = quietState();
    const me = runner(state, 1);
    expect(pressGrab(state, 1)).toEqual([]);
    placeAt(me, 0, 0);
    expect(pressGrab(state, 1)).toEqual([{ type: 'grab', slot: 1, height: 1 }]);
    expect(pressGrab(state, 1)).toEqual([]);
    expect(me.grabCooldown).toBeCloseTo(P.grabCooldown);
    let previous = me.grabCooldown;
    for (let height = 2; height <= P.maxStack + 2; height++) {
      me.grabCooldown = 0;
      pressGrab(state, 1);
      if (me.stack.length < P.maxStack) {
        expect(me.grabCooldown).toBeGreaterThan(previous);
        previous = me.grabCooldown;
      }
    }
    expect(me.stack).toHaveLength(P.maxStack);
  });

  it('im eigenen Nest wird der Turm abgeliefert, im fremden nicht', () => {
    const state = quietState([1, 2]);
    const me = runner(state, 1);
    me.stack.push('normal', 'normal', 'gold');
    const foreign = nestPosition(2);
    placeAt(me, foreign.x, foreign.z);
    steps(state, 1);
    expect(me.stack).toHaveLength(3);
    const own = nestPosition(1);
    placeAt(me, own.x, own.z);
    const events = steps(state, 1);
    expect(events).toContainEqual({ type: 'deliver', slot: 1, count: 3, points: 5, bonus: false });
    expect(me.score).toBe(5);
    expect(me.stack).toHaveLength(0);
    expect(me.stats.delivered).toBe(3);
  });

  it('Spielende genau beim Zeitlimit; danach passiert nichts mehr', () => {
    const state = quietState([1, 2], 2);
    const events = steps(state, 119);
    expect(state.finished).toBe(false);
    expect(events.some((event) => event.type === 'end')).toBe(false);
    expect(steps(state, 1)).toContainEqual({ type: 'end' });
    expect(state.finished).toBe(true);
    expect(steps(state, 5)).toEqual([]);
    expect(pressGrab(state, 1)).toEqual([]);
  });
});

describe('Wackelturm-Regeln: Wackeln', () => {
  it('scharfe Kehrtwende mit 10 Törtchen kippt den Turm, mit 2 nicht', () => {
    for (const [height, expectTopple] of [
      [10, true],
      [2, false],
    ] as const) {
      const state = quietState([1]);
      const me = runner(state, 1);
      placeAt(me, -3, 0);
      me.stack.push(...Array.from({ length: height }, () => 'normal' as const));
      setStick(state, 1, 1, 0);
      const events = steps(state, 60);
      setStick(state, 1, -1, 0);
      events.push(...steps(state, 60));
      const toppled = events.some((event) => event.type === 'topple' && event.cause === 'wobble');
      expect(toppled).toBe(expectTopple);
      if (expectTopple) {
        expect(me.stats.topples).toBe(1);
        expect(me.stack).toHaveLength(0);
      }
    }
  });

  it('wer unter der Kippgrenze geht, kommt mit 9 Törtchen an; Vollgas kippt', () => {
    const walk = (magnitude: number) => {
      const state = quietState([1]);
      const me = runner(state, 1);
      placeAt(me, -7, 0);
      me.stack.push(...Array.from({ length: 9 }, () => 'normal' as const));
      // Sanft anfahren (Stick in kleinen Stufen), dann geradeaus.
      const events: WackelturmEvent[] = [];
      for (let ramp = 1; ramp <= 20; ramp++) {
        setStick(state, 1, (magnitude * ramp) / 20, 0);
        events.push(...steps(state, 3));
      }
      events.push(...steps(state, 180));
      return events.some((event) => event.type === 'topple');
    };
    expect(walk(steadyPace(9) * 0.85)).toBe(false);
    expect(walk(1)).toBe(true);
  });
});

describe('Wackelturm-Regeln: Rempeln', () => {
  function duel(): { state: WackelturmState; thief: Runner; victim: Runner } {
    const state = quietState([1, 2]);
    const thief = runner(state, 1);
    const victim = runner(state, 2);
    placeAt(thief, -1.5, 2);
    placeAt(victim, 0, 2);
    victim.stack.push('normal', 'gold', 'normal', 'normal');
    thief.fx = 1;
    thief.fz = 0;
    return { state, thief, victim };
  }

  it('B mit leeren Händen: Turm kippt, der Rempler schnappt ihn sich', () => {
    const { state, thief, victim } = duel();
    expect(canBump(thief, state.params)).toBe(true);
    setStick(state, 1, 1, 0);
    expect(pressBump(state, 1)).toEqual([{ type: 'dash', slot: 1 }]);
    const events = steps(state, 10);
    expect(events).toContainEqual({ type: 'bump', slot: 1, target: 2 });
    expect(events).toContainEqual({
      type: 'topple',
      slot: 2,
      count: 4,
      cause: 'bump',
      by: 1,
      stolen: 4,
    });
    expect(thief.stack).toEqual(['normal', 'gold', 'normal', 'normal']);
    expect(victim.stack).toHaveLength(0);
    expect(victim.stun).toBeGreaterThan(0);
    expect(thief.stats.stolen).toBe(4);
    expect(thief.stats.bumpsLanded).toBe(1);
    // Mit Turm kein zweites Rempeln, und erst nach der Abklingzeit wieder.
    expect(canBump(thief, state.params)).toBe(false);
  });

  it('mit Turm auf dem Kopf geht B nicht', () => {
    const { state, thief } = duel();
    thief.stack.push('normal');
    expect(pressBump(state, 1)).toEqual([]);
  });

  it('im eigenen Nest ist man sicher', () => {
    const { state, thief, victim } = duel();
    const nest = nestPosition(2);
    victim.stack.length = 0;
    placeAt(victim, nest.x, nest.z);
    placeAt(thief, nest.x - 1.4, nest.z);
    expect(inOwnNest(victim, state.params)).toBe(true);
    setStick(state, 1, 1, 0);
    pressBump(state, 1);
    const events = steps(state, 10);
    expect(events.some((event) => event.type === 'bump')).toBe(false);
    expect(victim.stun).toBe(0);
  });

  it('daneben gerempelt: Bauchklatscher (selbst kurz benommen)', () => {
    const { state, thief } = duel();
    thief.fx = 0;
    thief.fz = -1;
    pressBump(state, 1);
    const events = steps(state, 20);
    expect(events).toContainEqual({ type: 'miss', slot: 1 });
    expect(events.some((event) => event.type === 'bump')).toBe(false);
    expect(thief.stun).toBeGreaterThan(0);
  });
});

describe('Wackelturm-Regeln: Goldtörtchen', () => {
  it('erscheint per Zufall abseits von Berg und Nestern, verschwindet wieder', () => {
    const state = createWackelturm([1, 2, 3, 4], 35);
    const rng = createMinigameRng(3);
    const spawns: { x: number; z: number }[] = [];
    let expired = 0;
    for (let index = 0; index < 35 * 60; index++) {
      for (const event of stepWackelturm(state, DT, () => rng.next())) {
        if (event.type === 'gold-spawn') spawns.push({ x: event.x, z: event.z });
        if (event.type === 'gold-expire') expired++;
      }
    }
    expect(spawns.length).toBeGreaterThanOrEqual(3);
    expect(expired).toBe(spawns.length);
    for (const spot of spawns) {
      expect(Math.hypot(spot.x, spot.z)).toBeGreaterThan(P.pileRadius);
      for (const slot of [1, 2, 3, 4] as const) {
        const nest = nestPosition(slot);
        expect(Math.hypot(nest.x - spot.x, nest.z - spot.z)).toBeGreaterThan(P.nestRadius);
      }
    }
    // Gleicher Zufall → gleiche Stellen.
    const again = goldSpot(state, () => 0.9);
    expect(goldSpot(state, () => 0.9)).toEqual(again);
  });

  it('Drüberlaufen sammelt Gold auf den Turm', () => {
    const state = createWackelturm([1], 35);
    state.gold.push({ id: 7, x: 3, z: 0, age: 0 });
    const me = runner(state, 1);
    placeAt(me, 3, 0);
    const events = steps(state, 1);
    expect(events).toContainEqual({ type: 'gold', slot: 1, id: 7 });
    expect(me.stack).toEqual(['gold']);
    expect(state.gold).toHaveLength(0);
  });
});

describe('Wackelturm-Regeln: Figuren stoßen sich ab', () => {
  it('zwei Figuren am selben Punkt werden getrennt (deterministisch)', () => {
    const state = quietState([1, 2]);
    placeAt(runner(state, 1), 0, 0);
    placeAt(runner(state, 2), 0, 0);
    steps(state, 1);
    const distance = Math.hypot(
      runner(state, 1).x - runner(state, 2).x,
      runner(state, 1).z - runner(state, 2).z,
    );
    expect(distance).toBeCloseTo(P.bodyRadius * 2);
    expect(runner(state, 1).x).toBeLessThan(runner(state, 2).x);
  });
});
