export interface SerialWatchdogOptions {
  /** Max time without a valid frame (after a healthy flow) before `onTimeout` fires. <= 0 disables the watchdog. */
  timeoutMs: number;
  /** Called only when valid frames were flowing and then stopped for `timeoutMs`. */
  onTimeout: () => void;
  /**
   * Called when no valid frame has ever been fed since `start()`: first after `timeoutMs`,
   * then every `silentLogIntervalMs`. A restart cannot help here (e.g. the scale is off).
   */
  onNoFramesSinceStart?: (elapsedMs: number) => void;
  /** Interval between `onNoFramesSinceStart` calls after the first one. Default 10 minutes. */
  silentLogIntervalMs?: number;
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
 *
 * Only a stall AFTER a healthy flow triggers `onTimeout`. If no frame was ever
 * received since `start()`, restarting is pointless, so it only reports.
 */
export function createSerialWatchdog({
  timeoutMs,
  onTimeout,
  onNoFramesSinceStart,
  silentLogIntervalMs = 600_000,
}: SerialWatchdogOptions): SerialWatchdog {
  let timer: NodeJS.Timeout | null = null;
  let armed = false;
  let hasFed = false;
  let startedAt = 0;

  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const scheduleStall = () => {
    clear();
    timer = setTimeout(onTimeout, timeoutMs);
  };

  const scheduleSilent = (delayMs: number) => {
    clear();
    timer = setTimeout(() => {
      onNoFramesSinceStart?.(Date.now() - startedAt);
      scheduleSilent(silentLogIntervalMs);
    }, delayMs);
  };

  return {
    start() {
      if (timeoutMs <= 0) return;
      armed = true;
      hasFed = false;
      startedAt = Date.now();
      scheduleSilent(timeoutMs);
    },
    feed() {
      if (!armed) return;
      hasFed = true;
      scheduleStall();
    },
    stop() {
      armed = false;
      hasFed = false;
      clear();
    },
  };
}
