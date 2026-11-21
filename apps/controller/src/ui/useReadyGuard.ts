/**
 * Schonfrist für „Bereit!“ in der Minispiel-Anleitung (CHAOS-214): Der Knopf wird erst
 * {@link INTRO_READY_GUARD_MS} nach dem Erscheinen antippbar, damit ein Tipper vom vorigen
 * Bildschirm nicht durchrutscht. iPhone: ein Knopf je Anleitung (`useArmed`, beim Einhängen);
 * iPad: je Zone und Anleitung (`useArmedSlots`, ab dem Moment, in dem die Zone sie anbietet).
 */
import { useEffect, useRef, useState } from 'react';
import type { SlotNumber } from '@chaos-party/protocol';
import { INTRO_READY_GUARD_MS } from '../minigame/view.ts';

/** `true`, sobald die Komponente `delayMs` lang eingehängt ist. */
export function useArmed(delayMs: number = INTRO_READY_GUARD_MS): boolean {
  const [armed, setArmed] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const timer = setTimeout(() => {
      setArmed(true);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [delayMs]);
  return armed;
}

/** Wartende Zone: Platz und Kennung ihrer Anleitung (`readyIntroToken`). */
export type WaitingIntro = readonly [slot: SlotNumber, token: string];

interface Pending {
  readonly token: string;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * Plätze aus `waiting`, deren Anleitung schon mindestens `delayMs` angeboten wird. Scharf ist
 * immer nur genau die Kennung, für die die Frist lief: Eine neue Anleitung beginnt von vorn.
 */
export function useArmedSlots(
  waiting: readonly WaitingIntro[],
  delayMs: number = INTRO_READY_GUARD_MS,
): ReadonlySet<SlotNumber> {
  const key = waiting.map(([slot, token]) => `${String(slot)}=${token}`).join('|');
  const [armed, setArmed] = useState<Readonly<Partial<Record<SlotNumber, string>>>>({});
  const pending = useRef(new Map<SlotNumber, Pending>());

  useEffect(() => {
    const entries = key === '' ? [] : key.split('|').map((entry) => entry.split('='));
    const wanted = new Map(entries.map(([slot = '0', token = '']) => [Number(slot), token]));
    const map = pending.current;
    for (const [slot, entry] of map) {
      if (wanted.get(slot) === entry.token) continue;
      clearTimeout(entry.timer);
      map.delete(slot);
    }
    for (const [slotNumber, token] of wanted) {
      const slot = slotNumber as SlotNumber;
      if (map.has(slot)) continue;
      const timer = setTimeout(() => {
        setArmed((prev) => (prev[slot] === token ? prev : { ...prev, [slot]: token }));
      }, delayMs);
      map.set(slot, { token, timer });
    }
  }, [key, delayMs]);

  useEffect(() => {
    const map = pending.current;
    return () => {
      for (const entry of map.values()) clearTimeout(entry.timer);
      map.clear();
    };
  }, []);

  return new Set(waiting.filter(([slot, token]) => armed[slot] === token).map(([slot]) => slot));
}
