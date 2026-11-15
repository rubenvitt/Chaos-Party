/**
 * Tastatur → Minispiel-Eingaben (lokale Vorschau und Fehlersuche). Rein, ohne DOM.
 * Belegung: Richtungstasten wie in der M1-Arena, A = Dash-Taste, B = eigene Taste.
 */
import type { MinigameInput, Slot } from '@chaos-party/minigame-sdk';
import { KEY_BINDINGS } from '../input/keyboardInputSource.ts';

const B_KEYS: Readonly<Record<Slot, string>> = {
  1: 'KeyE',
  2: 'ShiftRight',
  3: 'KeyU',
  4: 'NumpadAdd',
};

export interface KeyedInput {
  readonly slot: Slot;
  readonly input: MinigameInput;
}

/** Hält gedrückte Tasten und liefert die Minispiel-Eingaben dazu. */
export class MinigameKeyboard {
  readonly #held = new Set<string>();

  key(code: string, pressed: boolean): KeyedInput[] {
    for (const slot of [1, 2, 3, 4] as const) {
      const binding = KEY_BINDINGS[slot];
      const directions = [binding.up, binding.down, binding.left, binding.right];
      const isA = code === binding.dash;
      const isB = code === B_KEYS[slot];
      if (!isA && !isB && !directions.includes(code)) continue;
      if (pressed === this.#held.has(code)) return [];
      if (pressed) this.#held.add(code);
      else this.#held.delete(code);
      if (isA || isB) {
        const button = isA ? 'a' : 'b';
        return [{ slot, input: { type: pressed ? 'press' : 'release', button } }];
      }
      const x = (this.#held.has(binding.right) ? 1 : 0) - (this.#held.has(binding.left) ? 1 : 0);
      const y = (this.#held.has(binding.up) ? 1 : 0) - (this.#held.has(binding.down) ? 1 : 0);
      const length = Math.hypot(x, y) || 1;
      return [{ slot, input: { type: 'move', x: x / length, y: y / length } }];
    }
    return [];
  }

  /** Alles loslassen (Fokusverlust). */
  releaseAll(): KeyedInput[] {
    const codes = [...this.#held];
    return codes.flatMap((code) => this.key(code, false));
  }
}
