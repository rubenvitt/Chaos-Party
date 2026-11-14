/**
 * Ringpuffer fester Größe für Messwerte (CHAOS-45): Neue Werte verdrängen die ältesten.
 * Median und p95 beziehen sich damit immer auf die letzten `capacity` Messungen, und der
 * Speicher wächst nicht, egal wie lange das Spiel läuft.
 */
export class RingBuffer {
  readonly capacity: number;
  private readonly items: number[];
  /** Position, an die der nächste Wert geschrieben wird. */
  private next = 0;
  private count = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`Kapazität muss eine ganze Zahl ≥ 1 sein, war ${String(capacity)}`);
    }
    this.capacity = capacity;
    this.items = new Array<number>(capacity).fill(0);
  }

  /** Zahl der gespeicherten Werte (höchstens `capacity`). */
  get size(): number {
    return this.count;
  }

  /** Zuletzt hinzugefügter Wert oder `null`, wenn leer. */
  get last(): number | null {
    if (this.count === 0) return null;
    return this.items[(this.next - 1 + this.capacity) % this.capacity] ?? null;
  }

  push(value: number): void {
    this.items[this.next] = value;
    this.next = (this.next + 1) % this.capacity;
    if (this.count < this.capacity) this.count += 1;
  }

  /** Gespeicherte Werte vom ältesten zum neuesten (Kopie). */
  values(): number[] {
    const start = (this.next - this.count + this.capacity) % this.capacity;
    const out: number[] = [];
    for (let i = 0; i < this.count; i++) {
      out.push(this.items[(start + i) % this.capacity] ?? 0);
    }
    return out;
  }

  clear(): void {
    this.next = 0;
    this.count = 0;
  }
}
