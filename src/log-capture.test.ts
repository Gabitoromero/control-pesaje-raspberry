import { describe, it, expect, vi } from 'vitest';
import { installLogCapture } from './log-capture';
import { createRingBuffer } from './ring-buffer';

function makeTarget() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

const NOW = () => Date.parse('2026-01-02T03:04:05.000Z');

describe('installLogCapture', () => {
  it('captures the line in the ring and still delegates to the original method', () => {
    const target = makeTarget();
    const originalLog = target.log;
    const ring = createRingBuffer<string>(50);
    installLogCapture(ring, { target, now: NOW });

    target.log('[socket] Conectado', 42);

    expect(originalLog).toHaveBeenCalledWith('[socket] Conectado', 42);
    expect(ring.toArray()).toEqual(['2026-01-02T03:04:05.000Z LOG [socket] Conectado 42']);
  });

  it('tags warn and error levels', () => {
    const target = makeTarget();
    const ring = createRingBuffer<string>(50);
    installLogCapture(ring, { target, now: NOW });

    target.warn('w');
    target.error('e');

    expect(ring.toArray()).toEqual([
      '2026-01-02T03:04:05.000Z WARN w',
      '2026-01-02T03:04:05.000Z ERROR e',
    ]);
  });

  it('truncates the message to maxLineLength (default 200)', () => {
    const target = makeTarget();
    const ring = createRingBuffer<string>(50);
    installLogCapture(ring, { target, now: NOW });

    target.log('x'.repeat(500));

    const prefix = '2026-01-02T03:04:05.000Z LOG ';
    expect(ring.toArray()[0]).toBe(prefix + 'x'.repeat(200));
  });

  it('is idempotent: installing twice records each call once', () => {
    const target = makeTarget();
    const originalLog = target.log;
    const ring = createRingBuffer<string>(50);
    installLogCapture(ring, { target, now: NOW });
    installLogCapture(ring, { target, now: NOW });

    target.log('once');

    expect(ring.size()).toBe(1);
    expect(originalLog).toHaveBeenCalledTimes(1);
  });

  it('does not recurse or duplicate when the ring itself logs', () => {
    const target = makeTarget();
    const originalLog = target.log;
    const ring = {
      push: vi.fn((_line: string) => {
        target.log('logged from inside the ring');
      }),
    };
    installLogCapture(ring, { target, now: NOW });

    target.log('outer');

    expect(ring.push).toHaveBeenCalledTimes(1);
    // outer call + the re-entrant call, both delegated, neither re-captured
    expect(originalLog).toHaveBeenCalledTimes(2);
  });

  it('keeps console working when the ring throws', () => {
    const target = makeTarget();
    const originalLog = target.log;
    const ring = {
      push: () => {
        throw new Error('boom');
      },
    };
    installLogCapture(ring, { target, now: NOW });

    expect(() => target.log('still works')).not.toThrow();
    expect(originalLog).toHaveBeenCalledWith('still works');
  });

  it('uninstall restores the original methods and allows a new install', () => {
    const target = makeTarget();
    const originalLog = target.log;
    const ring = createRingBuffer<string>(50);
    const uninstall = installLogCapture(ring, { target, now: NOW });

    uninstall();
    expect(target.log).toBe(originalLog);

    target.log('not captured');
    expect(ring.size()).toBe(0);

    installLogCapture(ring, { target, now: NOW });
    target.log('captured');
    expect(ring.size()).toBe(1);
  });
});
