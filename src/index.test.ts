import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeDeviceUUID, parsearPeso } from './index';
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
});
