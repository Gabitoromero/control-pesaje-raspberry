/**
 * Paso C — Script completo: serial + Socket.IO al servidor central.
 * Lee el peso de la balanza y lo emite al servidor identificándose con lineaProduccionId.
 *
 * Uso: pnpm dev
 */

import 'dotenv/config';
import { SerialPort, ReadlineParser } from 'serialport';
import { io, Socket } from 'socket.io-client';

const PORT = process.env.SERIAL_PORT ?? '/dev/ttyUSB0';
const BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE ?? 9600);
const SERVER_URL = process.env.SERVER_URL ?? 'http://localhost:3000';
const LINEA_ID = Number(process.env.LINEA_PRODUCCION_ID ?? 1);

// --- Socket.IO ---
const socket: Socket = io(SERVER_URL, { autoConnect: false });

socket.on('connect', () => {
  console.log(`[socket] Conectado al servidor: ${SERVER_URL}`);
  socket.emit('join-linea', LINEA_ID);
  console.log(`[socket] Emitiendo como línea ${LINEA_ID}`);
});

socket.on('disconnect', (reason: string) => {
  console.warn(`[socket] Desconectado: ${reason}`);
});

socket.on('connect_error', (err: Error) => {
  console.error(`[socket] Error de conexión: ${err.message}`);
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
 * Parsea trama KRETZ Single Eco 2: "2,XX.XXX"
 * Tipo 2 = peso neto. Devuelve null si la trama es inválida.
 */
function parsearPeso(trama: string): number | null {
  const partes = trama.trim().split(',');
  if (partes.length < 2) return null;
  const [tipo, valorRaw] = partes;
  if (tipo.trim() !== '2') return null;
  const valor = parseFloat(valorRaw.trim());
  return isNaN(valor) ? null : valor;
}
