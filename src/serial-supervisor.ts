export interface SerialPortLike {
  on(event: 'data', listener: (chunk: Buffer) => void): unknown;
  on(event: 'close', listener: () => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
  open(cb: (err?: Error | null) => void): void;
  close?(): void;
}

export interface SerialEstado {
  abierto: boolean;
  ultimoError: string | null;
  ultimoErrorHaceMs: number | null;
  intentosFallidos: number;
}

export interface SerialSupervisorOptions {
  path: string;
  baud: number;
  /** Creates a NOT yet opened port (autoOpen off) with its parser already wired. */
  createPort: () => SerialPortLike;
  /** Called every time a port opens (also after a reopen). */
  onOpen: () => void;
  /** Called when an open port is lost (close or error). */
  onClose: () => void;
  onBytes?: (count: number) => void;
}

const RETRY_DELAYS_MS = [2000, 5000, 10_000, 30_000];
const REMINDER_INTERVAL_MS = 600_000;
const ERROR_MAX_LENGTH = 200;

/**
 * Keeps the serial port open without ever ending the process: a port that
 * cannot be opened, errors or closes is discarded and a new one is opened
 * after 2 s, 5 s, 10 s and then every 30 s. A successful open resets the backoff.
 */
export function createSerialSupervisor(opts: SerialSupervisorOptions) {
  let abierto = false;
  let ultimoError: string | null = null;
  let ultimoErrorAt = 0;
  let intentosFallidos = 0;
  let lastLogAt: number | null = null; // null = no failure logged in this outage
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const retryDelay = () => RETRY_DELAYS_MS[Math.min(Math.max(intentosFallidos - 1, 0), RETRY_DELAYS_MS.length - 1)];

  function registerFailure(reason: string, countAsAttempt: boolean) {
    const now = Date.now();
    ultimoError = reason.slice(0, ERROR_MAX_LENGTH);
    ultimoErrorAt = now;
    if (countAsAttempt) intentosFallidos++;

    if (lastLogAt === null) {
      console.error(`[serial] ${ultimoError}. Reintentando abrir ${opts.path} en segundo plano (el proceso sigue activo).`);
      lastLogAt = now;
    } else if (now - lastLogAt >= REMINDER_INTERVAL_MS) {
      console.error(`[serial] Puerto ${opts.path} sigue sin abrir (${intentosFallidos} intentos). Último error: ${ultimoError}`);
      lastLogAt = now;
    }

    if (!stopped) timer = setTimeout(openNew, retryDelay());
  }

  function openNew() {
    timer = null;
    let port: SerialPortLike;
    try {
      port = opts.createPort();
    } catch (err) {
      registerFailure(err instanceof Error ? err.message : String(err), true);
      return;
    }
    // A port handles its first terminal event only; later ones are stale.
    let dead = false;
    let opened = false;

    const lose = (reason: string) => {
      if (dead) return;
      dead = true;
      try {
        port.close?.();
      } catch {
        // already closed
      }
      if (opened) {
        abierto = false;
        opts.onClose();
      }
      registerFailure(reason, !opened);
    };

    port.on('data', (chunk: Buffer) => {
      if (!dead) opts.onBytes?.(chunk.length);
    });
    port.on('close', () => lose('Puerto cerrado inesperadamente'));
    port.on('error', (err: Error) => lose(err.message));

    port.open((err) => {
      if (dead) return;
      if (err) {
        lose(err.message);
        return;
      }
      opened = true;
      abierto = true;
      ultimoError = null;
      intentosFallidos = 0;
      lastLogAt = null;
      console.log(`[serial] Puerto abierto: ${opts.path} @ ${opts.baud} baud`);
      opts.onOpen();
    });
  }

  return {
    start: openNew,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    getEstado(): SerialEstado {
      return {
        abierto,
        ultimoError,
        ultimoErrorHaceMs: ultimoError === null ? null : Date.now() - ultimoErrorAt,
        intentosFallidos,
      };
    },
  };
}
