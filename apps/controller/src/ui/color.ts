/** Farbhilfen für Spielerfarben (rein, ohne DOM). */

/** Dunkle Konturfarbe des Spiels (wie im Host-HUD). */
export const INK = '#1b1530';
export const WHITE = '#ffffff';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Relative Leuchtdichte nach WCAG 2.x für `#RRGGBB`. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return 0;
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => parseInt(part ?? '0', 16));
  return 0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0);
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Textfarbe (Weiß oder Tinte) mit dem besseren Kontrast auf `background`. */
export function readableTextColor(background: string): string {
  return contrastRatio(background, WHITE) >= contrastRatio(background, INK) ? WHITE : INK;
}

/**
 * CSS-Variablen für einen Knopf in der Farbe eines Spielers (Ziel-Wahl, CHAOS-22):
 * `--choice` (Hintergrund) und `--on-choice` (lesbare Schrift). `null` = keine.
 */
export function slotColorVars(color: string | null): Record<string, string> | undefined {
  if (color === null) return undefined;
  return { '--choice': color, '--on-choice': readableTextColor(color) };
}
