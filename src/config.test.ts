import { describe, it, expect } from 'vitest';
import { parseSerialIdleTimeoutMs } from './config';

describe('parseSerialIdleTimeoutMs', () => {
  it.each([
    [undefined, 0],
    ['', 0],
    ['   ', 0],
    ['0', 0],
    ['abc', 0],
    ['-5', 0],
    ['NaN', 0],
    ['Infinity', 0],
  ])('treats %j as disabled (0)', (raw, expected) => {
    expect(parseSerialIdleTimeoutMs(raw)).toBe(expected);
  });

  it('returns a positive number of milliseconds as is', () => {
    expect(parseSerialIdleTimeoutMs('30000')).toBe(30000);
  });

  it('truncates fractional values', () => {
    expect(parseSerialIdleTimeoutMs('1500.9')).toBe(1500);
  });
});
