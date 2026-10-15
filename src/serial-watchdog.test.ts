import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createSerialWatchdog } from './serial-watchdog';

describe('createSerialWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('dispara onTimeout cuando dejan de llegar tramas tras un flujo sano', () => {
    const onTimeout = vi.fn();
    const watchdog = createSerialWatchdog({ timeoutMs: 1000, onTimeout });
    watchdog.start();
    watchdog.feed();

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

  it('sin ninguna trama desde start() no llama onTimeout y avisa con onNoFramesSinceStart', () => {
    const onTimeout = vi.fn();
    const onNoFramesSinceStart = vi.fn();
    createSerialWatchdog({
      timeoutMs: 1000,
      silentLogIntervalMs: 5000,
      onTimeout,
      onNoFramesSinceStart,
    }).start();

    vi.advanceTimersByTime(999);
    expect(onNoFramesSinceStart).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(1);
    expect(onNoFramesSinceStart).toHaveBeenLastCalledWith(1000);

    vi.advanceTimersByTime(5000);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(2);
    expect(onNoFramesSinceStart).toHaveBeenLastCalledWith(6000);

    vi.advanceTimersByTime(5000);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(3);
    expect(onNoFramesSinceStart).toHaveBeenLastCalledWith(11000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('silentLogIntervalMs por defecto es 10 minutos', () => {
    const onNoFramesSinceStart = vi.fn();
    createSerialWatchdog({ timeoutMs: 1000, onTimeout: vi.fn(), onNoFramesSinceStart }).start();

    vi.advanceTimersByTime(1000);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(599_999);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(2);
    expect(onNoFramesSinceStart).toHaveBeenLastCalledWith(601_000);
  });

  it('sin onNoFramesSinceStart y sin tramas no falla ni llama onTimeout', () => {
    const onTimeout = vi.fn();
    createSerialWatchdog({ timeoutMs: 1000, onTimeout }).start();

    vi.advanceTimersByTime(3_600_000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('con una trama y luego silencio dispara onTimeout y nunca onNoFramesSinceStart', () => {
    const onTimeout = vi.fn();
    const onNoFramesSinceStart = vi.fn();
    const watchdog = createSerialWatchdog({ timeoutMs: 1000, onTimeout, onNoFramesSinceStart });
    watchdog.start();

    vi.advanceTimersByTime(500);
    watchdog.feed();

    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onNoFramesSinceStart).not.toHaveBeenCalled();
  });

  it('feed() tras un periodo silencioso pasa al comportamiento normal de stall', () => {
    const onTimeout = vi.fn();
    const onNoFramesSinceStart = vi.fn();
    const watchdog = createSerialWatchdog({
      timeoutMs: 1000,
      silentLogIntervalMs: 5000,
      onTimeout,
      onNoFramesSinceStart,
    });
    watchdog.start();

    vi.advanceTimersByTime(6000);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(2);

    watchdog.feed();
    vi.advanceTimersByTime(999);
    expect(onTimeout).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(2);
  });

  it('stop() cancela tambien los avisos de onNoFramesSinceStart', () => {
    const onNoFramesSinceStart = vi.fn();
    const watchdog = createSerialWatchdog({
      timeoutMs: 1000,
      silentLogIntervalMs: 5000,
      onTimeout: vi.fn(),
      onNoFramesSinceStart,
    });
    watchdog.start();
    vi.advanceTimersByTime(1000);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(1);

    watchdog.stop();
    vi.advanceTimersByTime(60_000);
    expect(onNoFramesSinceStart).toHaveBeenCalledTimes(1);
  });

  it('con timeoutMs <= 0 no llama a ningun callback', () => {
    const onTimeout = vi.fn();
    const onNoFramesSinceStart = vi.fn();
    const watchdog = createSerialWatchdog({ timeoutMs: 0, onTimeout, onNoFramesSinceStart });
    watchdog.start();
    vi.advanceTimersByTime(3_600_000);
    expect(onNoFramesSinceStart).not.toHaveBeenCalled();
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
