// Cabecera opcional (Ex-cell "ST,NT" / "US,GS", Yaohua A12 "wn"), signo con
// espacios opcionales, numero y unidad opcional. Anclada en ambos extremos:
// ante una trama corrupta se prefiere descartar a devolver un peso falso.
// Cubre KRETZ Single Eco 2 ("\x02 12.345") y RS232 protocolos 2, 3, 6 y 7.
const TRAMA_PESO = /^(?:(?:ST|US),(?:NT|GS)|wn)?\s*([+-]?)\s*(\d+(?:\.\d*)?)\s*(kg|g)?$/i;

/**
 * Devuelve el peso en kg, o null si la trama no es reconocida.
 * No expone el flag de estabilidad (ST/US) de Ex-cell.
 */
export function parsearPeso(trama: string): number | null {
  const cleaned = trama.replace(/^\x02/, '').trim();
  const match = TRAMA_PESO.exec(cleaned);
  if (!match) return null;

  const [, signo, numero, unidad] = match;
  const valor = parseFloat(numero) * (signo === '-' ? -1 : 1);
  if (!Number.isFinite(valor)) return null;

  return unidad?.toLowerCase() === 'g' ? valor / 1000 : valor;
}
