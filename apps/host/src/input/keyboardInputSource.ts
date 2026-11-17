import type { PlayerInput, PlayerSlot } from '../scene/types.ts';
import type { InputSource } from './inputSource.ts';

/** Tastenbelegung einer Person; Werte sind `KeyboardEvent.code` (layoutunabhängig). */
export interface KeyBinding {
  readonly up: string;
  readonly down: string;
  readonly left: string;
  readonly right: string;
  readonly dash: string;
}

/** Lokale Entwicklungsbelegung, bis echte Controller per WebSocket kommen. */
export const KEY_BINDINGS: Readonly<Record<PlayerSlot, KeyBinding>> = {
  1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', dash: 'Space' },
  2: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', dash: 'Enter' },
  3: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', dash: 'KeyO' },
  4: { up: 'Numpad8', down: 'Numpad5', left: 'Numpad4', right: 'Numpad6', dash: 'Numpad0' },
};

export interface SlotInput {
  readonly slot: PlayerSlot;
  readonly input: PlayerInput;
}

/**
 * Reiner Zustandsautomat der Tastatur: merkt sich gedrückte Tasten und liefert
 * die daraus folgenden Eingaben. Ohne DOM, damit er in Node testbar ist.
 */
export class KeyboardState {
  readonly #held = new Set<string>();
  readonly #bindings: Readonly<Record<PlayerSlot, KeyBinding>>;

  constructor(bindings: Readonly<Record<PlayerSlot, KeyBinding>> = KEY_BINDINGS) {
    this.#bindings = bindings;
  }

  /** `true`, wenn die Taste zu irgendeiner Belegung gehört. */
  handles(code: string): boolean {
    return this.#findSlot(code) !== undefined;
  }

  /** Verarbeitet eine Taste; Wiederholungen derselben Taste erzeugen nichts. */
  key(code: string, pressed: boolean): SlotInput[] {
    const found = this.#findSlot(code);
    if (!found) return [];
    const [slot, binding] = found;
    if (pressed === this.#held.has(code)) return [];
    if (pressed) {
      this.#held.add(code);
    } else {
      this.#held.delete(code);
    }
    if (code === binding.dash) {
      return [{ slot, input: { type: 'button', button: 'dash', pressed } }];
    }
    return [{ slot, input: this.#move(binding) }];
  }

  /** Lässt alle Tasten los (z. B. bei Fokusverlust), damit niemand weiterläuft. */
  releaseAll(): SlotInput[] {
    const codes = [...this.#held];
    return codes.flatMap((code) => this.key(code, false));
  }

  #move(binding: KeyBinding): PlayerInput {
    const axis = (neg: string, pos: string) =>
      (this.#held.has(pos) ? 1 : 0) - (this.#held.has(neg) ? 1 : 0);
    let x = axis(binding.left, binding.right);
    let y = axis(binding.down, binding.up);
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    return { type: 'move', x, y };
  }

  #findSlot(code: string): [PlayerSlot, KeyBinding] | undefined {
    for (const [slotKey, binding] of Object.entries(this.#bindings)) {
      if (Object.values(binding).includes(code)) {
        return [Number(slotKey) as PlayerSlot, binding];
      }
    }
    return undefined;
  }
}

/**
 * Liegt der Fokus auf einem Bedienelement (Knopf, Auswahl, Eingabefeld)? Dann gehören Enter und
 * Leertaste der Oberfläche (Lobby per Tastatur, CHAOS-36), nicht den Tastatur-Spielern.
 */
export function isUiTarget(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  return (
    typeof element?.closest === 'function' &&
    element.closest('button, input, select, textarea, a[href]') !== null
  );
}

/** Tastatur als `InputSource`: hört auf `keydown`/`keyup` am übergebenen Fenster. */
export function createKeyboardInputSource(target: Window = window): InputSource {
  return {
    start(sink) {
      const state = new KeyboardState();
      const forward = (inputs: SlotInput[]) => {
        for (const { slot, input } of inputs) {
          sink.applyInput(slot, input);
        }
      };
      const onKey = (event: KeyboardEvent) => {
        if (!state.handles(event.code)) return;
        // Taste auf einem fokussierten Knopf: gehört der Oberfläche (keyup trotzdem weiterreichen,
        // damit nichts klemmt). Kein `preventDefault` auf dem Knopf: Die Leertaste löst einen
        // Knopf erst beim keyup aus, sonst ließe sie sich am PC nicht bedienen (CHAOS-124).
        const ui = isUiTarget(event.target);
        if (event.type === 'keydown' && ui) return;
        // Pfeiltasten/Leertaste sollen die Seite nicht scrollen.
        if (!ui) event.preventDefault();
        if (event.repeat) return;
        forward(state.key(event.code, event.type === 'keydown'));
      };
      const onBlur = () => {
        forward(state.releaseAll());
      };
      target.addEventListener('keydown', onKey);
      target.addEventListener('keyup', onKey);
      target.addEventListener('blur', onBlur);
      return () => {
        target.removeEventListener('keydown', onKey);
        target.removeEventListener('keyup', onKey);
        target.removeEventListener('blur', onBlur);
      };
    },
  };
}
