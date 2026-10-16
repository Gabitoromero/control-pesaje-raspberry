import { describe, it, expect } from 'vitest';
import { createRbState } from './rb-state';

describe('createRbState', () => {
  it('starts with zeroed counters and empty rings', () => {
    const state = createRbState();
    expect(state.bytesRecibidos).toBe(0);
    expect(state.tramasValidas).toBe(0);
    expect(state.tramasDescartadas).toBe(0);
    expect(state.ultimaDescartada).toBeNull();
    expect(state.ultimoByteAt).toBeNull();
    expect(state.tramasCrudas.toArray()).toEqual([]);
    expect(state.logs.toArray()).toEqual([]);
  });

  it('onBytes accumulates bytes and records the time of the last byte', () => {
    const state = createRbState();
    state.onBytes(10, 1000);
    state.onBytes(5, 2000);
    expect(state.bytesRecibidos).toBe(15);
    expect(state.ultimoByteAt).toBe(2000);
  });

  it('onRaw stores timestamped raw frames truncated to 80 chars', () => {
    const state = createRbState();
    state.onRaw('a'.repeat(200), 1234);
    expect(state.tramasCrudas.toArray()).toEqual([{ t: 1234, raw: 'a'.repeat(80) }]);
  });

  it('keeps the last 100 raw frames by default (newest last)', () => {
    const state = createRbState();
    for (let i = 0; i < 250; i++) state.onRaw(`f${i}`, i);
    const frames = state.tramasCrudas.toArray();
    expect(frames).toHaveLength(100);
    expect(frames[0]).toEqual({ t: 150, raw: 'f150' });
    expect(frames[99]).toEqual({ t: 249, raw: 'f249' });
  });

  it('keeps the last 50 log lines by default', () => {
    const state = createRbState();
    for (let i = 0; i < 120; i++) state.logs.push(`line ${i}`);
    const logs = state.logs.toArray();
    expect(logs).toHaveLength(50);
    expect(logs[0]).toBe('line 70');
  });

  it('onValida increments valid frames', () => {
    const state = createRbState();
    state.onValida();
    state.onValida();
    expect(state.tramasValidas).toBe(2);
  });

  it('onDescartada increments discarded frames and keeps the last one (40 chars)', () => {
    const state = createRbState();
    state.onDescartada('first');
    state.onDescartada('z'.repeat(100));
    expect(state.tramasDescartadas).toBe(2);
    expect(state.ultimaDescartada).toBe('z'.repeat(40));
  });
});
