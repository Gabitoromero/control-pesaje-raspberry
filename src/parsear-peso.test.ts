import { describe, it, expect } from 'vitest';
import { buildBalanzaPayload, parsearTrama } from './parsear-peso';

describe('parsearTrama', () => {
  it('parses a valid frame with STX prefix and no unit', () => {
    expect(parsearTrama('\x02 12.345')).toEqual({ valor: 12.345 });
  });

  it('does not expose a unidad key for unitless frames', () => {
    expect(parsearTrama('\x02 12.345')).not.toHaveProperty('unidad');
  });

  it('parses a valid frame without STX prefix', () => {
    expect(parsearTrama('12.345')).toEqual({ valor: 12.345 });
  });

  it('returns null for an invalid (non numeric) frame', () => {
    expect(parsearTrama('\x02 basura')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parsearTrama('')).toBeNull();
  });

  describe('real frames captured from the new RS232 scale', () => {
    it('parses a positive weight in grams', () => {
      expect(parsearTrama('\n    69.2 g')).toEqual({ valor: 69.2, unidad: 'g' });
    });

    it('parses a negative weight in grams', () => {
      expect(parsearTrama('   -69.4 g')).toEqual({ valor: -69.4, unidad: 'g' });
    });

    it('parses zero in grams', () => {
      expect(parsearTrama('     0.0 g')).toEqual({ valor: 0, unidad: 'g' });
    });
  });

  describe('RS232 scale with unit (protocols 6 and 7)', () => {
    it('parses a kg frame', () => {
      expect(parsearTrama('1.000kg')).toEqual({ valor: 1, unidad: 'kg' });
    });

    it('reports grams without converting them', () => {
      expect(parsearTrama('100.00g')).toEqual({ valor: 100, unidad: 'g' });
      expect(parsearTrama('500g')).toEqual({ valor: 500, unidad: 'g' });
    });

    it('parses negative weights', () => {
      expect(parsearTrama('-0.500kg')).toEqual({ valor: -0.5, unidad: 'kg' });
    });

    it('ignores residual spaces and CR/LF', () => {
      expect(parsearTrama(' 1.000kg\r\n')).toEqual({ valor: 1, unidad: 'kg' });
    });

    it('returns null when there is a unit but no number', () => {
      expect(parsearTrama('kg')).toBeNull();
    });

    it('returns null for an unsupported unit', () => {
      expect(parsearTrama('1.000lb')).toBeNull();
    });
  });

  describe('Ex-cell protocol (protocol 3)', () => {
    it('parses a stable frame with separated sign', () => {
      expect(parsearTrama('ST,NT+ 1.000kg')).toEqual({ valor: 1, unidad: 'kg' });
    });

    it('parses an unstable frame', () => {
      expect(parsearTrama('US,NT+ 0.500kg')).toEqual({ valor: 0.5, unidad: 'kg' });
    });

    it('parses a negative sign with a status header', () => {
      expect(parsearTrama('ST,NT- 0.500kg')).toEqual({ valor: -0.5, unidad: 'kg' });
    });

    it('reports grams inside a frame with header without converting', () => {
      expect(parsearTrama('ST,NT+ 100.0g')).toEqual({ valor: 100, unidad: 'g' });
    });

    it('returns null when the header carries no number', () => {
      expect(parsearTrama('ST,NT+ kg')).toBeNull();
    });
  });

  describe('Yaohua A12 protocol (protocol 2)', () => {
    it('parses the wn header frame', () => {
      expect(parsearTrama('wn+001.000kg')).toEqual({ valor: 1, unidad: 'kg' });
    });
  });

  describe('header and unit variants', () => {
    it('parses the Ex-cell GS variant', () => {
      expect(parsearTrama('US,GS+ 2.000kg')).toEqual({ valor: 2, unidad: 'kg' });
    });

    it('normalizes uppercase units to lowercase', () => {
      expect(parsearTrama('1.000KG')).toEqual({ valor: 1, unidad: 'kg' });
      expect(parsearTrama('100.0G')).toEqual({ valor: 100, unidad: 'g' });
    });

    it('accepts an uppercase wn header', () => {
      expect(parsearTrama('WN+001.000KG')).toEqual({ valor: 1, unidad: 'kg' });
    });

    it('normalizes negative zero to zero', () => {
      const trama = parsearTrama('-0.000kg');
      expect(trama).toEqual({ valor: 0, unidad: 'kg' });
      expect(Object.is(trama?.valor, 0)).toBe(true);
    });
  });

  describe('corrupt or ambiguous frames', () => {
    it.each([
      ['decimal without integer part', '.5'],
      ['decimal comma', '1,500kg'],
      ['decimal comma with kg unit', '1,000kg'],
      ['embedded hyphen', '12-5'],
      ['garbage text before the number', 'basura 12.345'],
      ['unknown header', 'XX,YY+ 1.000kg'],
      ['overload status only', 'OL'],
      ['exponential notation', '1e5'],
    ])('returns null for %s', (_desc, trama) => {
      expect(parsearTrama(trama)).toBeNull();
    });

    it('returns null when the number overflows to Infinity', () => {
      expect(parsearTrama('9'.repeat(400))).toBeNull();
    });

    it('accepts a trailing decimal point', () => {
      expect(parsearTrama('12.kg')).toEqual({ valor: 12, unidad: 'kg' });
    });
  });
});

describe('buildBalanzaPayload', () => {
  it('includes the unit read from the frame', () => {
    expect(buildBalanzaPayload({ valor: 69.2, unidad: 'g' })).toEqual({ pesoNeto: 69.2, unidad: 'g' });
  });

  it('omits the unidad key for unitless (KRETZ) frames', () => {
    const payload = buildBalanzaPayload(parsearTrama('\x02 12.345')!);
    expect(payload).toEqual({ pesoNeto: 12.345 });
    expect(payload).not.toHaveProperty('unidad');
  });
});
