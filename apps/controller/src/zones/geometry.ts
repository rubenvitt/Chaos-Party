/**
 * Geometrie des geteilten iPads (CHAOS-13, ADR-008): Spielerzonen und ihre
 * Bedienelemente als Rechtecke. Reine Funktionen ohne DOM.
 *
 * Dieselben Rechtecke dienen der Darstellung (absolut positioniert) **und** der
 * Trefferprüfung im Zonen-Tracker – was man sieht, ist genau das, was reagiert.
 *
 * Koordinaten:
 * - **Bildschirm**: Pixel relativ zur linken oberen Ecke der Spielfläche (CSS-px, y nach unten).
 * - **Zonen-lokal**: Pixel im Inhalt der Zone, *vor* ihrer Drehung. Eine um 180° gedrehte
 *   Zone (Spieler sitzt gegenüber) hat ihr lokales „oben“ auf dem Bildschirm unten.
 */
import type { Action, Button, Layout, SlotNumber } from '@chaos-party/protocol';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Drehung des Zoneninhalts im Uhrzeigersinn (CSS `rotate`). */
export type Rotation = 0 | 90 | 180 | 270;

/** Lage einer Spielerzone auf dem Bildschirm. */
export interface ZoneFrame {
  readonly slot: SlotNumber;
  /** Position in der Sitzreihenfolge (0 = erster Spieler aus `welcome`). */
  readonly index: number;
  /** Rechteck auf dem Bildschirm. */
  readonly rect: Rect;
  /** Drehung des Inhalts, damit er zur Person an dieser Kante zeigt. */
  readonly rotation: Rotation;
}

export type ControlKind = 'stick' | 'button-a' | 'button-b' | 'ready';

/** Ein Bedienelement in Zonen-lokalen Koordinaten. */
export interface ControlGeometry {
  readonly kind: ControlKind;
  /** Sichtbare Fläche. */
  readonly rect: Rect;
  /** Reagierende Fläche (Knöpfe etwas großzügiger als sichtbar). */
  readonly hit: Rect;
}

/** Vollständige Zone: Lage, lokale Größe, Bedienelemente. */
export interface ZoneGeometry extends ZoneFrame {
  /** Größe des Inhalts vor der Drehung (bei 90°/270° Breite und Höhe vertauscht). */
  readonly local: Size;
  /** Prüfreihenfolge: Knöpfe vor dem Joystick-Feld. */
  readonly controls: readonly ControlGeometry[];
  /** Radius des Joystick-Rings in px (voller Ausschlag). */
  readonly stickRadius: number;
}

/** Toter Streifen zwischen zwei Zonen: Berührungen dort gehören niemandem. */
export const ZONE_GUTTER = 16;

/** Abstand der Bedienelemente zum Zonenrand (Systemgesten vom Bildschirmrand, A3). */
export const ZONE_PADDING = 20;

/** Höhe des Plakettenstreifens oben in jeder Zone (nicht bedienbar). */
export const BADGE_STRIP = 78;

/** Zusätzliche Trefferfläche um Knöpfe. */
export const HIT_SLOP = 10;

/** Höchstzahl Zonen auf einem iPad (VISION: 2–4 Spieler). */
export const MAX_ZONES = 4;

export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function inflate(rect: Rect, by: number): Rect {
  return {
    x: rect.x - by,
    y: rect.y - by,
    width: rect.width + 2 * by,
    height: rect.height + 2 * by,
  };
}

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Größe des Inhalts vor der Drehung. */
export function localSize(rect: Rect, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270
    ? { width: rect.height, height: rect.width }
    : { width: rect.width, height: rect.height };
}

/** Exakte Kosinus/Sinus-Werte für Vielfache von 90° (keine Rundungsfehler). */
function cosSin(rotation: Rotation): [number, number] {
  switch (rotation) {
    case 0:
      return [1, 0];
    case 90:
      return [0, 1];
    case 180:
      return [-1, 0];
    case 270:
      return [0, -1];
  }
}

function clean(value: number): number {
  return value === 0 ? 0 : value;
}

/**
 * Bildschirm-Versatz → lokaler Versatz (Drehung rückgängig machen).
 * Beispiel 180°: Finger nach oben auf dem Bildschirm = für die gegenübersitzende
 * Person nach unten.
 */
export function deltaToLocal(rotation: Rotation, dx: number, dy: number): Point {
  const [cos, sin] = cosSin(rotation);
  // Inverse Drehung um −θ (Bildschirm-y zeigt nach unten, CSS dreht im Uhrzeigersinn).
  return { x: clean(dx * cos + dy * sin), y: clean(-dx * sin + dy * cos) };
}

/** Lokaler Versatz → Bildschirm-Versatz. */
export function deltaToScreen(rotation: Rotation, dx: number, dy: number): Point {
  const [cos, sin] = cosSin(rotation);
  return { x: clean(dx * cos - dy * sin), y: clean(dx * sin + dy * cos) };
}

