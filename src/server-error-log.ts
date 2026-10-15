/**
 * Logs `error` events the server emits on the device socket (e.g. frames
 * rejected for a missing weight unit). Repeated identical messages are logged
 * once: frames arrive many times per second, so a persistent rejection would
 * otherwise flood the journal. `reset` re-arms logging on reconnect.
 */
export function createServerErrorLogger(log: (message: string) => void = console.error) {
  let lastMessage: string | null = null;

  return {
    onServerError(payload: unknown): void {
      const message =
        typeof payload === 'object' && payload !== null && 'message' in payload
          ? String((payload as { message: unknown }).message)
          : String(payload);
      if (message === lastMessage) return;
      lastMessage = message;
      log(`[socket] Error del servidor: ${message}`);
    },
    reset(): void {
      lastMessage = null;
    },
  };
}
