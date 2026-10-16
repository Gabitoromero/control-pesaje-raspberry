import { format } from 'node:util';

type LogMethod = (...args: unknown[]) => void;

export interface LogTarget {
  log: LogMethod;
  warn: LogMethod;
  error: LogMethod;
}

export interface LogCaptureOptions {
  target?: LogTarget;
  maxLineLength?: number;
  now?: () => number;
}

const LEVELS = { log: 'LOG', warn: 'WARN', error: 'ERROR' } as const;
const INSTALLED = Symbol.for('controlador-pesaje.log-capture');

/**
 * Wraps console.log/warn/error once so every line also lands in `ring`
 * (message truncated to `maxLineLength`). The original method is always called,
 * so journald output is unchanged. Returns a function that restores the originals.
 */
export function installLogCapture(
  ring: { push: (line: string) => void },
  { target = console, maxLineLength = 200, now = Date.now }: LogCaptureOptions = {},
): () => void {
  const marked = target as unknown as Record<symbol, unknown>;
  if (marked[INSTALLED]) return () => {};
  marked[INSTALLED] = true;

  const originals = { log: target.log, warn: target.warn, error: target.error };
  let capturing = false;

  for (const method of Object.keys(LEVELS) as Array<keyof typeof LEVELS>) {
    const original = originals[method];
    target[method] = (...args: unknown[]) => {
      // Re-entrancy guard: a console call made while capturing is only delegated.
      if (!capturing) {
        capturing = true;
        try {
          const message = format(...args).slice(0, maxLineLength);
          ring.push(`${new Date(now()).toISOString()} ${LEVELS[method]} ${message}`);
        } catch {
          // Capturing must never break logging.
        } finally {
          capturing = false;
        }
      }
      original.apply(target, args);
    };
  }

  return () => {
    target.log = originals.log;
    target.warn = originals.warn;
    target.error = originals.error;
    delete marked[INSTALLED];
  };
}
