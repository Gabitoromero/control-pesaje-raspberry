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

const PORT = process.env.SERIAL_PORT ?? '/dev/ttyUSB0';
const BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE ?? 9600);
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';

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

export function parsearPeso(trama: string): number | null {
  const cleaned = trama.replace(/^\x02/, '').trim();
  const valor = parseFloat(cleaned);
  return isNaN(valor) || !isFinite(valor) ? null : valor;
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

  socket.on('connect', () => {
    console.log(`[socket] Conectado al servidor: ${SERVER_URL}`);
    console.log(`[socket] Identificado con hardwareId: ${hardwareId}`);
  });

  socket.on('disconnect', (reason: string) => {
    console.warn(`[socket] Desconectado: ${reason}. Reconectando...`);

    if (shouldManuallyReconnect(reason)) {
      socket.connect();
    }
  });

  socket.on('connect_error', (err: Error) => {
    console.error(`[socket] Error de conexión: ${err.message}. Reintentando...`);
  });

  socket.connect();

  // --- Puerto serial ---
  const port = new SerialPort({ path: PORT, baudRate: BAUD_RATE });
  const parser = port.pipe(new ReadlineParser({ delimiter: '\r' }));

  port.on('open', () => {
    console.log(`[serial] Puerto abierto: ${PORT} @ ${BAUD_RATE} baud`);
  });

  let lastPeso: number | null = null;

  parser.on('data', (raw: string) => {
    const peso = parsearPeso(raw);
    if (peso === null) return;

    socket.emit('balanza-data', { pesoNeto: peso });

    if (peso !== lastPeso) {
      lastPeso = peso;
      console.log(`[balanza] Emitido: ${peso} kg`);
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
