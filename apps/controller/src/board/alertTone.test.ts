import { describe, expect, it } from 'vitest';
import type { ControllerBoardInfo, PromptInfo } from '@chaos-party/protocol';
import type { SlotContext } from '../state/reducer.ts';
import {
  ALERT_NOTES,
  alertPromptId,
  createAlertTone,
  installAlertUnlock,
  UNLOCK_EVENTS,
  type ToneContext,
} from './alertTone.ts';
import { activatePrompt } from './countdown.ts';

const board: ControllerBoardInfo = {
  gamePhase: 'reaction-window',
  round: 2,
  rounds: 5,
  coins: 10,
  trophies: 0,
  items: [],
  activeSlot: 2,
  paused: false,
  character: 'robot',
  minigameWins: 0,
};

function prompt(id: number, slot: 1 | 2, kind: PromptInfo['kind']): PromptInfo {
  return {
    id,
    slot,
    kind,
    title: 'Schnell!',
    options: [{ id: 'shield', label: 'Schild!' }],
    remainingMs: 3000,
  };
}

function boardContext(info?: PromptInfo): SlotContext {
  return {
    phase: 'board',
    layout: 'board',
    actions: info ? ['choose'] : [],
    board,
    ...(info && { prompt: activatePrompt(info, undefined, 0) }),
  };
}

/** Nachgebauter AudioContext: zählt gestartete Töne, Zustand von außen steuerbar. */
function fakeContext(initial: AudioContextState = 'suspended') {
  const started: number[] = [];
  const param = () => ({
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const ctx = {
    state: initial,
    currentTime: 1,
    sampleRate: 48_000,
    destination: {},
    resumes: 0,
    silentStarts: 0,
    resume() {
      ctx.resumes += 1;
      ctx.state = 'running';
      return Promise.resolve();
    },
    createOscillator() {
      const frequency = { ...param(), value: 0 };
      return {
        type: 'sine',
        frequency: {
          ...frequency,
          setValueAtTime(hz: number) {
            started.push(hz);
          },
        },
        connect: () => undefined,
        start: () => undefined,
        stop: () => undefined,
      };
    },
    createGain() {
      return { gain: param(), connect: () => undefined };
    },
    createBuffer: () => ({}),
    createBufferSource() {
      return {
        buffer: null,
        connect: () => undefined,
        start: () => {
          ctx.silentStarts += 1;
        },
      };
    },
  };
  return { ctx, started, asTone: ctx as unknown as ToneContext };
}

describe('alertPromptId (wer den Ton bekommt)', () => {
  it('nur ein eigener Reaktions-Prompt löst aus', () => {
    expect(alertPromptId(boardContext(prompt(5, 1, 'reaction')), 1)).toBe(5);
  });

  it('Reaktion eines anderen Slots: kein Ton für die Zuschauer', () => {
    expect(alertPromptId(boardContext(prompt(5, 2, 'reaction')), 1)).toBeNull();
  });

  it('andere Prompt-Arten, kein Prompt oder kein Brett: kein Ton', () => {
    expect(alertPromptId(boardContext(prompt(6, 1, 'roll')), 1)).toBeNull();
    expect(alertPromptId(boardContext(prompt(6, 1, 'target')), 1)).toBeNull();
    expect(alertPromptId(boardContext(), 1)).toBeNull();
    expect(alertPromptId(undefined, 1)).toBeNull();
    expect(
      alertPromptId({ ...boardContext(prompt(5, 1, 'reaction')), layout: 'wait' }, 1),
    ).toBeNull();
  });
});

describe('createAlertTone', () => {
  it('ohne Nutzergeste: kein Kontext, kein Ton', () => {
    let created = 0;
    const tone = createAlertTone({
      createContext: () => {
        created += 1;
        return fakeContext().asTone;
      },
    });
    expect(tone.play(1)).toBe(false);
    expect(tone.ready).toBe(false);
    expect(created).toBe(0);
  });

  it('nach der Geste: zwei steigende Töne, einmal je Prompt-ID', async () => {
    const fake = fakeContext();
    const tone = createAlertTone({ createContext: () => fake.asTone });
    tone.unlock();
    await Promise.resolve();
    expect(tone.ready).toBe(true);
    expect(fake.ctx.silentStarts).toBe(1);

    expect(tone.play(7)).toBe(true);
    expect(fake.started).toEqual(ALERT_NOTES.map((n) => n.hz));
    // Steigend: zweiter Ton höher als der erste.
    expect(fake.started).toEqual([...fake.started].sort((a, b) => a - b));
    // Gleicher Prompt erneut (Kontext-Update, StrictMode, Reconnect): still.
    expect(tone.play(7)).toBe(false);
    expect(fake.started).toHaveLength(2);
    // Neuer Angriff: wieder Ton.
    expect(tone.play(8)).toBe(true);
    expect(fake.started).toHaveLength(4);
  });

  it('ein Prompt vor der Freischaltung wird nicht nachgeholt', () => {
    const fake = fakeContext();
    const tone = createAlertTone({ createContext: () => fake.asTone });
    expect(tone.play(3)).toBe(false);
    tone.unlock();
    expect(tone.play(3)).toBe(false);
    expect(tone.play(4)).toBe(true);
  });

  it('Ereignis ohne echte Nutzergeste (userActivation inaktiv) legt nichts an', () => {
    let created = 0;
    let active = false;
    const tone = createAlertTone({
      createContext: () => {
        created += 1;
        return fakeContext().asTone;
      },
      gestureActive: () => active,
    });
    tone.unlock();
    expect(created).toBe(0);
    active = true;
    tone.unlock();
    expect(created).toBe(1);
  });

  it('Seite im Hintergrund: kein Ton', () => {
    const fake = fakeContext('running');
    const tone = createAlertTone({ createContext: () => fake.asTone, hidden: () => true });
    tone.unlock();
    expect(tone.play(1)).toBe(false);
    expect(fake.started).toEqual([]);
  });

  it('kein Web Audio: unlock und play werfen nicht', () => {
    const tone = createAlertTone({
      createContext: () => {
        throw new Error('AudioContext fehlt');
      },
    });
    expect(() => {
      tone.unlock();
    }).not.toThrow();
    expect(tone.play(1)).toBe(false);
  });
});

describe('installAlertUnlock', () => {
  it('erste Geste schaltet frei, danach hört der Lauscher auf', async () => {
    const fake = fakeContext();
    const tone = createAlertTone({ createContext: () => fake.asTone });
    const target = new EventTarget();
    installAlertUnlock(tone, target);

    target.dispatchEvent(new Event('touchend'));
    await Promise.resolve();
    expect(tone.ready).toBe(true);
    expect(fake.ctx.resumes).toBe(1);

    // Zweite Geste: Kontext läuft bereits → nichts mehr zu tun.
    target.dispatchEvent(new Event('click'));
    expect(fake.ctx.resumes).toBe(1);
  });

  it('lauscht auf Tipp- und Tasten-Ereignisse', () => {
    expect(UNLOCK_EVENTS).toEqual(
      expect.arrayContaining(['pointerup', 'touchend', 'click', 'keydown']),
    );
  });

  it('Aufräumfunktion entfernt alle Lauscher', () => {
    let unlocks = 0;
    const tone = {
      unlock: () => {
        unlocks += 1;
      },
      ready: false,
      play: () => false,
    };
    const target = new EventTarget();
    const remove = installAlertUnlock(tone, target);
    remove();
    for (const type of UNLOCK_EVENTS) target.dispatchEvent(new Event(type));
    expect(unlocks).toBe(0);
  });
});
