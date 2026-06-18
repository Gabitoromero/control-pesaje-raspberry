/**
 * Paso B — Test serial sin servidor.
 * Abre el puerto, imprime cada trama cruda y el peso parseado.
 * Usá esto para verificar la comunicación física antes de conectar al servidor.
 *
 * Uso: pnpm test:serial
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from 'serialport';

const PORT = process.env.SERIAL_PORT ?? '/dev/ttyUSB0';
const BAUD_RATE = Number(process.env.SERIAL_BAUD_RATE ?? 9600);

// Trama KRETZ Single Eco 2: STX (0x02) + "XX.XXX" + CR — delimitamos por CR
const port = new SerialPort({ path: PORT, baudRate: BAUD_RATE });
const parser = port.pipe(new ReadlineParser({ delimiter: '\r' }));

port.on('open', () => {
  console.log(`Puerto abierto: ${PORT} @ ${BAUD_RATE} baud`);
  console.log('Esperando tramas de la balanza...\n');
});

parser.on('data', (raw: string) => {
  console.log('Trama cruda:', JSON.stringify(raw));

  const peso = parsearPeso(raw);
  if (peso !== null) {
    console.log(`Peso parseado: ${peso} kg\n`);
  } else {
    console.warn('Trama no reconocida — ignorada\n');
  }
});

port.on('error', (err: Error) => {
  console.error('Error en puerto serial:', err.message);
  process.exit(1);
});

/**
 * Parsea la trama de la KRETZ Single Eco 2.
 * Formato real: STX (0x02) + "XX.XXX" (el \r ya fue consumido por el parser)
 * Devuelve el peso en kg como número, o null si la trama es inválida.
 */
function parsearPeso(trama: string): number | null {
  // Eliminar STX (0x02) inicial y cualquier espacio
  const cleaned = trama.replace(/^\x02/, '').trim();
  const valor = parseFloat(cleaned);
  return isNaN(valor) || !isFinite(valor) ? null : valor;
}
