/**
 * Objekt-Pool für Dinge, die im Spiel kommen und gehen (Socken, Glühwürmchen, Warnkreise):
 * vorab bauen (`warm`, im Aufbau mit `pace`), im Spiel nur ein- und ausblenden. Neue Meshes
 * mitten im Spiel kosten im Apple-Host ohne JIT spürbar Zeit (ADR-012 Nachtrag 4).
 */
import type { MinigameStage } from './stage.ts';

export interface Toggleable {
  setEnabled(on: boolean): void;
}

export class NodePool<T extends Toggleable, K = number> {
  private readonly free: T[] = [];
  private readonly used = new Map<K, T>();

  constructor(private readonly create: () => T) {}

  /** `count` Stück vorab bauen, zwischen den Stücken das Bild abgeben. */
  async warm(stage: MinigameStage, count: number): Promise<void> {
    for (let index = 0; index < count; index++) {
      await stage.pace();
      const item = this.create();
      item.setEnabled(false);
      this.free.push(item);
    }
  }

  /** Stück für `key` holen (aus dem Vorrat oder neu) und einblenden. */
  acquire(key: K): T {
    const item = this.used.get(key) ?? this.free.pop() ?? this.create();
    item.setEnabled(true);
    this.used.set(key, item);
    return item;
  }

  get(key: K): T | undefined {
    return this.used.get(key);
  }

  /** Stück zurück in den Vorrat (ausgeblendet). */
  release(key: K): void {
    const item = this.used.get(key);
    if (!item) return;
    item.setEnabled(false);
    this.used.delete(key);
    this.free.push(item);
  }

  releaseAll(): void {
    for (const key of [...this.used.keys()]) this.release(key);
  }

  get active(): number {
    return this.used.size;
  }

  /** Vergisst alles (die Meshes entsorgt die Bühne). */
  clear(): void {
    this.free.length = 0;
    this.used.clear();
  }
}
