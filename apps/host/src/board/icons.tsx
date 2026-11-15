/**
 * Kleine SVG-Symbole für den Brett-HUD (Trophäe, Münze, Items). Bewusst SVG statt Emoji:
 * sieht auf jedem System gleich aus (stabile Screenshots) und bleibt in Farbe/Form lesbar.
 */
import type { ItemKindName } from '@chaos-party/protocol';

const INK = '#1b1530';

interface IconProps {
  readonly size?: number;
}

export function TrophyIcon({ size = 22 }: IconProps) {
  return (
    <svg className="board-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M7 3h10v4a5 5 0 0 1-10 0V3Z M7 5H4a3 3 0 0 0 3 4 M17 5h3a3 3 0 0 1-3 4 M12 12v4 M8 21h8l-1-5H9l-1 5Z"
        fill="#ffc83d"
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CoinIcon({ size = 22 }: IconProps) {
  return (
    <svg className="board-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="#ffd23f" stroke={INK} strokeWidth="2" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="#c99400" strokeWidth="2" />
    </svg>
  );
}

export function ItemIcon({ item, size = 22 }: IconProps & { readonly item: ItemKindName }) {
  const common = { stroke: INK, strokeWidth: 2, strokeLinejoin: 'round' as const };
  return (
    <svg className="board-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {item === 'double-dice' && (
        <>
          <rect x="2" y="7" width="12" height="12" rx="3" fill="#fff" {...common} />
          <rect x="10" y="3" width="12" height="12" rx="3" fill="#fff" {...common} />
          <circle cx="14" cy="7" r="1.4" fill={INK} />
          <circle cx="18" cy="11" r="1.4" fill={INK} />
          <circle cx="8" cy="13" r="1.4" fill={INK} />
        </>
      )}
      {item === 'coin-steal' && (
        <>
          <circle cx="9" cy="13" r="7" fill="#ffd23f" {...common} />
          <path d="M14 6l7-3M17 2l4 1-1 4" fill="none" {...common} />
        </>
      )}
      {item === 'trap' && (
        <path d="M2 20 5 10 8 20 11 10 14 20 17 10 20 20 22 20H2Z" fill="#9aa0b5" {...common} />
      )}
      {item === 'shield' && (
        <path d="M12 2 20 5v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3Z" fill="#5aa9ff" {...common} />
      )}
    </svg>
  );
}
