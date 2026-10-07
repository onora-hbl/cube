export class RingBuffer<T> {
  private items: (T | undefined)[]
  private start = 0
  private size = 0

  constructor(private capacity: number) {
    this.items = new Array<T | undefined>(capacity)
  }

  push(item: T): T | undefined {
    if (this.size < this.capacity) {
      this.items[(this.start + this.size) % this.capacity] = item
      this.size++
      return undefined
    }
    const evicted = this.items[this.start]
    this.items[this.start] = item
    this.start = (this.start + 1) % this.capacity
    return evicted
  }

  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.size; i++) {
      yield this.items[(this.start + i) % this.capacity] as T
    }
  }
}
