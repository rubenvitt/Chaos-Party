import { describe, expect, it, vi } from 'vitest';
import { createSoundEngine, MAX_VOICES, unlockOnFirstGesture } from './audio.ts';
import { SOUNDS } from './sounds.ts';

/** Minimaler WebAudio-Nachbau: zählt Quellen und merkt sich Lautstärken. */
class FakeParam {
  value = 0;
  readonly calls: string[] = [];
  setValueAtTime(value: number) {
    this.value = value;
    this.calls.push('set');
  }
  linearRampToValueAtTime() {
    this.calls.push('linear');
  }
  exponentialRampToValueAtTime() {
    this.calls.push('exp');
  }
  setTargetAtTime(value: number) {
    this.value = value;
  }
}

class FakeNode {
  connect() {
    return this;
  }
  disconnect() {
    return undefined;
  }
}

class FakeSource extends FakeNode {
  onended: (() => void) | null = null;
  started = false;
  readonly frequency = new FakeParam();
  type = 'sine';
  buffer: unknown = null;
  loop = false;
  start() {
    this.started = true;
  }
  stop() {
    return undefined;
  }
}

function fakeContext() {
  const sources: FakeSource[] = [];
  const gains: { gain: FakeParam }[] = [];
  const context = {
    state: 'running' as AudioContextState,
    currentTime: 0,
    sampleRate: 100,
    destination: new FakeNode(),
    resume: vi.fn(() => Promise.resolve()),
    createDynamicsCompressor: () =>
      Object.assign(new FakeNode(), { threshold: new FakeParam(), ratio: new FakeParam() }),
    createGain: () => {
      const node = Object.assign(new FakeNode(), { gain: new FakeParam() });
      gains.push(node);
      return node;
    },
    createBuffer: (_channels: number, length: number) => {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
    createBufferSource: () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    createOscillator: () => {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    createBiquadFilter: () =>
      Object.assign(new FakeNode(), {
        type: 'lowpass',
        frequency: new FakeParam(),
        Q: new FakeParam(),
      }),
  };
  return { context: context as unknown as AudioContext, sources, gains, raw: context };
}

describe('createSoundEngine', () => {
  it('stumm: legt keinen AudioContext an, zählt aber mit', () => {
    const createContext = vi.fn(() => fakeContext().context);
    const engine = createSoundEngine({ muted: true, createContext });
    engine.unlock();
    engine.play('coin');
    expect(createContext).not.toHaveBeenCalled();
    expect(engine.unlocked).toBe(false);
    expect(engine.played).toBe(1);
    expect(engine.lastPlayed).toBe('coin');
  });

  it('spielt erst nach unlock (Nutzer-Geste), dann je Stimme eine Quelle', () => {
    const fake = fakeContext();
    const engine = createSoundEngine({ muted: false, createContext: () => fake.context });
    engine.play('coin');
    expect(fake.sources).toHaveLength(0);
    engine.unlock();
    expect(engine.unlocked).toBe(true);
    engine.play('coin');
    expect(fake.sources).toHaveLength(SOUNDS.coin.recipe.length);
    expect(fake.sources.every((source) => source.started)).toBe(true);
    // Rauschen nutzt eine Puffer-Quelle in Schleife.
    engine.play('whoosh');
    expect(fake.sources.at(-1)?.loop).toBe(true);
  });

  it('weckt einen angehaltenen Kontext und spielt nichts, solange er nicht läuft', () => {
    const fake = fakeContext();
    fake.raw.state = 'suspended';
    const engine = createSoundEngine({ muted: false, createContext: () => fake.context });
    engine.unlock();
    expect(fake.raw.resume).toHaveBeenCalled();
    engine.play('pop');
    expect(fake.sources).toHaveLength(0);
  });

  it('begrenzt gleichzeitige Stimmen und gibt sie nach dem Ende frei', () => {
    const fake = fakeContext();
    const engine = createSoundEngine({ muted: false, createContext: () => fake.context });
    engine.unlock();
    for (let index = 0; index < MAX_VOICES * 2; index++) engine.play('pop');
    expect(fake.sources).toHaveLength(MAX_VOICES);
    for (const source of fake.sources) source.onended?.();
    engine.play('pop');
    expect(fake.sources).toHaveLength(MAX_VOICES + 1);
  });

  it('Gesamtlautstärke 0…1 auf dem Master-Pegel', () => {
    const fake = fakeContext();
    const engine = createSoundEngine({
      muted: false,
      volume: 0.4,
      createContext: () => fake.context,
    });
    engine.unlock();
    const master = fake.gains[0];
    expect(master?.gain.value).toBeCloseTo(0.4);
    engine.setVolume(3);
    expect(master?.gain.value).toBe(1);
    engine.setVolume(-1);
    expect(master?.gain.value).toBe(0);
  });

  it('kein WebAudio: unlock warnt statt zu werfen', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const engine = createSoundEngine({
      muted: false,
      createContext: () => {
        throw new Error('nicht da');
      },
    });
    expect(() => {
      engine.unlock();
    }).not.toThrow();
    expect(engine.unlocked).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('unlockOnFirstGesture', () => {
  it('schaltet beim ersten Klick/Tastendruck frei und meldet sich ab', () => {
    const target = new EventTarget();
    const unlock = vi.fn();
    const engine = { ...createSoundEngine({ muted: true }), unlock };
    unlockOnFirstGesture(engine, target);
    target.dispatchEvent(new Event('keydown'));
    target.dispatchEvent(new Event('pointerdown'));
    expect(unlock).toHaveBeenCalledTimes(1);
  });
});
