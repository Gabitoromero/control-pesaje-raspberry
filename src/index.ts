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

const PORT = process.env.SERIAL_PORT ?? '/dev/ttyUSB0';
const BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE ?? 9600);
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
// 0 disables the watchdog.
const SERIAL_IDLE_TIMEOUT_MS = Number(process.env.SERIAL_IDLE_TIMEOUT_MS ?? 30_000);

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
  const port = new SerialPort({ path: PORT, baudRate: BAUD_RATE });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\r' }));

  let bytesRecibidos = 0;
  let tramasValidas = 0;
  let tramasDescartadas = 0;
  let ultimaDescartada: string | null = null;

  // Exiting lets systemd (Restart=always) reopen the port with a fresh handle,
  // which is what recovers a hung USB-serial adapter.
  const watchdog = createSerialWatchdog({
    timeoutMs: SERIAL_IDLE_TIMEOUT_MS,
    onTimeout: () => {
      console.error(
        `[serial] Sin tramas válidas hace ${SERIAL_IDLE_TIMEOUT_MS} ms ` +
          `(bytes=${bytesRecibidos}, válidas=${tramasValidas}, descartadas=${tramasDescartadas}, ` +
          `última descartada=${JSON.stringify(ultimaDescartada)}). Reiniciando proceso.`,
      );
      process.exit(1);
    },
    onNoFramesSinceStart: (elapsedMs) => {
      console.warn(
        `[serial] Sin tramas válidas desde el inicio (${Math.round(elapsedMs / 1000)} s) ` +
          `(bytes=${bytesRecibidos}, válidas=${tramasValidas}, descartadas=${tramasDescartadas}, ` +
          `última descartada=${JSON.stringify(ultimaDescartada)}). ` +
          `NO se reinicia el proceso: la balanza puede estar apagada.`,
      );
    },
  });

  port.on('open', () => {
    console.log(`[serial] Puerto abierto: ${PORT} @ ${BAUD_RATE} baud`);
    watchdog.start();
  });

  port.on('data', (chunk: Buffer) => {
    bytesRecibidos += chunk.length;
  });

  port.on('close', () => {
    console.error('[serial] Puerto cerrado inesperadamente. Reiniciando proceso.');
    watchdog.stop();
    process.exit(1);
  });

  let lastLog: string | null = null;

  parser.on('data', (raw: string) => {
    const trama = parsearTrama(raw);
    if (trama === null) {
      tramasDescartadas++;
      ultimaDescartada = raw.slice(0, 40);
      return;
    }

    tramasValidas++;
    watchdog.feed();

    socket.emit('balanza-data', buildBalanzaPayload(trama));

    // Log only when the reading changes: frames arrive many times per second
    // and logging each one can exhaust stdout.
    const current = `${trama.valor} ${trama.unidad ?? 'sin unidad'}`;
    if (current !== lastLog) {
      lastLog = current;
      console.log(`[balanza] Emitido: ${current}`);
    }
  });

  port.on('error', (err: Error) => {
    console.error('[serial] Error:', err.message);
    process.exit(1);
  });
}

if (process.env.NODE_ENV !== 'test') {
  main().catch(console.error);
}
