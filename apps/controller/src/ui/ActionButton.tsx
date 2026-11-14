import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Button } from '@chaos-party/protocol';
import { useInterruption } from './useInterruption.ts';

interface ActionButtonProps {
  button: Button;
  onPress: () => void;
  onRelease: () => void;
}

const LETTER: Record<Button, string> = { a: 'A', b: 'B' };

/**
 * Spielknopf: `press` beim Aufsetzen des Fingers, `release` beim Abheben,
 * Abbrechen (`pointercancel`, z. B. Drehen des Geräts) oder Verlust des Fingers.
 * Ein Finger pro Knopf; ein zweiter Finger auf demselben Knopf wird ignoriert.
 */
export function ActionButton({ button, onPress, onRelease }: ActionButtonProps) {
  const pointer = useRef<number | null>(null);
  const [pressed, setPressed] = useState(false);

  function release() {
    if (pointer.current === null) return;
    pointer.current = null;
    setPressed(false);
    onRelease();
  }

  useInterruption(release);

  function handleDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointer.current !== null) return;
    event.preventDefault();
    pointer.current = event.pointerId;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // siehe Joystick
    }
    setPressed(true);
    onPress();
  }

  function handleEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    if (pointer.current !== event.pointerId) return;
    release();
  }

  return (
    <button
      type="button"
      className={`action-button action-${button}`}
      data-testid={`button-${button}`}
      data-pressed={pressed ? 'true' : 'false'}
      aria-label={`Knopf ${LETTER[button]}`}
      onPointerDown={handleDown}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
      onLostPointerCapture={handleEnd}
      onPointerLeave={handleEnd}
    >
      <span className="action-letter ui-text">{LETTER[button]}</span>
    </button>
  );
}
