import type { Locator } from '@playwright/test';
import { expect } from './test.ts';

/**
 * Umbruchkanten (CHAOS-41, CHAOS-72): Screenshot-Masken verdecken Text, nicht seine Zeilenzahl
 * und nicht die Reihe, in der er steht. Passt ein Satz (oder eine Reihe Bedien-Pillen mit
 * `flex-wrap`) nur mit wenigen Pixeln Luft in eine Zeile, kippt schon leicht andere
 * Schriftrasterung (anderer Rechner, CI) den Umbruch, und das ganze Bild springt.
 *
 * Die Prüfung misst jeden Text unter `root` bei normalem Zeichenabstand und bei
 * `body { letter-spacing: ±spread }` (Standard ±0,3 px): Zeilenzahl und senkrechte Lage (Toleranz
 * 2 px; Zeichenabstand verschiebt Text nur waagrecht). Ändert sich eins davon, liegt ein Text oder
 * eine Reihe an einer Kante: Text oder Satzbreite ändern, bevor die Baseline erzeugt wird.
 * Elemente mit eigenem `letter-spacing` behalten ihren Wert (wie beim Handtest in `docs/testing.md`).
 */
export async function expectStableWrapping(root: Locator, spread = 0.3): Promise<void> {
  const profiles = await root.evaluate((el, delta) => {
    interface Entry {
      text: string;
      lines: number;
      top: number;
    }
    const measure = (): Entry[] => {
      const out: Entry[] = [];
      for (const element of [el, ...el.querySelectorAll('*')]) {
        const texts = [...element.childNodes].filter(
          (n): n is Text => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim() !== '',
        );
        const tops: number[] = [];
        for (const text of texts) {
          const range = document.createRange();
          range.selectNodeContents(text);
          for (const rect of range.getClientRects()) if (rect.width > 0) tops.push(rect.top);
        }
        if (tops.length === 0) continue;
        out.push({
          text: element.textContent.trim().replace(/\s+/g, ' '),
          lines: new Set(tops.map((t) => Math.round(t))).size,
          top: Math.min(...tops),
        });
      }
      return out;
    };
    const style = document.createElement('style');
    document.head.append(style);
    const at = (spacing: number) => {
      style.textContent = `body { letter-spacing: ${String(spacing)}px !important; }`;
      return measure();
    };
    try {
      return { normal: at(0), narrow: at(-delta), wide: at(delta) };
    } finally {
      style.remove();
    }
  }, spread);

  // Lage auf die normale Messung einrasten, wenn sie höchstens 2 px abweicht (Rundung, Glyphen).
  const describe = (entries: typeof profiles.normal) =>
    entries.map((e, i) => {
      const base = profiles.normal[i]?.top ?? e.top;
      const top = Math.abs(e.top - base) <= 2 ? base : e.top;
      return `${String(e.lines)} Zeile(n) bei y=${top.toFixed(0)}: ${e.text}`;
    });
  expect(
    { narrow: describe(profiles.narrow), wide: describe(profiles.wide) },
    `Umbruchkante: Zeilenzahl oder Reihe ändert sich bei ±${String(spread)} px Zeichenabstand`,
  ).toEqual({ narrow: describe(profiles.normal), wide: describe(profiles.normal) });
}
