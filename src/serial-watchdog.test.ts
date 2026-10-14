import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSerialWatchdog } from './serial-watchdog';

describe('createSerialWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispara onTimeout cuando no llegan tramas dentro del timeout', () => {
    const onTimeout = vi.fn();
    createSerialWatchdog({ timeoutMs: 1000, onTimeout }).start();

    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('feed() reinicia la cuenta y evita el disparo', () => {
    const onTimeout = vi.fn();
    const watchdog = createSerialWatchdog({ timeoutMs: 1000, onTimeout });
    watchdog.start();

    vi.advanceTimersByTime(900);
    watchdog.feed();
    vi.advanceTimersByTime(900);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('stop() cancela el disparo', () => {
    const onTimeout = vi.fn();
    const watchdog = createSerialWatchdog({ timeoutMs: 1000, onTimeout });
    watchdog.start();
    watchdog.stop();

    vi.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('con timeoutMs <= 0 queda deshabilitado', () => {
    const onTimeout = vi.fn();
    const watchdog = createSerialWatchdog({ timeoutMs: 0, onTimeout });
    watchdog.start();
    watchdog.feed();

    vi.advanceTimersByTime(60_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('feed() antes de start() no arma el timer', () => {
    const onTimeout = vi.fn();
    createSerialWatchdog({ timeoutMs: 1000, onTimeout }).feed();

    vi.advanceTimersByTime(5000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
