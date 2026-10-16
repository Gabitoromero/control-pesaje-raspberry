/**
 * Paso C — Script completo: serial + Socket.IO al servidor central.
 * Lee el peso de la balanza y lo emite al servidor identificándose con lineaProduccionId.
 *
 * Uso: pnpm dev
 */

import 'dotenv/config';
import { SerialPort, ReadlineParser } from 'serialport';
import { io, Socket } from 'socket.io-client';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildBalanzaPayload, parsearTrama } from './parsear-peso';
import { createSerialWatchdog } from './serial-watchdog';
import { createServerErrorLogger } from './server-error-log';
import { createRbState } from './rb-state';
import { installLogCapture } from './log-capture';
import { readGitVersion } from './version';
import { buildDiagnostico, registerDiagnosticoHandler } from './diagnostico';
import { parseSerialIdleTimeoutMs } from './config';
import { createSerialSupervisor } from './serial-supervisor';

const PORT = process.env.SERIAL_PORT ?? '/dev/ttyUSB0';
const BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE ?? 9600);
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
// 0 (the default) disables the watchdog.
const SERIAL_IDLE_TIMEOUT_MS = parseSerialIdleTimeoutMs(process.env.SERIAL_IDLE_TIMEOUT_MS);

export function initializeDeviceUUID(cwd: string): string {
  const deviceIdPath = path.join(cwd, '.device-id');
  if (fs.existsSync(deviceIdPath)) {
    return fs.readFileSync(deviceIdPath, 'utf8').trim();
  }
  const hardwareId = randomUUID();
  fs.writeFileSync(deviceIdPath, hardwareId, 'utf8');
  console.log(`[setup] Nuevo hardware ID generado y guardado: ${hardwareId}`);
  return hardwareId;
}

/**
 * socket.io-client only auto-reconnects for "real" network drops (transport
 * close, ping timeout, etc). When the SERVER initiates the disconnect (e.g.
 * to force a device to re-pair after being reassigned to a different línea),
 * the reason is 'io server disconnect' and the client intentionally does NOT
 * auto-reconnect — a manual connect() call is required to resume.
 */
export function shouldManuallyReconnect(reason: string): boolean {
  return reason === 'io server disconnect';
}

async function main() {
  const state = createRbState();
  // First thing at boot so the diagnostic log ring sees every line.
  installLogCapture(state.logs);
  const version = readGitVersion();
  console.log(`[setup] Versión: ${version}`);

  const hardwareId = initializeDeviceUUID(process.cwd());

  // --- Socket.IO ---
  const socket: Socket = io(SERVER_URL, {
    autoConnect: false,
    auth: { hardwareId },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
    transports: ['websocket'],
  });

  const serverErrorLogger = createServerErrorLogger();
  let serialSupervisor: ReturnType<typeof createSerialSupervisor>;

  registerDiagnosticoHandler(socket, () => {
    const { abierto, ...estado } = serialSupervisor.getEstado();
    return buildDiagnostico(state, {
      version,
      serial: { isOpen: abierto, path: PORT, baud: BAUD_RATE, ...estado },
      now: Date.now(),
    });
  });

  socket.on('connect', () => {
    serverErrorLogger.reset();
    console.log(`[socket] Conectado al servidor: ${SERVER_URL}`);
    console.log(`[socket] Identificado con hardwareId: ${hardwareId}`);
  });

  socket.on('disconnect', (reason: string) => {
    console.warn(`[socket] Desconectado: ${reason}. Reconectando...`);

    if (shouldManuallyReconnect(reason)) {
      socket.connect();
    }
  });

  // The server rejects frames (e.g. unit not configured) via `error` events.
  socket.on('error', serverErrorLogger.onServerError);

  socket.on('connect_error', (err: Error) => {
    console.error(`[socket] Error de conexión: ${err.message}. Reintentando...`);
  });

  socket.connect();

  // --- Puerto serial ---
  // The idle watchdog restarts the process (off by default); it is armed each
  // time the port (re)opens.
  const watchdog = createSerialWatchdog({
    timeoutMs: SERIAL_IDLE_TIMEOUT_MS,
    onTimeout: () => {
      console.error(
        `[serial] Sin tramas válidas hace ${SERIAL_IDLE_TIMEOUT_MS} ms ` +
          `(bytes=${state.bytesRecibidos}, válidas=${state.tramasValidas}, descartadas=${state.tramasDescartadas}, ` +
          `última descartada=${JSON.stringify(state.ultimaDescartada)}). Reiniciando proceso.`,
      );
      process.exit(1);
    },
    onNoFramesSinceStart: (elapsedMs) => {
      console.warn(
        `[serial] Sin tramas válidas desde el inicio (${Math.round(elapsedMs / 1000)} s) ` +
          `(bytes=${state.bytesRecibidos}, válidas=${state.tramasValidas}, descartadas=${state.tramasDescartadas}, ` +
          `última descartada=${JSON.stringify(state.ultimaDescartada)}). ` +
          `NO se reinicia el proceso: la balanza puede estar apagada.`,
      );
    },
  });

  let lastLog: string | null = null;

  const onFrame = (raw: string) => {
    state.onRaw(raw, Date.now());
    const trama = parsearTrama(raw);
    if (trama === null) {
      state.onDescartada(raw);
      return;
    }

    state.onValida();
    watchdog.feed();

    socket.emit('balanza-data', buildBalanzaPayload(trama));

    // Log only when the reading changes: frames arrive many times per second
    // and logging each one can exhaust stdout.
    const current = `${trama.valor} ${trama.unidad ?? 'sin unidad'}`;
    if (current !== lastLog) {
      lastLog = current;
      console.log(`[balanza] Emitido: ${current}`);
    }
  };

  // The process never exits because of the serial port: the supervisor keeps
  // retrying (a USB re-enumeration is recovered in-process).
  serialSupervisor = createSerialSupervisor({
    path: PORT,
    baud: BAUD_RATE,
    createPort: () => {
      const port = new SerialPort({ path: PORT, baudRate: BAUD_RATE, autoOpen: false });
      port.pipe(new ReadlineParser({ delimiter: '\r' })).on('data', onFrame);
      return port;
    },
    onOpen: () => watchdog.start(),
    onClose: () => watchdog.stop(),
    onBytes: (count) => state.onBytes(count, Date.now()),
  });
  serialSupervisor.start();
}

if (process.env.NODE_ENV !== 'test') {
  main().catch(console.error);
}
