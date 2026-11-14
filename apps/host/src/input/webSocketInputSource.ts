import type { InputIntent } from '@chaos-party/protocol';
import type { PlayerInput, PlayerSlot } from '../scene/types.ts';
import type { InputSource } from './inputSource.ts';

export interface MappedInput {
  readonly slot: PlayerSlot;
  readonly input: PlayerInput;
}

/**
 * Übersetzt eine vom Server geprüfte Controller-Eingabe in eine Szenen-Eingabe.
 *
 * - `move { x, y }` → Stick 1:1 (`x` rechts, `y` = „nach oben/vorn“, vom Bildschirm weg;
 *   der Controller schickt `y = +1`, wenn der Stick nach oben gedrückt wird).
 * - `press`/`release` von **A und B** → Schubser (`dash`) gedrückt/losgelassen. In M1 gibt es
 *   nur eine Aktion; B macht dasselbe, damit kein Knopf auf dem Handy „tot“ wirkt.
 * - `gesture`, `reaction` → keine Wirkung in der Schubs-Arena (`null`).
 */
export function intentToPlayerInput(intent: InputIntent): MappedInput | null {
  switch (intent.type) {
    case 'move':
      return { slot: intent.slot, input: { type: 'move', x: intent.x, y: intent.y } };
    case 'press':
    case 'release':
      return {
        slot: intent.slot,
        input: { type: 'button', button: 'dash', pressed: intent.type === 'press' },
      };
    case 'gesture':
    case 'reaction':
      return null;
  }
}

export type IntentListener = (intent: InputIntent) => void;

/** Kleiner Verteiler: Die Server-Verbindung `emit`tet, Eingabequellen `subscribe`n. */
export interface IntentHub {
  emit(intent: InputIntent): void;
  subscribe(listener: IntentListener): () => void;
}

export function createIntentHub(): IntentHub {
  const listeners = new Set<IntentListener>();
  return {
    emit(intent) {
      for (const listener of listeners) listener(intent);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/**
 * Netzwerk-Eingaben als `InputSource` (ADR-004-Naht): Jede `input`-Nachricht des Servers
 * wird übersetzt und an die Szene gegeben. `onApplied` bekommt jede angewandte Eingabe
 * (Testhaken: Zähler und letzter Stick je Slot, CHAOS-14).
 */
export function createWebSocketInputSource(
  hub: Pick<IntentHub, 'subscribe'>,
  onApplied?: (applied: MappedInput) => void,
): InputSource {
  return {
    start(sink) {
      return hub.subscribe((intent) => {
        const mapped = intentToPlayerInput(intent);
        if (!mapped) return;
        sink.applyInput(mapped.slot, mapped.input);
        onApplied?.(mapped);
      });
    },
  };
}
