import { createRingBuffer, type RingBuffer } from './ring-buffer';

export interface RawFrame {
  t: number;
  raw: string;
}

export interface RbState {
  bytesRecibidos: number;
  tramasValidas: number;
  tramasDescartadas: number;
  ultimaDescartada: string | null;
  ultimoByteAt: number | null;
  tramasCrudas: RingBuffer<RawFrame>;
  logs: RingBuffer<string>;
  onBytes: (count: number, now: number) => void;
  onRaw: (raw: string, now: number) => void;
  onValida: () => void;
  onDescartada: (raw: string) => void;
}

const RAW_MAX_LENGTH = 80;
const DISCARDED_MAX_LENGTH = 40;

export function createRbState({ rawCapacity = 100, logCapacity = 50 } = {}): RbState {
  const state: RbState = {
    bytesRecibidos: 0,
    tramasValidas: 0,
    tramasDescartadas: 0,
    ultimaDescartada: null,
    ultimoByteAt: null,
    tramasCrudas: createRingBuffer<RawFrame>(rawCapacity),
    logs: createRingBuffer<string>(logCapacity),
    onBytes(count, now) {
      state.bytesRecibidos += count;
      state.ultimoByteAt = now;
    },
    onRaw(raw, now) {
      state.tramasCrudas.push({ t: now, raw: raw.slice(0, RAW_MAX_LENGTH) });
    },
    onValida() {
      state.tramasValidas++;
    },
    onDescartada(raw) {
      state.tramasDescartadas++;
      state.ultimaDescartada = raw.slice(0, DISCARDED_MAX_LENGTH);
    },
  };
  return state;
}
