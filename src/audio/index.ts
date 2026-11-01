import type { GameAudio, SoundEvent } from '../types';

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle';

interface ParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

interface NodeLike {
  connect(destination: NodeLike): unknown;
  disconnect?(): void;
}

interface GainNodeLike extends NodeLike {
  gain: ParamLike;
}

interface OscillatorNodeLike extends NodeLike {
  type: Wave;
  frequency: ParamLike;
  detune?: ParamLike;
  start(startTime?: number): void;
  stop(stopTime?: number): void;
}

interface FilterNodeLike extends NodeLike {
  type: string;
  frequency: ParamLike;
  Q: ParamLike;
}

interface BufferLike {
  getChannelData(channel: number): Float32Array;
}

interface BufferSourceNodeLike extends NodeLike {
  buffer: BufferLike | null;
  loop: boolean;
  start(startTime?: number): void;
  stop(stopTime?: number): void;
}

interface AudioContextLike {
  currentTime: number;
  state: string;
  sampleRate: number;
  destination: NodeLike;
  createOscillator(): OscillatorNodeLike;
  createGain(): GainNodeLike;
  createBiquadFilter?(): FilterNodeLike;
  createBuffer?(channels: number, length: number, sampleRate: number): BufferLike;
  createBufferSource?(): BufferSourceNodeLike;
  resume?(): Promise<void> | void;
}

type AudioContextConstructor = new () => AudioContextLike;

interface ToneOptions {
  frequency: number;
  duration: number;
  peak: number;
  at?: number;
  type?: Wave;
  attack?: number;
  endFrequency?: number;
  detune?: number;
  filter?: { type: string; frequency: number; q?: number };
}

interface NoiseOptions {
  duration: number;
  peak: number;
  frequency: number;
  at?: number;
  type?: string;
}

const MAX_GAIN = 0.25;
const SILENCE = 0.0001;

function setEnvelope(gain: ParamLike, start: number, duration: number, peak: number, attack: number): void {
  const level = Math.min(MAX_GAIN, Math.max(SILENCE, peak));
  const attackEnd = start + Math.min(Math.max(attack, 0.002), duration * 0.5);
  const end = start + duration;
  gain.setValueAtTime(SILENCE, start);
  gain.linearRampToValueAtTime(level, attackEnd);
  gain.exponentialRampToValueAtTime(SILENCE, end);
}

function tone(context: AudioContextLike, options: ToneOptions): void {
  const start = context.currentTime + (options.at ?? 0);
  const duration = Math.max(0.02, options.duration);
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = options.type ?? 'sine';
  oscillator.frequency.setValueAtTime(options.frequency, start);
  if (options.endFrequency !== undefined) {
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(1, options.endFrequency), start + duration,
    );
  }
  if (options.detune !== undefined && oscillator.detune) {
    oscillator.detune.setValueAtTime(options.detune, start);
  }

  setEnvelope(gain.gain, start, duration, options.peak, options.attack ?? 0.008);

  if (options.filter && context.createBiquadFilter) {
    const filter = context.createBiquadFilter();
    filter.type = options.filter.type;
    filter.frequency.setValueAtTime(options.filter.frequency, start);
    filter.Q.setValueAtTime(options.filter.q ?? 0.8, start);
    oscillator.connect(filter);
    filter.connect(gain);
  } else {
    oscillator.connect(gain);
  }

  gain.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(context: AudioContextLike, options: NoiseOptions): void {
  if (!context.createBuffer || !context.createBufferSource) return;

  const start = context.currentTime + (options.at ?? 0);
  const duration = Math.max(0.02, options.duration);
  const sampleRate = context.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }

  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  setEnvelope(gain.gain, start, duration, options.peak, 0.004);

  if (context.createBiquadFilter) {
    const filter = context.createBiquadFilter();
    filter.type = options.type ?? 'lowpass';
    filter.frequency.setValueAtTime(options.frequency, start);
    filter.Q.setValueAtTime(1, start);
    source.connect(filter);
    filter.connect(gain);
  } else {
    source.connect(gain);
  }

  gain.connect(context.destination);
  source.start(start);
  source.stop(start + duration);
}

function matchFrequency(level: number | undefined): number {
  const raw = typeof level === 'number' && Number.isFinite(level) ? Math.round(level) : 1;
  const step = Math.min(8, Math.max(1, raw));
  const scale = [392, 440, 493.88, 523.25, 587.33, 659.25, 739.99, 783.99];
  return scale[step - 1] ?? scale[0]!;
}

