/**
 * SERIAL_IDLE_TIMEOUT_MS: unset, empty, invalid, negative or 0 disable the
 * serial watchdog (returns 0); a positive number enables it, in milliseconds.
 */
export function parseSerialIdleTimeoutMs(raw: string | undefined): number {
  const value = Math.trunc(Number(raw?.trim()));
  return Number.isFinite(value) && value > 0 ? value : 0;
}
