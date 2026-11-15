/**
 * Radiance-HDR (RGBE) lesen und schreiben (CHAOS-62): für die Asset-Prüfung (gültige Datei,
 * Maße) und für den Import der Poly-Haven-Himmel, die wir auf 512 × 256 verkleinern. Rein in
 * TypeScript, ohne Bildbibliothek: ImageMagick ohne HDRI-Unterstützung würde Werte über 1
 * (die Sonne!) abschneiden.
 *
 * Unterstützt das Format, das Poly Haven und Babylon benutzen: `FORMAT=32-bit_rle_rgbe`,
 * Ausrichtung `-Y <h> +X <w>`, Zeilen unkomprimiert oder mit „neuer“ Lauflängenkodierung.
 */

export class HdrError extends Error {}

export interface HdrImage {
  readonly width: number;
  readonly height: number;
  /** Lineare Farbwerte, RGB je Pixel, Zeile für Zeile von oben. */
  readonly data: Float32Array;
}

export interface HdrInfo {
  readonly width: number;
  readonly height: number;
  /** Größter Kanalwert (Sonne, wichtig für Umgebungslicht und Sonnenrichtung). */
  readonly peak: number;
}

function readHeader(bytes: Uint8Array): { width: number; height: number; offset: number } {
  let offset = 0;
  const line = (): string => {
    const start = offset;
    while (offset < bytes.length && bytes[offset] !== 0x0a) offset++;
    if (offset >= bytes.length) throw new HdrError('Kopfzeile ohne Zeilenende');
    const text = String.fromCharCode(...bytes.subarray(start, offset));
    offset++;
    return text;
  };
  const magic = line();
  if (!magic.startsWith('#?')) throw new HdrError('kein Radiance-Kopf (#?)');
  let format = '';
  for (;;) {
    const text = line();
    if (text === '') break;
    if (text.startsWith('FORMAT=')) format = text.slice('FORMAT='.length);
  }
  if (format !== '32-bit_rle_rgbe') throw new HdrError(`Format „${format}“ nicht unterstützt`);
  const size = /^-Y (\d+) \+X (\d+)$/.exec(line());
  if (!size) throw new HdrError('Ausrichtung nicht unterstützt (erwartet „-Y h +X w“)');
  const height = Number(size[1]);
  const width = Number(size[2]);
  if (width < 1 || height < 1 || width > 32767) throw new HdrError('ungültige Bildmaße');
  return { width, height, offset };
}

/** Liest eine Radiance-HDR-Datei in lineare Fließkommawerte. */
export function decodeHdr(bytes: Uint8Array): HdrImage {
  const { width, height, offset: start } = readHeader(bytes);
  const data = new Float32Array(width * height * 3);
  const scan = new Uint8Array(width * 4);
  let offset = start;
  const byte = (): number => {
    const value = bytes[offset];
    if (value === undefined) throw new HdrError('Datei endet mitten im Bild');
    offset++;
    return value;
  };
  for (let y = 0; y < height; y++) {
    const rle =
      width >= 8 && width < 32768 && bytes[offset] === 2 && bytes[offset + 1] === 2
        ? ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
        : -1;
    if (rle === width) {
      offset += 4;
      for (let channel = 0; channel < 4; channel++) {
        let x = 0;
        while (x < width) {
          let count = byte();
          if (count > 128) {
            count -= 128;
            const value = byte();
            if (x + count > width) throw new HdrError('Lauflänge über das Zeilenende');
            for (let k = 0; k < count; k++) scan[x++ * 4 + channel] = value;
          } else {
            if (count === 0 || x + count > width) throw new HdrError('ungültige Lauflänge');
            for (let k = 0; k < count; k++) scan[x++ * 4 + channel] = byte();
          }
        }
      }
    } else {
      for (let x = 0; x < width * 4; x++) scan[x] = byte();
    }
    for (let x = 0; x < width; x++) {
      const e = scan[x * 4 + 3] ?? 0;
      const f = e === 0 ? 0 : Math.pow(2, e - 136);
      const out = (y * width + x) * 3;
      data[out] = (scan[x * 4] ?? 0) * f;
      data[out + 1] = (scan[x * 4 + 1] ?? 0) * f;
      data[out + 2] = (scan[x * 4 + 2] ?? 0) * f;
    }
  }
  return { width, height, data };
}

