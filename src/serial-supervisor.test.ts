import { describe, it, expect, vi, beforeEach, afterEach, type Mock, type MockInstance } from 'vitest';
import { createSerialSupervisor, type SerialPortLike } from './serial-supervisor';

type Listener = (arg: never) => void;

class FakePort implements SerialPortLike {
  listeners = new Map<string, Listener[]>();
  openCb: ((err?: Error | null) => void) | null = null;
  closed = false;

  on(event: string, listener: Listener) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  open(cb: (err?: Error | null) => void) {
    this.openCb = cb;
  }
  close() {
    this.closed = true;
  }
  emit(event: string, arg?: unknown) {
    (this.listeners.get(event) ?? []).forEach((l) => (l as (a?: unknown) => void)(arg));
  }
  opens() {
    this.openCb?.(null);
  }
  fails(message = 'ENOENT: no such file or directory, cannot open /dev/ttyUSB0') {
    this.openCb?.(new Error(message));
  }
}

const ENOENT = 'ENOENT: no such file or directory, cannot open /dev/ttyUSB0';

describe('createSerialSupervisor', () => {
  let ports: FakePort[];
  let hooks: { onOpen: Mock<() => void>; onClose: Mock<() => void> };
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  const build = () =>
    createSerialSupervisor({
      path: '/dev/ttyUSB0',
      baud: 9600,
      createPort: () => {
        const p = new FakePort();
        ports.push(p);
        return p;
      },
      ...hooks,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    ports = [];
    hooks = { onOpen: vi.fn<() => void>(), onClose: vi.fn<() => void>() };
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('opens the port and reports a clean open state', () => {
    const sup = build();
    sup.start();
    ports[0].opens();

    expect(sup.getEstado()).toEqual({
      abierto: true,
      ultimoError: null,
      ultimoErrorHaceMs: null,
      intentosFallidos: 0,
    });
    expect(hooks.onOpen).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[serial] Puerto abierto: /dev/ttyUSB0 @ 9600 baud');
  });

  it('retries with 2s, 5s, 10s then every 30s and never exits', () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const sup = build();
    sup.start();
    ports[0].fails();
    expect(ports).toHaveLength(1);

    const delays = [2000, 5000, 10000, 30000, 30000];
    delays.forEach((delay, i) => {
      vi.advanceTimersByTime(delay - 1);
      expect(ports).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(ports).toHaveLength(i + 2);
      ports[i + 1].fails();
    });

    expect(sup.getEstado().intentosFallidos).toBe(6);
    expect(exit).not.toHaveBeenCalled();
  });

  it('exposes the last error and its age while the port is closed', () => {
    const sup = build();
    sup.start();
    ports[0].fails();
    vi.advanceTimersByTime(1500);

    expect(sup.getEstado()).toEqual({
      abierto: false,
      ultimoError: ENOENT,
      ultimoErrorHaceMs: 1500,
      intentosFallidos: 1,
    });
  });

  it('truncates a very long error to 200 chars', () => {
    const sup = build();
    sup.start();
    ports[0].fails('x'.repeat(500));
    expect(sup.getEstado().ultimoError).toHaveLength(200);
  });

  it('a successful open resets error, counter and backoff', () => {
    const sup = build();
    sup.start();
    ports[0].fails();
    vi.advanceTimersByTime(2000);
    ports[1].fails();
    vi.advanceTimersByTime(5000);
    ports[2].opens();

    expect(sup.getEstado()).toEqual({
      abierto: true,
      ultimoError: null,
      ultimoErrorHaceMs: null,
      intentosFallidos: 0,
    });

    // backoff restarts at 2 s after the next loss
    ports[2].emit('close');
    vi.advanceTimersByTime(2000);
    expect(ports).toHaveLength(4);
  });

  it('discards an open port on close and reopens a new one', () => {
    const sup = build();
    sup.start();
    ports[0].opens();
    ports[0].emit('close');

    expect(sup.getEstado().abierto).toBe(false);
    expect(hooks.onClose).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2000);
    expect(ports).toHaveLength(2);
    ports[1].opens();
    expect(sup.getEstado().abierto).toBe(true);
    expect(hooks.onOpen).toHaveBeenCalledTimes(2);
  });

  it('treats an error on an open port as a loss, schedules one reopen only', () => {
    const sup = build();
    sup.start();
    ports[0].opens();
    ports[0].emit('error', new Error('device disconnected'));
    ports[0].emit('close'); // serialport emits both

    expect(ports[0].closed).toBe(true);
    expect(sup.getEstado().ultimoError).toBe('device disconnected');
    vi.advanceTimersByTime(2000);
    expect(ports).toHaveLength(2);
    vi.advanceTimersByTime(60_000);
    expect(ports).toHaveLength(2); // second port has not answered yet; no parallel opens
  });

  it('forwards data bytes of the current port', () => {
    const onBytes = vi.fn();
    const sup = createSerialSupervisor({
      path: '/dev/ttyUSB0',
      baud: 9600,
      createPort: () => {
        const p = new FakePort();
        ports.push(p);
        return p;
      },
      ...hooks,
      onBytes,
    });
    sup.start();
    ports[0].opens();
    ports[0].emit('data', Buffer.from('abc'));
    expect(onBytes).toHaveBeenCalledWith(3);
  });

  it('logs the first failure, one reminder every 10 minutes, and always the recovery', () => {
    const sup = build();
    sup.start();
    ports[0].fails();
    const failuresLogged = () => errorSpy.mock.calls.filter((c: unknown[]) => String(c[0]).startsWith('[serial]')).length;
    expect(failuresLogged()).toBe(1);
    expect(String(errorSpy.mock.calls[0][0])).toContain('Reintentando');

    // 9 minutes of failures at 30 s: no new logs
    let i = 0;
    const failNext = (ms: number) => {
      vi.advanceTimersByTime(ms);
      i++;
      ports[i].fails();
    };
    failNext(2000);
    failNext(5000);
    failNext(10000);
    for (let n = 0; n < 17; n++) failNext(30000);
    expect(failuresLogged()).toBe(1);

    // past 10 minutes since the first log: one reminder with the attempt count
    for (let n = 0; n < 3; n++) failNext(30000);
    expect(failuresLogged()).toBe(2);
    expect(String(errorSpy.mock.calls[1][0])).toMatch(/intentos/);

    vi.advanceTimersByTime(30000);
    ports[ports.length - 1].opens();
    expect(logSpy).toHaveBeenCalledWith('[serial] Puerto abierto: /dev/ttyUSB0 @ 9600 baud');
  });

  it('ignores late events from a discarded port', () => {
    const sup = build();
    sup.start();
    ports[0].opens();
    ports[0].emit('close');
    vi.advanceTimersByTime(2000);
    ports[1].opens();
    ports[0].emit('error', new Error('late'));
    vi.advanceTimersByTime(60_000);

    expect(sup.getEstado().abierto).toBe(true);
    expect(ports).toHaveLength(2);
  });

  it('stop cancels a pending retry', () => {
    const sup = build();
    sup.start();
    ports[0].fails();
    sup.stop();
    vi.advanceTimersByTime(60_000);
    expect(ports).toHaveLength(1);
  });
});
