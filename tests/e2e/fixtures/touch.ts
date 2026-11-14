/**
 * Echte Touch-Ereignisse per Chrome DevTools Protocol (nur Chromium).
 *
 * `page.touchscreen` kann nur tippen; für Ziehen und mehrere gleichzeitige Finger
 * schicken wir `Input.dispatchTouchEvent`. Chromium erzeugt daraus Touch- **und**
 * Pointer-Events (`pointerType: 'touch'`) samt `touch-action`-Verhalten – also
 * dasselbe, was der Controller auf dem iPhone verarbeitet.
 */
import type { CDPSession, Locator, Page } from '@playwright/test';

export interface Point {
  x: number;
  y: number;
}

export class TouchScreen {
  private readonly active = new Map<number, Point>();

  private constructor(private readonly cdp: CDPSession) {}

  static async create(page: Page): Promise<TouchScreen> {
    return new TouchScreen(await page.context().newCDPSession(page));
  }

  private async dispatch(type: 'touchStart' | 'touchMove' | 'touchEnd') {
    const touchPoints =
      type === 'touchEnd'
        ? []
        : [...this.active.entries()].map(([id, p]) => ({
            id,
            x: p.x,
            y: p.y,
            radiusX: 8,
            radiusY: 8,
          }));
    await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  }

  /** Finger `id` setzt bei `point` auf (andere Finger bleiben liegen). */
  async down(id: number, point: Point) {
    this.active.set(id, point);
    await this.dispatch('touchStart');
  }

  /** Finger `id` gleitet in `steps` Schritten nach `to`. */
  async move(id: number, to: Point, steps = 8) {
    const from = this.active.get(id);
    if (!from) throw new Error(`Finger ${String(id)} liegt nicht auf`);
    for (let i = 1; i <= steps; i++) {
      this.active.set(id, {
        x: from.x + ((to.x - from.x) * i) / steps,
        y: from.y + ((to.y - from.y) * i) / steps,
      });
      await this.dispatch('touchMove');
    }
  }

  /**
   * Mehrere Finger gleiten **gleichzeitig**: Jeder Schritt ist ein einziges `touchMove`
   * mit allen bewegten Fingern (wie zwei Daumen, die zur selben Zeit schieben; CHAOS-14).
   */
  async moveAll(targets: ReadonlyMap<number, Point>, steps = 8) {
    const starts = new Map<number, Point>();
    for (const id of targets.keys()) {
      const from = this.active.get(id);
      if (!from) throw new Error(`Finger ${String(id)} liegt nicht auf`);
      starts.set(id, from);
    }
    for (let i = 1; i <= steps; i++) {
      for (const [id, to] of targets) {
        const from = starts.get(id) ?? to;
        this.active.set(id, {
          x: from.x + ((to.x - from.x) * i) / steps,
          y: from.y + ((to.y - from.y) * i) / steps,
        });
      }
      await this.dispatch('touchMove');
    }
  }

  /**
   * Finger `id` hebt ab. CDP kann keinen einzelnen Finger anheben, solange andere
   * liegen (`touchEnd` beendet immer alle) – dafür gibt es {@link upAll}.
   */
  async up(id: number) {
    if (!this.active.has(id)) throw new Error(`Finger ${String(id)} liegt nicht auf`);
    if (this.active.size > 1) {
      throw new Error('Mehrere Finger liegen auf: upAll() verwenden (CDP-Einschränkung)');
    }
    await this.upAll();
  }

  /** Alle Finger heben gleichzeitig ab. */
  async upAll() {
    this.active.clear();
    await this.dispatch('touchEnd');
  }

  /**
   * Nur Finger `id` hebt ab, die anderen bleiben liegen (CHAOS-13). Gemessen mit
   * Chromium/Playwright 1.63: `touchEnd` beendet genau die **übergebenen** Punkte
   * (leere Liste = alle); ein danach gesendetes `touchMove` mit nur einem Teil der
   * Finger lässt die übrigen liegen.
   */
  async lift(id: number) {
    const point = this.active.get(id);
    if (!point) throw new Error(`Finger ${String(id)} liegt nicht auf`);
    this.active.delete(id);
    await this.cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ id, x: point.x, y: point.y, radiusX: 8, radiusY: 8 }],
    });
  }

  /** Das System bricht alle Berührungen ab (`touchcancel`, z. B. Systemgeste, Drehen). */
  async cancelAll() {
    this.active.clear();
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  }

  async tap(point: Point, id = 1) {
    await this.down(id, point);
    await this.up(id);
  }
}

export async function centerOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element ist nicht sichtbar');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
