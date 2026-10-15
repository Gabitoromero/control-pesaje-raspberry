import { describe, it, expect, vi } from 'vitest';
import { createServerErrorLogger } from './server-error-log';

describe('createServerErrorLogger', () => {
  it('logs the server error message with the [socket] prefix', () => {
    const log = vi.fn();
    const { onServerError } = createServerErrorLogger(log);
    onServerError({ message: 'Unidad de peso no configurada' });
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toBe('[socket] Error del servidor: Unidad de peso no configurada');
  });

  it('does not repeat the same message', () => {
    const log = vi.fn();
    const { onServerError } = createServerErrorLogger(log);
    onServerError({ message: 'x' });
    onServerError({ message: 'x' });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('logs again when the message changes', () => {
    const log = vi.fn();
    const { onServerError } = createServerErrorLogger(log);
    onServerError({ message: 'a' });
    onServerError({ message: 'b' });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('logs the same message again after reset', () => {
    const log = vi.fn();
    const { onServerError, reset } = createServerErrorLogger(log);
    onServerError({ message: 'a' });
    reset();
    onServerError({ message: 'a' });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('handles payloads without a message', () => {
    const log = vi.fn();
    const { onServerError } = createServerErrorLogger(log);
    onServerError(undefined);
    onServerError('plain string');
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[1][0]).toContain('plain string');
  });
});