function playSound(context: AudioContextLike, event: SoundEvent, level?: number): void {
  switch (event) {
    case 'select':
      tone(context, { type: 'sine', frequency: 740, duration: 0.08, peak: 0.1 });
      tone(context, { type: 'triangle', frequency: 988, at: 0.015, duration: 0.06, peak: 0.06 });
      break;
    case 'invalid':
      tone(context, {
        type: 'triangle', frequency: 196, endFrequency: 147, duration: 0.17, peak: 0.12,
        filter: { type: 'lowpass', frequency: 900 },
      });
      tone(context, { type: 'sine', frequency: 98, duration: 0.18, peak: 0.08 });
      break;
    case 'match': {
      const frequency = matchFrequency(level);
      tone(context, { type: 'triangle', frequency, duration: 0.18, peak: 0.12 });
      tone(context, { type: 'sine', frequency: frequency * 1.5, at: 0.04, duration: 0.15, peak: 0.07 });
      break;
    }
    case 'hit':
      noise(context, { duration: 0.18, peak: 0.18, frequency: 1400 });
      tone(context, { type: 'sine', frequency: 120, endFrequency: 60, duration: 0.2, peak: 0.12 });
      break;
    case 'shield':
      tone(context, {
        type: 'sine', frequency: 330, endFrequency: 494, duration: 0.28, peak: 0.1,
        filter: { type: 'lowpass', frequency: 1600 },
      });
      tone(context, { type: 'triangle', frequency: 494, endFrequency: 659, at: 0.05, duration: 0.24, peak: 0.06 });
      break;
    case 'heal':
      tone(context, { type: 'sine', frequency: 523.25, duration: 0.22, peak: 0.1 });
      tone(context, { type: 'sine', frequency: 659.25, at: 0.08, duration: 0.22, peak: 0.09 });
      tone(context, { type: 'triangle', frequency: 783.99, at: 0.16, duration: 0.26, peak: 0.08 });
      break;
    case 'gold':
      tone(context, { type: 'triangle', frequency: 880, duration: 0.12, peak: 0.09 });
      tone(context, { type: 'triangle', frequency: 1108.73, at: 0.07, duration: 0.12, peak: 0.08 });
      tone(context, { type: 'sine', frequency: 1318.51, at: 0.14, duration: 0.24, peak: 0.08 });
      break;
    case 'enemyAttack':
      noise(context, { duration: 0.3, peak: 0.14, frequency: 700 });
      tone(context, {
        type: 'sawtooth', frequency: 110, endFrequency: 55, duration: 0.35, peak: 0.09,
        filter: { type: 'lowpass', frequency: 500, q: 1.2 },
      });
      tone(context, { type: 'triangle', frequency: 82, endFrequency: 55, at: 0.02, duration: 0.32, peak: 0.07 });
      break;
    case 'reward':
      tone(context, { type: 'sine', frequency: 659.25, duration: 0.18, peak: 0.09 });
      tone(context, { type: 'sine', frequency: 880, at: 0.08, duration: 0.18, peak: 0.09 });
      tone(context, { type: 'triangle', frequency: 1108.73, at: 0.16, duration: 0.18, peak: 0.08 });
      tone(context, { type: 'sine', frequency: 1318.51, at: 0.24, duration: 0.26, peak: 0.07 });
      break;
    case 'win':
      tone(context, { type: 'triangle', frequency: 523.25, duration: 0.16, peak: 0.1 });
      tone(context, { type: 'triangle', frequency: 659.25, at: 0.12, duration: 0.16, peak: 0.1 });
      tone(context, { type: 'triangle', frequency: 783.99, at: 0.24, duration: 0.18, peak: 0.1 });
      tone(context, { type: 'sine', frequency: 1046.5, at: 0.38, duration: 0.3, peak: 0.11 });
      tone(context, { type: 'sine', frequency: 523.25, at: 0.38, duration: 0.3, peak: 0.06 });
      break;
    case 'lose':
      tone(context, { type: 'sine', frequency: 440, duration: 0.2, peak: 0.1 });
      tone(context, { type: 'sine', frequency: 349.23, at: 0.14, duration: 0.2, peak: 0.1 });
      tone(context, { type: 'triangle', frequency: 293.66, at: 0.28, duration: 0.22, peak: 0.1 });
      tone(context, { type: 'sine', frequency: 220, at: 0.44, duration: 0.3, peak: 0.11 });
      tone(context, { type: 'sine', frequency: 164.81, at: 0.44, duration: 0.3, peak: 0.05 });
      break;
    default:
      break;
  }
}

function resume(context: AudioContextLike): void {
  if (context.state === 'running' || !context.resume) return;
  try {
    const pending = context.resume();
    if (typeof pending === 'object' && pending !== null) {
      void pending.catch(() => undefined);
    }
  } catch {
    return;
  }
}

function obtainContext(): AudioContextLike | null {
  const ctor = (globalThis as unknown as { AudioContext?: AudioContextConstructor }).AudioContext;
  if (!ctor) return null;
  try {
    return new ctor();
  } catch {
    return null;
  }
}

export function createAudio(): GameAudio {
  let context: AudioContextLike | null = null;
  let muted = false;

  return {
    unlock() {
      try {
        if (!context) context = obtainContext();
        if (!context) return;
        resume(context);
        if (!context.createBuffer || !context.createBufferSource) return;
        const source = context.createBufferSource();
        source.buffer = context.createBuffer(1, 1, context.sampleRate || 44100);
        source.connect(context.destination);
        source.start();
      } catch {
        return;
      }
    },
    play(event, level) {
      if (muted) return;
      try {
        if (!context) context = obtainContext();
        if (!context) return;
        resume(context);
        playSound(context, event, level);
      } catch {
        return;
      }
    },
    setMuted(value) {
      muted = Boolean(value);
    },
    isMuted() {
      return muted;
    },
  };
}
