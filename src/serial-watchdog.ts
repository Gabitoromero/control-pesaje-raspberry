export interface SerialWatchdogOptions {
  /** Max time without a valid frame before `onTimeout` fires. <= 0 disables the watchdog. */
  timeoutMs: number;
  onTimeout: () => void;
}

export interface SerialWatchdog {
  /** Arms the watchdog. Call once the serial port is open. */
  start: () => void;
  /** Call on every valid frame: resets the countdown. No-op until `start()`. */
  feed: () => void;
  stop: () => void;
}

/**
 * Detects a silently stalled serial link (e.g. a hung USB-serial adapter):
 * the process stays alive and the socket stays connected, but no frames arrive.
 * Neither `error` nor `close` fire in that case, so only a timeout can tell.
 */
export function createSerialWatchdog({ timeoutMs, onTimeout }: SerialWatchdogOptions): SerialWatchdog {
  let timer: NodeJS.Timeout | null = null;
  let armed = false;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const schedule = () => {
    clear();
    timer = setTimeout(onTimeout, timeoutMs);
  };

  return {
    start() {
      if (timeoutMs <= 0) return;
      armed = true;
      schedule();
    },
    feed() {
      if (armed) schedule();
    },
    stop() {
      armed = false;
      clear();
    },
  };
}
