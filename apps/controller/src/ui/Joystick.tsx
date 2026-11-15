import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { knobOffset, stickFromOffset, ZERO_STICK, type Stick } from '../input/joystick.ts';
import { DEFAULT_STICK_HINT } from '../minigame/view.ts';
import { useInterruption } from './useInterruption.ts';

interface JoystickProps {
  /** Neue Stellung (bereits normiert, Totzone, gerundet). Loslassen meldet `{0, 0}`. */
  onChange: (stick: Stick) => void;
  /** Text unter dem Ring (Minispiel: „Ziehen: Lenken“); Standard wie in der M1-Arena. */
  hint?: string | undefined;
}

/**
 * Virtueller Joystick mit schwebendem Ursprung: Der Ring springt dorthin, wo der
 * Daumen die Zone berührt; die Auslenkung von dort ergibt den Vektor.
 *
 * Pointer Events mit Pointer-Capture; der Joystick folgt genau einem Finger
 * (`pointerId`), weitere Finger in der Zone werden ignoriert. Die Darstellung
 * wird direkt per `transform` gesetzt (kein React-Rendern pro Bewegung, A7).
 */
export function Joystick({ onChange, hint = DEFAULT_STICK_HINT }: JoystickProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const active = useRef<{
    pointerId: number;
    originX: number;
    originY: number;
    radius: number;
  } | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  function render(base: { x: number; y: number } | null, knob: { dx: number; dy: number }) {
    const baseEl = baseRef.current;
    const knobEl = knobRef.current;
    if (baseEl) {
      baseEl.style.transform =
        base === null ? '' : `translate(${base.x}px, ${base.y}px) translate(-50%, -50%)`;
      baseEl.dataset.active = base === null ? 'false' : 'true';
    }
    if (knobEl) knobEl.style.transform = `translate(${knob.dx}px, ${knob.dy}px)`;
  }

  function release() {
    if (active.current === null) return;
    active.current = null;
    if (zoneRef.current) zoneRef.current.dataset.active = 'false';
    render(null, { dx: 0, dy: 0 });
    onChangeRef.current(ZERO_STICK);
  }

  // Fokusverlust oder Verschwinden (neuer Kontext) während des Haltens: loslassen melden.
  useInterruption(release);

  function handleDown(event: ReactPointerEvent<HTMLDivElement>) {
    const zone = zoneRef.current;
    if (active.current !== null || !zone) return;
    event.preventDefault();
    try {
      zone.setPointerCapture(event.pointerId);
    } catch {
      // Ohne Capture funktioniert es trotzdem, solange der Finger in der Zone bleibt.
    }
    const rect = zone.getBoundingClientRect();
    const radius = Math.max((baseRef.current?.offsetWidth ?? 140) / 2, 32);
    active.current = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      radius,
    };
    zone.dataset.active = 'true';
    render({ x: event.clientX - rect.left, y: event.clientY - rect.top }, { dx: 0, dy: 0 });
  }

  function handleMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = active.current;
    if (state?.pointerId !== event.pointerId) return;
    const dx = event.clientX - state.originX;
    const dy = event.clientY - state.originY;
    const rect = zoneRef.current?.getBoundingClientRect();
    render(
      rect ? { x: state.originX - rect.left, y: state.originY - rect.top } : null,
      knobOffset(dx, dy, state.radius),
    );
    onChangeRef.current(stickFromOffset(dx, dy, state.radius));
  }

  function handleEnd(event: ReactPointerEvent<HTMLDivElement>) {
    if (active.current?.pointerId !== event.pointerId) return;
    release();
  }

  return (
    <div
      ref={zoneRef}
      className="joystick-zone"
      data-testid="joystick"
      data-active="false"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleEnd}
      onPointerCancel={handleEnd}
      onLostPointerCapture={handleEnd}
    >
      <div ref={baseRef} className="joystick-base" data-active="false">
        <div ref={knobRef} className="joystick-knob" />
      </div>
      <span className="joystick-hint ui-text" data-testid="joystick-hint">
        {hint}
      </span>
    </div>
  );
}
