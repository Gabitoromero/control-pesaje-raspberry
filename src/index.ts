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

// --- Hardware ID (UUID) ---
const deviceIdPath = path.join(process.cwd(), '.device-id');
let hardwareId: string;

if (fs.existsSync(deviceIdPath)) {
  hardwareId = fs.readFileSync(deviceIdPath, 'utf8').trim();
} else {
  hardwareId = randomUUID();
  fs.writeFileSync(deviceIdPath, hardwareId, 'utf8');
  console.log(`[setup] Nuevo hardware ID generado y guardado: ${hardwareId}`);
}

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

parser.on('data', (raw: string) => {
  const peso = parsearPeso(raw);
  if (peso === null) return;

  socket.emit('balanza-data', { pesoNeto: peso });
  console.log(`[balanza] Emitido: ${peso} kg`);
});

port.on('error', (err: Error) => {
  console.error('[serial] Error:', err.message);
  process.exit(1);
});

/**
 * Parsea trama KRETZ Single Eco 2: STX (0x02) + "XX.XXX"
 * Devuelve null si la trama es inválida.
 */
function parsearPeso(trama: string): number | null {
  const cleaned = trama.replace(/^\x02/, '').trim();
  const valor = parseFloat(cleaned);
  return isNaN(valor) || !isFinite(valor) ? null : valor;
}
