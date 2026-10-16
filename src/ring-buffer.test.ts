import { describe, it, expect } from 'vitest';
import { createRingBuffer } from './ring-buffer';

describe('createRingBuffer', () => {
  it('starts empty', () => {
    const ring = createRingBuffer<number>(3);
    expect(ring.size()).toBe(0);
    expect(ring.toArray()).toEqual([]);
  });

  it('returns items oldest to newest before wrapping', () => {
    const ring = createRingBuffer<number>(3);
    ring.push(1);
    ring.push(2);
    expect(ring.toArray()).toEqual([1, 2]);
    expect(ring.size()).toBe(2);
  });

  it('keeps only the last `capacity` items once it wraps, in order', () => {
    const ring = createRingBuffer<number>(3);
    for (let i = 1; i <= 8; i++) ring.push(i);
    expect(ring.toArray()).toEqual([6, 7, 8]);
    expect(ring.size()).toBe(3);
  });

  it('holds exactly the last 250 of 250+ pushes with capacity 100', () => {
    const ring = createRingBuffer<number>(100);
    for (let i = 0; i < 250; i++) ring.push(i);
    const items = ring.toArray();
    expect(items).toHaveLength(100);
    expect(items[0]).toBe(150);
    expect(items[99]).toBe(249);
  });

  it('toArray returns a copy that does not alias the internal storage', () => {
    const ring = createRingBuffer<number>(2);
    ring.push(1);
    const snapshot = ring.toArray();
    snapshot.push(99);
    ring.push(2);
    expect(snapshot).toEqual([1, 99]);
    expect(ring.toArray()).toEqual([1, 2]);
  });
});
