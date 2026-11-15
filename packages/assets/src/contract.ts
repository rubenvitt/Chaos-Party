/**
 * Figuren-Vertrag aus Sicht der Assets (gleich `CharacterHandle`/`CHARACTER_ANIMATIONS` im
 * minigame-sdk und `CHARACTER_IDS` in dessen `info.ts`; ein Test hält beides gleich). Hier
 * dupliziert, damit Generator und Prüfskript ohne Build in Node laufen.
 */
export const CHARACTER_IDS = ['robot', 'cactus', 'raccoon', 'sock'] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_ANIMATIONS = ['idle', 'run', 'jump', 'hit', 'cheer', 'sad', 'fall'] as const;
export type CharacterAnimation = (typeof CHARACTER_ANIMATIONS)[number];

/** Maßstab: Füße bei y = 0, Höhe 1,4–1,8, Grundfläche im Kreis mit Radius 0,5. */
export const CHARACTER_SCALE = {
  minHeight: 1.4,
  maxHeight: 1.8,
  footprintRadius: 0.5,
  /** Toleranz für „Füße bei y = 0“ und für die Höhe im Manifest. */
  tolerance: 0.02,
} as const;

/** Material, das der Host in die Slot-Farbe färbt. */
export const ACCENT_MATERIAL = 'akzent';
/** Leerer Knoten an der Brust, an den der Host das Slot-Abzeichen hängt. */
export const BADGE_NODE = 'abzeichen';

/**
 * Porträts (CHAOS-61): `textures/portraits/<id>.webp` (Akzent weiß gerendert) und
 * `<id>-akzent.webp` (Alpha = sichtbarer Akzent). Quadratisch, mindestens `minSize` Pixel.
 */
export const PORTRAIT = {
  dir: 'textures/portraits',
  accentSuffix: '-akzent',
  minSize: 256,
} as const;
