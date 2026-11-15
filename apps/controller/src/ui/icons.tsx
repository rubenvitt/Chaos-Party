import type { ReactElement } from 'react';
import type { IconName } from '../board/items.ts';
import { INK } from './color.ts';

/**
 * Kleine Symbole der Brettphase als Inline-SVG (CHAOS-22): keine Emoji (Schrift des
 * Geräts), keine Bilddateien, überall gleich. Gefüllte Symbole mit feiner dunkler Kontur
 * (lesbar auf Glas, CHAOS-59); reine Linien zeichnen in der Textfarbe (`currentColor`).
 */
const STROKE = {
  stroke: INK,
  strokeWidth: 1.6,
  strokeLinejoin: 'round',
  strokeLinecap: 'round',
} as const;

/** Linien ohne Füllung: in der Textfarbe des Knopfs, damit sie auf Glas sichtbar sind. */
const LINE = { ...STROKE, stroke: 'currentColor', strokeWidth: 2 } as const;

const SHAPES: Readonly<Record<IconName, ReactElement>> = {
  coin: (
    <>
      <circle cx="12" cy="12" r="9" fill="#ffd23f" {...STROKE} />
      <circle cx="12" cy="12" r="5" fill="none" {...STROKE} strokeWidth={1.6} />
    </>
  ),
  trophy: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="#ffd23f" {...STROKE} />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 4M17 6h2.5a2.5 2.5 0 0 1-2.5 4" fill="none" {...STROKE} />
      <path d="M12 14v3M8 20h8l-1-3H9z" fill="#ffd23f" {...STROKE} />
    </>
  ),
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#fff" {...STROKE} />
      <circle cx="8.5" cy="8.5" r="1.6" fill={INK} />
      <circle cx="12" cy="12" r="1.6" fill={INK} />
      <circle cx="15.5" cy="15.5" r="1.6" fill={INK} />
    </>
  ),
  'double-dice': (
    <>
      <rect x="9" y="2.5" width="12.5" height="12.5" rx="3" fill="#fff" {...STROKE} />
      <circle cx="12.5" cy="6" r="1.3" fill={INK} />
      <circle cx="18" cy="11.5" r="1.3" fill={INK} />
      <rect x="2.5" y="9" width="12.5" height="12.5" rx="3" fill="#ffd23f" {...STROKE} />
      <circle cx="6" cy="12.5" r="1.3" fill={INK} />
      <circle cx="8.75" cy="15.25" r="1.3" fill={INK} />
      <circle cx="11.5" cy="18" r="1.3" fill={INK} />
    </>
  ),
  'coin-steal': (
    <>
      <path d="M5 4v8a7 7 0 0 0 14 0V4h-4.5v8a2.5 2.5 0 0 1-5 0V4z" fill="#ff5a5f" {...STROKE} />
      <path d="M5 4h4.5v3.5H5zM14.5 4H19v3.5h-4.5z" fill="#e8e8f0" {...STROKE} />
    </>
  ),
  trap: (
    <>
      <path d="M3 17h18v3H3z" fill="#8a8aa0" {...STROKE} />
      <path d="M4 17l2.5-8 2.5 8 3-10 3 10 2.5-8 2.5 8z" fill="#e8e8f0" {...STROKE} />
    </>
  ),
  shield: (
    <>
      <path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="#7be0c3" {...STROKE} />
      <path d="M12 6v12" fill="none" {...STROKE} strokeWidth={1.6} />
    </>
  ),
  brace: (
    <>
      <circle cx="12" cy="5" r="2.5" fill="#fff" {...STROKE} />
      <path d="M12 7.5V20M8 11h8" fill="none" {...LINE} />
      <path d="M4.5 13.5a7.5 7.5 0 0 0 15 0" fill="none" {...LINE} />
    </>
  ),
  arrow: <path d="M3 9h10V4.5l8 7.5-8 7.5V15H3z" fill="#fff" {...STROKE} />,
  skip: <path d="M3 5l7 7-7 7zM12 5l7 7-7 7z" fill="#fff" {...STROKE} />,
  cancel: <path d="M6 6l12 12M18 6L6 18" fill="none" {...LINE} strokeWidth={3} />,
  star: (
    <path
      d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3-5.6-3-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"
      fill="#ffd23f"
      {...STROKE}
    />
  ),
};

interface IconProps {
  name: IconName;
  /** Kantenlänge in px. */
  size?: number;
  className?: string;
}

export function Icon({ name, size = 28, className }: IconProps) {
  return (
    <svg
      className={className === undefined ? 'icon' : `icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      {SHAPES[name]}
    </svg>
  );
}
