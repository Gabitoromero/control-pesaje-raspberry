// Cabecera opcional (Ex-cell "ST,NT" / "US,GS", Yaohua A12 "wn"), signo con
// espacios opcionales, numero y unidad opcional. Anclada en ambos extremos:
// ante una trama corrupta se prefiere descartar a devolver un peso falso.
// Cubre KRETZ Single Eco 2 ("\x02 12.345") y RS232 protocolos 2, 3, 6 y 7.
const TRAMA_PESO = /^(?:(?:ST|US),(?:NT|GS)|wn)?\s*([+-]?)\s*(\d+(?:\.\d*)?)\s*(kg|g)?$/i;

export type UnidadTrama = 'kg' | 'g';

export interface Trama {
  valor: number;
  unidad?: UnidadTrama;
}

/**
 * Parsea una trama de la balanza. Devuelve el valor tal cual lo leyo y la
 * unidad declarada en la trama (si la hay); NO convierte unidades: la unica
 * conversion vive en el backend. Las tramas sin unidad (KRETZ) no llevan la
 * clave `unidad`. Devuelve null si la trama no es reconocida.
 * No expone el flag de estabilidad (ST/US) de Ex-cell.
 */
export function parsearTrama(trama: string): Trama | null {
  const cleaned = trama.replace(/^\x02/, '').trim();
  const match = TRAMA_PESO.exec(cleaned);
  if (!match) return null;

  const [, signo, numero, unidad] = match;
  const valor = parseFloat(numero) * (signo === '-' ? -1 : 1);
  if (!Number.isFinite(valor)) return null;

  // `|| 0` normaliza -0 (balanza tarada con signo negativo) a 0
  return unidad
    ? { valor: valor || 0, unidad: unidad.toLowerCase() as UnidadTrama }
    : { valor: valor || 0 };
}

/** Payload de `balanza-data`: `unidad` solo se envia si la trama la declara. */
export function buildBalanzaPayload(trama: Trama): { pesoNeto: number; unidad?: UnidadTrama } {
  return { pesoNeto: trama.valor, ...(trama.unidad ? { unidad: trama.unidad } : {}) };
}
