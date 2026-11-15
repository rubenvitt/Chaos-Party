/**
 * Grafikstufen des Natur-Looks (CHAOS-62): Grasmenge, Umgebungsverdeckung (SSAO),
 * Tiefenunschärfe, Kantenglättung und Schattenauflösung. Rein, ohne Babylon.
 *
 * - Start: `?qualitaet=hoch|mittel|niedrig` (fest, keine Automatik) oder `hoch` mit Automatik.
 * - Automatik (`AdaptiveQuality`): Liegt die Bildrate über ein Messfenster unter
 *   {@link ADAPT.minFps}, geht es eine Stufe nach unten. Nach oben geht es nie automatisch
 *   (kein Pendeln zwischen Stufen mitten im Spiel).
 * - Sparstufe `minimal`: im Testmodus und wenn der Browser per Software rendert (SwiftShader,
 *   llvmpipe …, z. B. ohne Grafiktreiber). Wenig Gras, kein HDRI-Umgebungslicht, keine
 *   Nachbearbeitung – die Screenshots der Tests zeigen den Look, nicht die volle Pracht.
 */

export const QUALITY_LEVELS = ['hoch', 'mittel', 'niedrig'] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number] | 'minimal';

export interface QualitySettings {
  /** Anteil der Grashalme (Bezug: die Halmzahl der Szene bei `hoch`). */
  readonly grass: number;
  readonly ssao: boolean;
  readonly depthOfField: boolean;
  /** MSAA-Proben der Nachbearbeitung (1 = aus). */
  readonly msaa: number;
  readonly bloom: boolean;
  /** Kantenlänge der Schattenkarte; nur beim Aufbau wirksam. */
  readonly shadowMapSize: number;
  /** Weiche Kontaktschatten (PCSS) statt einfacher Filterung; nur beim Aufbau wirksam. */
  readonly softShadows: boolean;
  /** Kantenlänge der vorgefilterten Umgebungs-Würfeltextur; nur beim Aufbau wirksam. */
  readonly environmentSize: number;
  /**
   * Nachbearbeitung als eigene Durchgänge (Bloom, Schärfe, Korn, Vignette). Ohne sie macht die
   * Farbabstimmung (ACES, Belichtung, Kontrast) der Material-Shader selbst – deutlich billiger.
   */
  readonly postProcess: boolean;
  /** Schattenkarte überhaupt rendern; nur beim Aufbau wirksam. */
  readonly shadows: boolean;
  /** Umgebungslicht und Himmel aus dem HDRI (sonst Halbkugellicht); nur beim Aufbau wirksam. */
  readonly environment: boolean;
  /**
   * Feine Materialdetails: Normalen- und AO/Rauheit-Karten, Klarlack, durchscheinendes Laub
   * (sonst nur die Farbtextur); nur beim Aufbau wirksam.
   */
  readonly materialDetail: boolean;
}

export const QUALITY: Readonly<Record<QualityLevel, QualitySettings>> = {
  hoch: {
    grass: 1,
    ssao: true,
    depthOfField: true,
    msaa: 4,
    bloom: true,
    shadowMapSize: 4096,
    softShadows: true,
    environmentSize: 256,
    postProcess: true,
    shadows: true,
    environment: true,
    materialDetail: true,
  },
  mittel: {
    grass: 0.55,
    ssao: false,
    depthOfField: true,
    msaa: 4,
    bloom: true,
    shadowMapSize: 2048,
    softShadows: true,
    environmentSize: 256,
    postProcess: true,
    shadows: true,
    environment: true,
    materialDetail: true,
  },
  niedrig: {
    grass: 0.25,
    ssao: false,
    depthOfField: false,
    msaa: 1,
    bloom: false,
    shadowMapSize: 1024,
    softShadows: false,
    environmentSize: 128,
    postProcess: true,
    shadows: true,
    environment: true,
    materialDetail: true,
  },
  minimal: {
    grass: 0.08,
    ssao: false,
    depthOfField: false,
    msaa: 1,
    bloom: true,
    shadowMapSize: 1024,
    softShadows: false,
    environmentSize: 64,
    postProcess: false,
    shadows: true,
    environment: false,
    materialDetail: false,
  },
};

export function parseQualityLevel(value: string | null): QualityLevel | null {
  return value === 'minimal' || (QUALITY_LEVELS as readonly string[]).includes(value ?? '')
    ? (value as QualityLevel)
    : null;
}

/** Nächstniedrigere Stufe (oder `null` am Boden bzw. im Testmodus). */
export function lowerLevel(level: QualityLevel): QualityLevel | null {
  if (level === 'minimal') return null;
  const index = QUALITY_LEVELS.indexOf(level);
  return QUALITY_LEVELS[index + 1] ?? null;
}

export const ADAPT = {
  /** Unter dieser mittleren Bildrate wird abgestuft. */
  minFps: 45,
  /** Länge des Messfensters (ms). */
  windowMs: 3000,
  /** Nach Start und nach jedem Wechsel so lange nicht messen (Shader, Aufbau, Ladezeiten). */
  settleMs: 4000,
  /** Lücken über diesem Wert (Tab im Hintergrund) zählen nicht als Frame. */
  pauseMs: 500,
} as const;

export interface AdaptiveQuality {
  readonly level: QualityLevel;
  /** Ein Bild hat `frameMs` gedauert; liefert die neue Stufe, wenn abgestuft wird. */
  frame(frameMs: number): QualityLevel | null;
}

/**
 * Automatik: misst Bildabstände in Fenstern von {@link ADAPT.windowMs} und stuft ab, wenn
 * die mittlere Bildrate eines Fensters unter {@link ADAPT.minFps} liegt.
 */
export function createAdaptiveQuality(start: QualityLevel, automatic: boolean): AdaptiveQuality {
  let level = start;
  let settle: number = ADAPT.settleMs;
  let windowMs = 0;
  let frames = 0;
  return {
    get level() {
      return level;
    },
    frame(frameMs) {
      if (!automatic || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > ADAPT.pauseMs) {
        return null;
      }
      if (settle > 0) {
        settle -= frameMs;
        return null;
      }
      windowMs += frameMs;
      frames += 1;
      if (windowMs < ADAPT.windowMs) return null;
      const fps = (frames * 1000) / windowMs;
      windowMs = 0;
      frames = 0;
      if (fps >= ADAPT.minFps) return null;
      const next = lowerLevel(level);
      if (!next) return null;
      level = next;
      settle = ADAPT.settleMs;
      return next;
    },
  };
}

/** Rendert der Browser ohne echte GPU (Software-Rasterizer)? Dann nur die Sparstufe. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /swiftshader|llvmpipe|softpipe|software|basic render driver/i.test(renderer);
}
