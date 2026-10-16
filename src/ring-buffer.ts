export interface RingBuffer<T> {
  push: (item: T) => void;
  /** Copy of the stored items, oldest to newest. */
  toArray: () => T[];
  size: () => number;
}

/** Fixed-capacity circular buffer: O(1) push, memory bounded by `capacity`. */
export function createRingBuffer<T>(capacity: number): RingBuffer<T> {
  const items: T[] = [];
  let next = 0;

  return {
    push(item) {
      items[next] = item;
      next = (next + 1) % capacity;
    },
    toArray() {
      // Until it wraps, `items` is already ordered; after that the oldest is at `next`.
      if (items.length < capacity) return items.slice();
      return [...items.slice(next), ...items.slice(0, next)];
    },
    size: () => items.length,
  };
}
