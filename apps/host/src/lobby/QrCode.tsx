import { useMemo } from 'react';
import { encode } from 'uqr';

interface QrCodeProps {
  readonly value: string;
  /** Kantenlänge in CSS-Pixeln. */
  readonly size: number;
}

/**
 * QR-Code als SVG im DOM (nicht im Babylon-Canvas): scharf in jeder Größe, ohne
 * Canvas-Kontext und ohne `innerHTML`. Fehlerkorrektur M (15 %) verträgt Spiegelungen
 * auf dem Monitor; Rand 4 Module nach Norm, damit Handy-Kameras ihn sicher finden.
 */
export function QrCode({ value, size }: QrCodeProps) {
  const qr = useMemo(() => encode(value, { ecc: 'M', border: 4 }), [value]);
  const path = useMemo(() => {
    let d = '';
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${String(x)} ${String(y)}h1v1h-1z`;
      });
    });
    return d;
  }, [qr]);

  return (
    <svg
      className="qr-code"
      role="img"
      aria-label={`QR-Code für ${value}`}
      data-testid="join-qr"
      data-value={value}
      width={size}
      height={size}
      viewBox={`0 0 ${String(qr.size)} ${String(qr.size)}`}
      shapeRendering="crispEdges"
    >
      <rect width={qr.size} height={qr.size} fill="#ffffff" />
      <path d={path} fill="#000000" />
    </svg>
  );
}
