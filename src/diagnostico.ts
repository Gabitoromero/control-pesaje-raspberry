import type { RawFrame, RbState } from './rb-state';

export interface SerialInfo {
  isOpen: boolean;
  path: string;
  baud: number;
  ultimoError: string | null;
  ultimoErrorHaceMs: number | null;
  intentosFallidos: number;
}

export interface SerialDiagnostico {
  abierto: boolean;
  path: string;
  baud: number;
  ultimoByteHaceMs: number | null;
  ultimoError: string | null;
  ultimoErrorHaceMs: number | null;
  intentosFallidos: number;
}

export interface DiagnosticoV1 {
  v: 1;
  version: string;
  serial: SerialDiagnostico;
  contadores: {
    bytes: number;
    validas: number;
    descartadas: number;
    ultimaDescartada: string | null;
  };
  tramasCrudas: RawFrame[];
  logs: string[];
}

export function buildDiagnostico(
  state: RbState,
  { version, serial, now }: { version: string; serial: SerialInfo; now: number },
): DiagnosticoV1 {
  return {
    v: 1,
    version,
    serial: {
      abierto: serial.isOpen,
      path: serial.path,
      baud: serial.baud,
      ultimoByteHaceMs: state.ultimoByteAt === null ? null : now - state.ultimoByteAt,
      ultimoError: serial.ultimoError,
      ultimoErrorHaceMs: serial.ultimoErrorHaceMs,
      intentosFallidos: serial.intentosFallidos,
    },
    contadores: {
      bytes: state.bytesRecibidos,
      validas: state.tramasValidas,
      descartadas: state.tramasDescartadas,
      ultimaDescartada: state.ultimaDescartada,
    },
    tramasCrudas: state.tramasCrudas.toArray(),
    logs: state.logs.toArray(),
  };
}

interface DiagnosticoSocket {
  on: (event: string, listener: (request: unknown, ack?: unknown) => void) => unknown;
}

/**
 * Answers the backend's `diagnostico-solicitud` through the ack. The request
 * content is ignored: any version is answered with this RB's own v1 response.
 */
export function registerDiagnosticoHandler(
  socket: DiagnosticoSocket,
  build: () => DiagnosticoV1,
): void {
  socket.on('diagnostico-solicitud', (_request, ack) => {
    if (typeof ack !== 'function') return;
    try {
      ack(build());
    } catch (err) {
      console.error('[diagnostico] fallo al armar la respuesta', err instanceof Error ? err.name : 'unknown');
    }
  });
}
