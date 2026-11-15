/**
 * Bedien-Symbole für die Minispiel-Anleitung am PC: Joystick, Knopf A, Knopf B. Farbunabhängig
 * (Form + Buchstabe) und als SVG, damit sie überall gleich aussehen.
 */
const INK = '#1b1530';

export function JoystickIcon({ size = 56 }: { readonly size?: number }) {
  return (
    <svg
      className="minigame-icon"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="20" fill="#e9e4ff" stroke={INK} strokeWidth="3" />
      <path
        d="M24 8l-4 5h8z M24 40l-4-5h8z M8 24l5-4v8z M40 24l-5-4v8z"
        fill={INK}
        stroke={INK}
        strokeWidth="1"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="24" r="8" fill="#8f7bff" stroke={INK} strokeWidth="3" />
    </svg>
  );
}

export function ButtonIcon({
  letter,
  size = 56,
}: {
  readonly letter: 'A' | 'B';
  readonly size?: number;
}) {
  const fill = letter === 'A' ? '#ffd23f' : '#9be7ff';
  return (
    <svg
      className="minigame-icon"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <circle cx="24" cy="26" r="19" fill={INK} />
      <circle cx="24" cy="23" r="19" fill={fill} stroke={INK} strokeWidth="3" />
      <text
        x="24"
        y="31"
        textAnchor="middle"
        fontSize="24"
        fontWeight="900"
        fontFamily="'Nunito Variable', ui-rounded, sans-serif"
        fill={INK}
      >
        {letter}
      </text>
    </svg>
  );
}
