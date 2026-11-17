import { describe, expect, it } from 'vitest';
import {
  preloadShaderSources,
  runInRounds,
  runInSlices,
  shaderSourceLoaders,
} from './prepareGradually.ts';

/** Uhr, die nur die Arbeit vorrückt (jeder Eintrag kostet so viele ms wie angegeben). */
function fakeClock() {
  let time = 0;
  return {
    now: () => time,
    spend: (ms: number) => {
      time += ms;
    },
  };
}

describe('runInSlices (CHAOS-71)', () => {
  it('pausiert, sobald das Budget eines Abschnitts verbraucht ist', async () => {
    const clock = fakeClock();
    const order: string[] = [];
    const stats = await runInSlices(
      [5, 5, 5, 5, 5],
      (cost) => {
        clock.spend(cost);
        order.push(`work${String(cost)}`);
      },
      {
        budgetMs: 10,
        isCancelled: () => false,
        now: clock.now,
        pause: () => {
          order.push('pause');
          return Promise.resolve();
        },
      },
    );
    expect(order).toEqual(['work5', 'work5', 'pause', 'work5', 'work5', 'pause', 'work5']);
    expect(stats).toEqual({ done: 5, pauses: 2, longestSliceMs: 10, cancelled: false });
  });

  it('teilt teure Einzelschritte (jeder Shader ein eigener Abschnitt) und pausiert nicht am Ende', async () => {
    const clock = fakeClock();
    let pauses = 0;
    const stats = await runInSlices([300, 800, 120], clock.spend, {
      budgetMs: 12,
      isCancelled: () => false,
      now: clock.now,
      pause: () => {
        pauses += 1;
        return Promise.resolve();
      },
    });
    expect(pauses).toBe(2);
    expect(stats.longestSliceMs).toBe(800);
    expect(stats.done).toBe(3);
  });

  it('bricht ab, wenn die Szene inzwischen entsorgt ist', async () => {
    const clock = fakeClock();
    let disposed = false;
    const seen: number[] = [];
    const stats = await runInSlices(
      [1, 2, 3, 4],
      (item) => {
        seen.push(item);
        clock.spend(20);
      },
      {
        budgetMs: 10,
        isCancelled: () => disposed,
        now: clock.now,
        pause: () => {
          disposed = true;
          return Promise.resolve();
        },
      },
    );
    expect(seen).toEqual([1]);
    expect(stats.cancelled).toBe(true);
  });

  it('leere Liste: nichts zu tun, keine Pause', async () => {
    const stats = await runInSlices([], () => undefined, {
      budgetMs: 10,
      isCancelled: () => false,
      pause: () => Promise.reject(new Error('keine Pause erwartet')),
    });
    expect(stats).toEqual({ done: 0, pauses: 0, longestSliceMs: 0, cancelled: false });
  });
});

describe('runInRounds (CHAOS-71)', () => {
  const instant = { budgetMs: 1000, isCancelled: () => false, pause: () => Promise.resolve() };

  it('wiederholt nur die unfertigen Schritte, bis alle bereit sind', async () => {
    // Schritt b wird erst im dritten Versuch bereit (Shader-Quelle nachgeladen).
    const attempts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const readyAt: Record<string, number> = { a: 1, b: 3, c: 1 };
    const stats = await runInRounds(
      ['a', 'b', 'c'],
      (key) => {
        attempts[key] = (attempts[key] ?? 0) + 1;
        return (attempts[key] ?? 0) >= (readyAt[key] ?? 1);
      },
      { ...instant, maxRounds: 10 },
    );
    expect(attempts).toEqual({ a: 1, b: 3, c: 1 });
    expect(stats).toMatchObject({ rounds: 3, pending: 0, cancelled: false });
  });

  it('hört nach maxRounds auf und meldet den Rest', async () => {
    const stats = await runInRounds([1, 2], (item) => item === 1, { ...instant, maxRounds: 4 });
    expect(stats).toMatchObject({ rounds: 4, pending: 1 });
  });

  it('pausiert zwischen den Runden', async () => {
    let pauses = 0;
    let calls = 0;
    await runInRounds(
      ['x'],
      () => {
        calls += 1;
        return calls > 1;
      },
      {
        ...instant,
        maxRounds: 5,
        pause: () => {
          pauses += 1;
          return Promise.resolve();
        },
      },
    );
    expect(pauses).toBe(1);
  });
});

/** Nachbau von Babylons `_ShaderImportLoader`: lädt einmal, danach kein Rückruf mehr. */
function fakeLoader() {
  const calls: number[] = [];
  let loaded = false;
  return {
    calls,
    getLoadCallback(language: number) {
      if (loaded) return undefined;
      return () => {
        calls.push(language);
        loaded = true;
        return Promise.resolve();
      };
    },
  };
}

describe('shaderSourceLoaders / preloadShaderSources (CHAOS-132)', () => {
  const base = fakeLoader();
  const standard = fakeLoader();
  class BaseMaterial {
    static _ShaderLoader = base;
  }
  class DerivedMaterial extends BaseMaterial {}
  class StandardLike {
    static _ShaderLoader = standard;
  }
  class PlainMaterial {}

  it('findet je Klasse einen Lader, auch aus der Oberklasse, ohne Doppelte', () => {
    const loaders = shaderSourceLoaders([
      new DerivedMaterial(),
      new BaseMaterial(),
      new StandardLike(),
      new StandardLike(),
      new PlainMaterial(),
    ]);
    expect(loaders).toHaveLength(2);
    expect(loaders).toContain(base);
    expect(loaders).toContain(standard);
  });

  it('lädt jede Quelle einmal in der verlangten Sprache, danach nicht mehr', async () => {
    const one = fakeLoader();
    class A {
      static _ShaderLoader = one;
    }
    await preloadShaderSources([new A(), new A()], 0);
    await preloadShaderSources([new A()], 0);
    expect(one.calls).toEqual([0]);
  });

  it('übergeht Materialien ohne gültigen Lader', async () => {
    class Broken {
      static _ShaderLoader = { getLoadCallback: 'nein' };
    }
    expect(shaderSourceLoaders([new Broken(), new PlainMaterial()])).toEqual([]);
    await expect(preloadShaderSources([new Broken()], 0)).resolves.toBeUndefined();
  });
});
