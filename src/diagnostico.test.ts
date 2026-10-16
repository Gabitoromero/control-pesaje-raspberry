import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildDiagnostico, registerDiagnosticoHandler } from './diagnostico';
import { createRbState } from './rb-state';

const SERIAL_OPEN = { isOpen: true, path: '/dev/ttyUSB0', baud: 9600 };

describe('buildDiagnostico', () => {
  it('builds the v1 response shape', () => {
    const state = createRbState();
    state.onBytes(30, 9000);
    state.onRaw('  1.234 kg', 9000);
    state.onValida();
    state.onDescartada('garbage');
    state.logs.push('a log line');

    const diag = buildDiagnostico(state, { version: 'abc1234', serial: SERIAL_OPEN, now: 10_000 });

    expect(diag).toEqual({
      v: 1,
      version: 'abc1234',
      serial: { abierto: true, path: '/dev/ttyUSB0', baud: 9600, ultimoByteHaceMs: 1000 },
      contadores: { bytes: 30, validas: 1, descartadas: 1, ultimaDescartada: 'garbage' },
      tramasCrudas: [{ t: 9000, raw: '  1.234 kg' }],
      logs: ['a log line'],
    });
  });

  it('ultimoByteHaceMs is null when no byte was ever received', () => {
    const diag = buildDiagnostico(createRbState(), { version: 'x', serial: SERIAL_OPEN, now: 5 });
    expect(diag.serial.ultimoByteHaceMs).toBeNull();
  });

  it('reports abierto:false when the serial port is closed', () => {
    const diag = buildDiagnostico(createRbState(), {
      version: 'x',
      serial: { ...SERIAL_OPEN, isOpen: false },
      now: 5,
    });
    expect(diag.serial.abierto).toBe(false);
  });

  it('exposes only the contract keys (no operator data)', () => {
    const diag = buildDiagnostico(createRbState(), { version: 'x', serial: SERIAL_OPEN, now: 5 });
    expect(Object.keys(diag).sort()).toEqual(
      ['contadores', 'logs', 'serial', 'tramasCrudas', 'v', 'version'].sort(),
    );
  });
});

describe('registerDiagnosticoHandler', () => {
  afterEach(() => vi.restoreAllMocks());

  function setup(build: () => unknown) {
    let handler: ((req: unknown, ack?: unknown) => void) | undefined;
    const socket = {
      on: vi.fn((event: string, cb: (req: unknown, ack?: unknown) => void) => {
        if (event === 'diagnostico-solicitud') handler = cb;
      }),
    };
    registerDiagnosticoHandler(socket, build as never);
    return { socket, call: (req: unknown, ack?: unknown) => handler!(req, ack) };
  }

  it('registers diagnostico-solicitud and answers through the ack', () => {
    const response = { v: 1 };
    const { socket, call } = setup(() => response);
    const ack = vi.fn();

    call({ v: 1 }, ack);

    expect(socket.on).toHaveBeenCalledWith('diagnostico-solicitud', expect.any(Function));
    expect(ack).toHaveBeenCalledWith(response);
  });

  it('still answers with its own v:1 for an unknown request version', () => {
    const response = { v: 1 };
    const { call } = setup(() => response);
    const ack = vi.fn();

    call({ v: 2 }, ack);

    expect(ack).toHaveBeenCalledWith(response);
  });

  it('does not throw when there is no ack callback and does not build the response', () => {
    const build = vi.fn();
    const { call } = setup(build);
    expect(() => call({ v: 1 })).not.toThrow();
    expect(build).not.toHaveBeenCalled();
  });

  it('does not crash when building the response throws, and logs it', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { call } = setup(() => {
      throw new Error('boom');
    });
    const ack = vi.fn();

    expect(() => call({ v: 1 }, ack)).not.toThrow();
    expect(ack).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[diagnostico]'), 'Error');
  });
});
