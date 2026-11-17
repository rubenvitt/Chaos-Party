/**
 * Darstellungs-Kennung für native Hosts (CHAOS-149, ADR-019 §3).
 *
 * Der Apple-Host lässt die Minispiele headless in JavaScriptCore laufen und zeichnet sie in
 * RealityKit selbst. Damit er statt Grundkörpern echte Modelle zeigen kann, kennzeichnen die
 * Minispiele ihre **logischen Objekte** (eine Socke, ein Turm, ein Kuckuck) mit einer Rolle und
 * optional einem Schlüssel (Slot, laufende Nummer). Gekennzeichnet wird der Wurzelknoten des
 * Objekts; seine Kinder erben die Rolle (`visualOf`).
 *
 * Regeln:
 * - Rollen sind kurze deutsche Wörter in Kleinbuchstaben, eindeutig je Minispiel.
 * - Ungekennzeichnete Meshes gelten als Kulisse: statisch oder rein dekorativ; ein nativer Host
 *   darf sie als Ganzes durch eine eigene Kulisse ersetzen.
 * - Figuren kennzeichnet die Laufzeit selbst (`figur`, Schlüssel = Slot).
 * - Am PC ändert die Kennung nichts: Sie liegt nur in `node.metadata`.
 */
import type { Node } from '@babylonjs/core/node.js';

export interface VisualTag {
  readonly role: string;
  readonly key?: string;
}

const FIELD = 'chaosVisual';

/** Kennzeichnet `node` (Wurzel eines logischen Objekts) und gibt ihn zurück. */
export function markVisual<T extends Node>(node: T, role: string, key?: string | number): T {
  const tag: VisualTag = key === undefined ? { role } : { role, key: String(key) };
  node.metadata = { ...(node.metadata as object | null), [FIELD]: tag };
  return node;
}

/** Kennung des nächsten gekennzeichneten Vorfahren (einschließlich `node`), sonst `undefined`. */
export function visualOf(node: Node): VisualTag | undefined {
  for (let current: Node | null = node; current; current = current.parent) {
    const tag = (current.metadata as Record<string, unknown> | null)?.[FIELD];
    if (tag) return tag as VisualTag;
  }
  return undefined;
}