/** Bildschirmpunkt → Zonen-lokaler Punkt. */
export function toLocal(zone: ZoneFrame, point: Point): Point {
  const center = rectCenter(zone.rect);
  const local = localSize(zone.rect, zone.rotation);
  const d = deltaToLocal(zone.rotation, point.x - center.x, point.y - center.y);
  return { x: d.x + local.width / 2, y: d.y + local.height / 2 };
}

/** Zonen-lokaler Punkt → Bildschirmpunkt. */
export function toScreen(zone: ZoneFrame, point: Point): Point {
  const center = rectCenter(zone.rect);
  const local = localSize(zone.rect, zone.rotation);
  const d = deltaToScreen(zone.rotation, point.x - local.width / 2, point.y - local.height / 2);
  return { x: d.x + center.x, y: d.y + center.y };
}

/**
 * Ordnet die Spielerzonen auf dem Bildschirm an.
 *
 * - 1 Platz: ganze Fläche.
 * - 2 Plätze, Querformat: links | rechts, beide aufrecht (nebeneinander an der langen Kante).
 * - 2 Plätze, Hochformat: unten (aufrecht) und oben (180°, Person sitzt gegenüber).
 * - 3–4 Plätze: 2×2-Raster; untere Reihe aufrecht, obere Reihe 180°. Reihenfolge im
 *   Uhrzeigersinn um den Tisch: unten links, unten rechts, oben rechts, oben links.
 *   Bei drei Plätzen bleibt oben links frei.
 *
 * Zwischen den Zonen liegt ein toter Streifen von {@link ZONE_GUTTER} px.
 */
export function arrangeZones(slots: readonly SlotNumber[], viewport: Size): ZoneFrame[] {
  const used = slots.slice(0, MAX_ZONES);
  const { width: w, height: h } = viewport;
  if (used.length === 0 || !(w > 0) || !(h > 0)) return [];
  const g = ZONE_GUTTER;
  const halfW = (w - g) / 2;
  const halfH = (h - g) / 2;
  const left: Rect = { x: 0, y: 0, width: halfW, height: h };
  const right: Rect = { x: halfW + g, y: 0, width: halfW, height: h };
  const top: Rect = { x: 0, y: 0, width: w, height: halfH };
  const bottom: Rect = { x: 0, y: halfH + g, width: w, height: halfH };

  let cells: { rect: Rect; rotation: Rotation }[];
  if (used.length === 1) {
    cells = [{ rect: { x: 0, y: 0, width: w, height: h }, rotation: 0 }];
  } else if (used.length === 2) {
    cells =
      w >= h
        ? [
            { rect: left, rotation: 0 },
            { rect: right, rotation: 0 },
          ]
        : [
            { rect: bottom, rotation: 0 },
            { rect: top, rotation: 180 },
          ];
  } else {
    const bottomY = halfH + g;
    cells = [
      { rect: { x: 0, y: bottomY, width: halfW, height: halfH }, rotation: 0 },
      { rect: { x: halfW + g, y: bottomY, width: halfW, height: halfH }, rotation: 0 },
      { rect: { x: halfW + g, y: 0, width: halfW, height: halfH }, rotation: 180 },
      { rect: { x: 0, y: 0, width: halfW, height: halfH }, rotation: 180 },
    ];
  }

  return used.map((slot, index) => {
    const cell = cells[index];
    if (!cell) throw new Error('Zonenraster zu klein');
    return { slot, index, rect: cell.rect, rotation: cell.rotation };
  });
}

