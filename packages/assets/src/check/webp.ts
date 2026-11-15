/**
 * Minimaler WebP-Leser für die Asset-Prüfung (CHAOS-61): Container (RIFF/WEBP), Bildmaße und
 * ob ein Alphakanal vorhanden ist. Unterstützt die drei Formen aus der Spezifikation:
 * `VP8 ` (verlustbehaftet, ohne Alpha), `VP8L` (verlustfrei) und `VP8X` (erweitert, z. B.
 * verlustbehaftet mit `ALPH`-Chunk, so schreibt Blender RGBA-WebP).
 */

export class WebpError extends Error {}

export interface WebpInfo {
  readonly format: 'VP8' | 'VP8L' | 'VP8X';
  readonly width: number;
  readonly height: number;
  readonly alpha: boolean;
}

function fourCc(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}

export function webpInfo(bytes: Uint8Array): WebpInfo {
  if (bytes.byteLength < 30) throw new WebpError('Datei zu kurz');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (fourCc(bytes, 0) !== 'RIFF' || fourCc(bytes, 8) !== 'WEBP') {
    throw new WebpError('kein RIFF/WEBP-Container');
  }
  const riffSize = view.getUint32(4, true);
  if (riffSize + 8 !== bytes.byteLength) {
    throw new WebpError(
      `RIFF-Größe ${String(riffSize + 8)} passt nicht zur Datei (${String(bytes.byteLength)})`,
    );
  }
  const chunk = fourCc(bytes, 12);
  switch (chunk) {
    case 'VP8X': {
      const flags = bytes[20] ?? 0;
      const width = 1 + ((bytes[24] ?? 0) | ((bytes[25] ?? 0) << 8) | ((bytes[26] ?? 0) << 16));
      const height = 1 + ((bytes[27] ?? 0) | ((bytes[28] ?? 0) << 8) | ((bytes[29] ?? 0) << 16));
      return { format: 'VP8X', width, height, alpha: (flags & 0x10) !== 0 };
    }
    case 'VP8L': {
      if (bytes[20] !== 0x2f) throw new WebpError('VP8L-Signatur fehlt');
      const bits = view.getUint32(21, true);
      return {
        format: 'VP8L',
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
        alpha: ((bits >>> 28) & 1) === 1,
      };
    }
    case 'VP8 ': {
      if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
        throw new WebpError('VP8-Startcode fehlt');
      }
      return {
        format: 'VP8',
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
        alpha: false,
      };
    }
    default:
      throw new WebpError(`unbekannter Bild-Chunk „${chunk}“`);
  }
}