function toRgbe(r: number, g: number, b: number, out: Uint8Array, at: number): void {
  const max = Math.max(r, g, b);
  if (max < 1e-32) {
    out[at] = out[at + 1] = out[at + 2] = out[at + 3] = 0;
    return;
  }
  const exponent = Math.ceil(Math.log2(max * (1 + 1e-7)));
  const scale = 256 / Math.pow(2, exponent);
  out[at] = Math.min(255, Math.floor(r * scale));
  out[at + 1] = Math.min(255, Math.floor(g * scale));
  out[at + 2] = Math.min(255, Math.floor(b * scale));
  out[at + 3] = exponent + 128;
}

/** Ein Kanal einer Zeile mit Lauflängen (Läufe ≥ 3 gleiche Bytes, sonst Literale). */
function encodeChannel(values: Uint8Array, out: number[]): void {
  let x = 0;
  while (x < values.length) {
    let run = 1;
    while (x + run < values.length && run < 127 && values[x + run] === values[x]) run++;
    if (run >= 3) {
      out.push(128 + run, values[x] ?? 0);
      x += run;
      continue;
    }
    const begin = x;
    let count = 0;
    while (x < values.length && count < 128) {
      if (x + 2 < values.length && values[x] === values[x + 1] && values[x] === values[x + 2]) {
        break;
      }
      x++;
      count++;
    }
    out.push(count);
    for (let k = begin; k < begin + count; k++) out.push(values[k] ?? 0);
  }
}

/** Schreibt eine Radiance-HDR-Datei mit Lauflängenkodierung je Zeile. */
export function encodeHdr(image: HdrImage): Uint8Array {
  const { width, height, data } = image;
  if (width < 8 || width >= 32768) throw new HdrError('Breite für Lauflängen nicht geeignet');
  const out: number[] = [];
  for (const ch of `#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${String(height)} +X ${String(width)}\n`) {
    out.push(ch.charCodeAt(0));
  }
  const rgbe = new Uint8Array(width * 4);
  const channel = new Uint8Array(width);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = (y * width + x) * 3;
      toRgbe(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0, rgbe, x * 4);
    }
    out.push(2, 2, width >> 8, width & 0xff);
    for (let c = 0; c < 4; c++) {
      for (let x = 0; x < width; x++) channel[x] = rgbe[x * 4 + c] ?? 0;
      encodeChannel(channel, out);
    }
  }
  return Uint8Array.from(out);
}

/** Verkleinert um einen ganzzahligen Faktor (Mittelwert der Pixel, Energie bleibt erhalten). */
export function downsampleHdr(image: HdrImage, factor: number): HdrImage {
  if (!Number.isInteger(factor) || factor < 1) throw new HdrError('Faktor muss ganzzahlig sein');
  if (image.width % factor !== 0 || image.height % factor !== 0) {
    throw new HdrError('Bildmaße nicht durch den Faktor teilbar');
  }
  const width = image.width / factor;
  const height = image.height / factor;
  const data = new Float32Array(width * height * 3);
  const weight = 1 / (factor * factor);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            sum += image.data[((y * factor + dy) * image.width + x * factor + dx) * 3 + c] ?? 0;
          }
        }
        data[(y * width + x) * 3 + c] = sum * weight;
      }
    }
  }
  return { width, height, data };
}

/** Prüft eine HDR-Datei vollständig (dekodierbar) und liefert Maße und Spitzenwert. */
export function hdrInfo(bytes: Uint8Array): HdrInfo {
  const image = decodeHdr(bytes);
  let peak = 0;
  for (const value of image.data) if (value > peak) peak = value;
  return { width: image.width, height: image.height, peak };
}
