import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeDeviceUUID, parsearPeso, shouldManuallyReconnect } from './index';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

vi.mock('node:fs');
vi.mock('node:crypto');

describe('initializeDeviceUUID', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe leer y retornar el UUID si .device-id ya existe', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('mocked-uuid-1234\n');

    const result = initializeDeviceUUID('/mock/cwd');

    expect(fs.existsSync).toHaveBeenCalledWith('/mock/cwd/.device-id');
    expect(fs.readFileSync).toHaveBeenCalledWith('/mock/cwd/.device-id', 'utf8');
    expect(result).toBe('mocked-uuid-1234');
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('debe generar, guardar y retornar un nuevo UUID si .device-id no existe', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(randomUUID).mockReturnValue(
      'new-generated-uuid' as `${string}-${string}-${string}-${string}-${string}`,
    );

    const result = initializeDeviceUUID('/mock/cwd');

    expect(fs.existsSync).toHaveBeenCalledWith('/mock/cwd/.device-id');
    expect(randomUUID).toHaveBeenCalled();
    expect(fs.writeFileSync).toHaveBeenCalledWith('/mock/cwd/.device-id', 'new-generated-uuid', 'utf8');
    expect(result).toBe('new-generated-uuid');
  });
});

describe('parsearPeso', () => {
  it('debe parsear una trama valida con prefijo STX', () => {
    expect(parsearPeso('\x02 12.345')).toBe(12.345);
  });

  it('debe parsear una trama valida sin prefijo STX', () => {
    expect(parsearPeso('12.345')).toBe(12.345);
  });

  it('debe retornar null para una trama invalida (no numerica)', () => {
    expect(parsearPeso('\x02 basura')).toBeNull();
  });

  it('debe retornar null para una cadena vacia', () => {
    expect(parsearPeso('')).toBeNull();
  });

  describe('balanza RS232 con unidad (protocolos 6 y 7)', () => {
    it('debe parsear una trama en kg con unidad', () => {
      expect(parsearPeso('1.000kg')).toBe(1);
    });

    it('debe convertir gramos a kg', () => {
      expect(parsearPeso('100.00g')).toBe(0.1);
    });

    it('debe parsear pesos negativos', () => {
      expect(parsearPeso('-0.500kg')).toBe(-0.5);
    });

    it('debe ignorar espacios y CR/LF residuales', () => {
      expect(parsearPeso(' 1.000kg\r\n')).toBe(1);
    });

    it('debe retornar null si hay unidad pero no hay numero', () => {
      expect(parsearPeso('kg')).toBeNull();
    });

    it('debe retornar null para una unidad no soportada', () => {
      expect(parsearPeso('1.000lb')).toBeNull();
    });
  });

  describe('protocolo Ex-cell (protocolo 3)', () => {
    it('debe parsear una trama estable con signo separado', () => {
      expect(parsearPeso('ST,NT+ 1.000kg')).toBe(1);
    });

    it('debe parsear una trama inestable', () => {
      expect(parsearPeso('US,NT+ 0.500kg')).toBe(0.5);
    });

    it('debe parsear signo negativo con cabecera de estado', () => {
      expect(parsearPeso('ST,NT- 0.500kg')).toBe(-0.5);
    });

    it('debe convertir gramos dentro de una trama con cabecera', () => {
      expect(parsearPeso('ST,NT+ 100.0g')).toBe(0.1);
    });

    it('debe retornar null si la cabecera no trae numero', () => {
      expect(parsearPeso('ST,NT+ kg')).toBeNull();
    });
  });

  describe('protocolo Yaohua A12 (protocolo 2)', () => {
    it('debe parsear la trama con cabecera wn', () => {
      expect(parsearPeso('wn+001.000kg')).toBe(1);
    });
  });

  describe('tramas corruptas o ambiguas', () => {
    it.each([
      ['decimal sin parte entera', '.5'],
      ['coma decimal o separador de miles', '1,500kg'],
      ['guion embebido', '12-5'],
      ['texto basura antes del numero', 'basura 12.345'],
      ['cabecera desconocida', 'XX,YY+ 1.000kg'],
      ['solo estado de sobrecarga', 'OL'],
      ['notacion exponencial', '1e5'],
    ])('debe retornar null para %s', (_desc, trama) => {
      expect(parsearPeso(trama)).toBeNull();
    });

    it('debe retornar null si el numero desborda a Infinity', () => {
      expect(parsearPeso('9'.repeat(400))).toBeNull();
    });

    it('debe aceptar un punto decimal final', () => {
      expect(parsearPeso('12.kg')).toBe(12);
    });
  });
});

describe('shouldManuallyReconnect', () => {
  it('devuelve true cuando el servidor forzó la desconexión (io server disconnect)', () => {
    expect(shouldManuallyReconnect('io server disconnect')).toBe(true);
  });

  it('devuelve false para un corte de red real (transport close)', () => {
    expect(shouldManuallyReconnect('transport close')).toBe(false);
  });

  it('devuelve false para un ping timeout', () => {
    expect(shouldManuallyReconnect('ping timeout')).toBe(false);
  });

  it('devuelve false cuando el propio cliente inició la desconexión', () => {
    expect(shouldManuallyReconnect('io client disconnect')).toBe(false);
  });
});