/** Was eine Zone gerade anzeigen soll (aus dem Server-Kontext abgeleitet). */
export interface ZoneControlsInput {
  readonly layout: Layout;
  readonly actions: readonly Action[];
  /** `ready` wurde schon gesendet: Knopf ausblenden (wie `LobbyPanel`). */
  readonly readySent?: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Durchmesser von A und B für eine Knopffläche. */
export function buttonDiameters(area: Size): { a: number; b: number } {
  const a = clamp(Math.min(area.width, area.height) * 0.46, 88, 140);
  return { a, b: Math.max(76, Math.round(a * 0.8)) };
}

function circle(center: Point, diameter: number): Rect {
  return {
    x: center.x - diameter / 2,
    y: center.y - diameter / 2,
    width: diameter,
    height: diameter,
  };
}

function control(kind: ControlKind, rect: Rect, slop = 0): ControlGeometry {
  return { kind, rect, hit: slop > 0 ? inflate(rect, slop) : rect };
}

/**
 * Bedienelemente einer Zone in lokalen Koordinaten.
 *
 * - `lobby` mit `ready` (noch nicht gesendet): großer Bereit-Knopf in der Mitte.
 * - `joystick-buttons`: Joystick-Feld und A/B. Breite Zonen wie ein Gamepad
 *   (Joystick links, Knöpfe rechts), hohe Zonen wie das iPhone im Hochformat
 *   (Knöpfe oben, Joystick unten).
 * - sonst (`wait`, Lobby nach „Bereit!“): keine Bedienelemente.
 */
export function layoutZoneControls(local: Size, input: ZoneControlsInput): ControlGeometry[] {
  const p = ZONE_PADDING;
  const area: Rect = {
    x: p,
    y: BADGE_STRIP,
    width: Math.max(0, local.width - 2 * p),
    height: Math.max(0, local.height - BADGE_STRIP - p),
  };
  if (area.width <= 0 || area.height <= 0) return [];

  if (input.layout === 'lobby') {
    if (!input.actions.includes('ready') || input.readySent === true) return [];
    const width = Math.min(300, area.width);
    const height = Math.min(112, area.height);
    const center = rectCenter(area);
    return [
      control(
        'ready',
        { x: center.x - width / 2, y: center.y - height / 2, width, height },
        HIT_SLOP,
      ),
    ];
  }

  if (input.layout !== 'joystick-buttons') return [];

  const buttons = (['a', 'b'] as const satisfies readonly Button[]).filter((button) =>
    input.actions.includes(button === 'a' ? 'button-a' : 'button-b'),
  );
  const canMove = input.actions.includes('move');
  const wide = area.width >= area.height * 1.15;
  const gap = 16;

  let stickArea: Rect;
  let buttonArea: Rect;
  if (wide) {
    const stickWidth = buttons.length > 0 ? (area.width - gap) * 0.56 : area.width;
    stickArea = { x: area.x, y: area.y, width: stickWidth, height: area.height };
    buttonArea = {
      x: area.x + stickWidth + gap,
      y: area.y,
      width: area.width - stickWidth - gap,
      height: area.height,
    };
  } else {
    const buttonHeight = canMove ? (area.height - gap) * 0.44 : area.height;
    buttonArea = { x: area.x, y: area.y, width: area.width, height: buttonHeight };
    stickArea = {
      x: area.x,
      y: area.y + buttonHeight + gap,
      width: area.width,
      height: area.height - buttonHeight - gap,
    };
  }
  if (!canMove) buttonArea = area;
  if (buttons.length === 0) stickArea = area;

  const result: ControlGeometry[] = [];
  if (buttons.length > 0) {
    const d = buttonDiameters(buttonArea);
    if (buttons.length === 1) {
      const only = buttons[0] === 'a' ? 'button-a' : 'button-b';
      result.push(
        control(only, circle(rectCenter(buttonArea), only === 'button-a' ? d.a : d.b), HIT_SLOP),
      );
    } else {
      // Wie das iPhone: A unten links (Daumenruhe), B oben rechts.
      const c = rectCenter(buttonArea);
      // Diagonal versetzt, A bleibt ganz in der Knopffläche; die Trefferflächen
      // (inklusive Zugabe) überlappen nicht (unit-getestet für iPad-Größen).
      const spreadX = Math.max(0, Math.min(buttonArea.width / 2 - d.a / 2, d.a * 0.62));
      const spreadY = Math.max(0, Math.min(buttonArea.height / 2 - d.a / 2, d.a * 0.62));
      result.push(
        control('button-a', circle({ x: c.x - spreadX, y: c.y + spreadY }, d.a), HIT_SLOP),
        control('button-b', circle({ x: c.x + spreadX, y: c.y - spreadY }, d.b), HIT_SLOP),
      );
    }
  }
  if (canMove) result.push(control('stick', stickArea));
  return result;
}

/** Radius des Joystick-Rings passend zur Zonengröße. */
export function stickRadiusFor(local: Size): number {
  return Math.round(clamp(Math.min(local.width, local.height) * 0.17, 56, 85));
}

/** Zonen samt Bedienelementen für Plätze, Bildschirmgröße und Kontexte. */
export function buildZones(
  slots: readonly SlotNumber[],
  viewport: Size,
  inputFor: (slot: SlotNumber) => ZoneControlsInput,
): ZoneGeometry[] {
  return arrangeZones(slots, viewport).map((frame) => {
    const local = localSize(frame.rect, frame.rotation);
    return {
      ...frame,
      local,
      controls: layoutZoneControls(local, inputFor(frame.slot)),
      stickRadius: stickRadiusFor(local),
    };
  });
}

/** Zone, in der ein Bildschirmpunkt liegt (Randstreifen → `null`). */
export function zoneAt<Z extends ZoneFrame>(zones: readonly Z[], point: Point): Z | null {
  return zones.find((zone) => rectContains(zone.rect, point)) ?? null;
}

/** Bedienelement unter einem lokalen Punkt (Reihenfolge = Priorität). */
export function controlAt(zone: ZoneGeometry, local: Point): ControlGeometry | null {
  return zone.controls.find((c) => rectContains(c.hit, local)) ?? null;
}

/** Gleiche Lage und Drehung (Bedienelemente dürfen sich unterscheiden). */
export function sameFrame(a: ZoneFrame, b: ZoneFrame): boolean {
  return a.slot === b.slot && a.rotation === b.rotation && rectsEqual(a.rect, b.rect);
}
