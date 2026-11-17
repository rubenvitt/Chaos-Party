/**
 * Hinweiston beim Angriff (CHAOS-122): Wer Ziel eines Münzklaus ist, hat nur ein kurzes
 * Reaktionsfenster (EXP-004: 3 s). iOS-Safari kann nicht vibrieren; ein kurzer, selbst
 * erzeugter Ton (Web Audio, keine Datei) holt den Blick vom Fernseher aufs Handy.
 *
 * Regeln:
 * - **Nur nach einer Nutzergeste.** Der `AudioContext` entsteht erst in einem Tipp oder
 *   Tastendruck (`installAlertUnlock`). Davor wird nichts angelegt und nichts gespielt –
 *   so gibt es keine Autoplay-Warnung in der Konsole.
 * - **Stummschalter respektieren.** `navigator.audioSession.type = 'ambient'` (Safari
 *   16.4+): iOS hält sich an den Stumm-Schalter und unterbricht keine Musik.
 * - **Einmal je Prompt.** Gleiche Prompt-ID (erneut gesendeter Kontext, StrictMode,
 *   Wiederverbindung) spielt nicht noch einmal.
 * - **Nur für den Angegriffenen.** Ausgelöst wird nur von einem *eigenen* Reaktions-Prompt
 *   (`alertPromptId`); den sieht ausschließlich der Controller des Ziels.
 *
 * Ob der Ton auf echten Geräten hörbar ist und stumm bleibt, prüft nur die Gerätecheckliste.
 */
import type { SlotNumber } from '@chaos-party/protocol';
import type { SlotContext } from '../state/reducer.ts';
import { ownPrompt } from './prompt.ts';

/**
 * Prompt-ID, die einen Hinweiston auslöst, oder `null`: nur ein offener Reaktions-Prompt,
 * der genau diesem Slot gilt (Prompts anderer Slots zählen nie).
 */
export function alertPromptId(context: SlotContext | undefined, slot: SlotNumber): number | null {
  const prompt = ownPrompt(context, slot);
  return prompt?.info.kind === 'reaction' ? prompt.info.id : null;
}

/** Ausschnitt von `AudioContext`, den der Ton braucht (in Tests ersetzbar). */
export type ToneContext = Pick<
  AudioContext,
  'state' | 'currentTime' | 'destination' | 'resume' | 'createOscillator' | 'createGain'
> &
  Partial<Pick<AudioContext, 'createBuffer' | 'createBufferSource' | 'sampleRate'>>;

export interface AlertToneDeps {
  /** Legt den Audio-Kontext an; nur innerhalb einer Nutzergeste aufgerufen. */
  readonly createContext: () => ToneContext;
  /** Ob gerade eine Nutzergeste aktiv ist (`navigator.userActivation.isActive`), sonst `null`. */
  readonly gestureActive?: () => boolean | null;
  /** Ob die Seite im Hintergrund ist (dann kein Ton). */
  readonly hidden?: () => boolean;
}

export interface AlertTone {
  /** In einer Nutzergeste aufrufen: legt den Kontext an bzw. setzt ihn fort. */
  unlock(): void;
  /** Kontext läuft, Töne sind möglich. */
  readonly ready: boolean;
  /**
   * Spielt den Hinweiston für diesen Prompt, höchstens einmal je ID.
   * `true`, wenn er gespielt wurde.
   */
  play(promptId: number): boolean;
}

/** Zwei kurze, steigende Töne („ding-ding“): A5 → E6, je 90 ms, Dreieckswelle. */
export const ALERT_NOTES: readonly { readonly hz: number; readonly at: number }[] = [
  { hz: 880, at: 0 },
  { hz: 1318.5, at: 0.11 },
];
const NOTE_S = 0.09;
const PEAK_GAIN = 0.28;

export function createAlertTone(deps: AlertToneDeps): AlertTone {
  let context: ToneContext | null = null;
  let lastPromptId: number | null = null;

  function primeSilence(ctx: ToneContext) {
    // Ältere iOS-Versionen schalten Web Audio erst frei, wenn in der Geste etwas startet.
    if (!ctx.createBuffer || !ctx.createBufferSource) return;
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate ?? 44_100);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  }

  return {
    unlock() {
      if (deps.gestureActive?.() === false) return;
      try {
        if (context === null) {
          context = deps.createContext();
          primeSilence(context);
        }
        if (context.state !== 'running') void context.resume().catch(() => undefined);
      } catch {
        // Kein Web Audio (oder vom Browser verweigert): dann eben ohne Ton.
      }
    },
    get ready() {
      return context?.state === 'running';
    },
    play(promptId) {
      if (promptId === lastPromptId) return false;
      lastPromptId = promptId;
      if (context?.state !== 'running' || deps.hidden?.() === true) return false;
      try {
        const start = context.currentTime + 0.01;
        for (const note of ALERT_NOTES) {
          const osc = context.createOscillator();
          const gain = context.createGain();
          const t0 = start + note.at;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(note.hz, t0);
          gain.gain.setValueAtTime(0.0001, t0);
          gain.gain.exponentialRampToValueAtTime(PEAK_GAIN, t0 + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, t0 + NOTE_S);
          osc.connect(gain);
          gain.connect(context.destination);
          osc.start(t0);
          osc.stop(t0 + NOTE_S + 0.02);
        }
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Ereignisse, die als Nutzergeste zählen können (WebKit: `touchend`, Chromium: `pointerup`). */
export const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

/**
 * Schaltet den Ton bei der ersten Nutzergeste frei (Tipp auf „Bereit“, Code-Eingabe …).
 * Lauscht in der Capture-Phase, damit Handler mit `preventDefault` nicht stören, und hört
 * auf, sobald der Kontext läuft. Gibt eine Aufräumfunktion zurück.
 */
export function installAlertUnlock(tone: AlertTone, target: EventTarget): () => void {
  const options = { capture: true, passive: true } as const;
  const remove = () => {
    for (const type of UNLOCK_EVENTS) target.removeEventListener(type, onGesture, options);
  };
  function onGesture() {
    tone.unlock();
    if (tone.ready) remove();
  }
  for (const type of UNLOCK_EVENTS) target.addEventListener(type, onGesture, options);
  return remove;
}

interface AudioSessionNavigator {
  audioSession?: { type: string };
  userActivation?: { isActive: boolean };
}

/** Ton der Seite (eine Instanz, lebt so lange wie die Seite). */
export function createBrowserAlertTone(): AlertTone {
  // Beide APIs sind jung (Safari 16.4+) und fehlen in älteren Browsern: bewusst optional.
  const nav = navigator as unknown as AudioSessionNavigator;
  return createAlertTone({
    createContext: () => {
      try {
        // iOS: Stumm-Schalter achten, laufende Musik nicht unterbrechen (vor dem ersten Ton).
        if (nav.audioSession) nav.audioSession.type = 'ambient';
      } catch {
        // Ältere Safari-Versionen: Web Audio ist dort ohnehin „ambient“.
      }
      return new AudioContext();
    },
    gestureActive: () => nav.userActivation?.isActive ?? null,
    hidden: () => document.visibilityState === 'hidden',
  });
}
