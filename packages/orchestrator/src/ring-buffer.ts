/**
 * Fixed-size ring buffer for activity log (last N NDJSON events).
 */
export class RingBuffer<T> {
  private buffer: T[] = [];
  private readonly capacity: number;
  private index = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
  }

  push(item: T): void {
    if (this.buffer.length < this.capacity) {
      this.buffer.push(item);
    } else {
      this.buffer[this.index] = item;
      this.index = (this.index + 1) % this.capacity;
    }
  }

  getAll(): T[] {
    if (this.buffer.length < this.capacity) {
      return [...this.buffer];
    }
    return [...this.buffer.slice(this.index), ...this.buffer.slice(0, this.index)];
  }

  get length(): number {
    return this.buffer.length;
  }
}
