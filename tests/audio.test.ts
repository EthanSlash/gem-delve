import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAudio } from '../src/audio/index';
import type { SoundEvent } from '../src/types';

const EVENTS: SoundEvent[] = [
  'select', 'invalid', 'match', 'hit', 'shield', 'heal', 'gold',
  'enemyAttack', 'reward', 'win', 'lose',
];

class FakeParam {
  value = 0;

  setValueAtTime(value: number): FakeParam {
    this.value = value;
    return this;
  }

  linearRampToValueAtTime(value: number): FakeParam {
    this.value = value;
    return this;
  }

  exponentialRampToValueAtTime(value: number): FakeParam {
    this.value = value;
    return this;
  }
}

class FakeNode {
  connect(destination: FakeNode): FakeNode {
    return destination;
  }

  disconnect(): void {}
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeOscillator extends FakeNode {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
  started = false;
  stopped = false;

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakeBuffer {
  private readonly data: Float32Array;

  constructor(length: number) {
    this.data = new Float32Array(length);
  }

  getChannelData(): Float32Array {
    return this.data;
  }
}

class FakeBufferSource extends FakeNode {
  buffer: FakeBuffer | null = null;
  loop = false;
  started = false;
  stopped = false;

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.stopped = true;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];

  currentTime = 0;
  state = 'suspended';
  sampleRate = 44100;
  destination = new FakeNode();
  oscillators: FakeOscillator[] = [];
  bufferSources: FakeBufferSource[] = [];
  resumed = 0;
  closed = 0;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createOscillator(): FakeOscillator {
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator;
  }

  createGain(): FakeGain {
    return new FakeGain();
  }

  createBiquadFilter(): FakeFilter {
    return new FakeFilter();
  }

  createBuffer(_channels: number, length: number): FakeBuffer {
    return new FakeBuffer(length);
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source;
  }

  resume(): Promise<void> {
    this.resumed += 1;
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

const audioGlobal = globalThis as { AudioContext?: unknown };

function installFake(): void {
  audioGlobal.AudioContext = FakeAudioContext;
}

beforeEach(() => {
  FakeAudioContext.instances = [];
  delete audioGlobal.AudioContext;
});

afterEach(() => {
  delete audioGlobal.AudioContext;
  FakeAudioContext.instances = [];
});

describe('audio', () => {
  it('imports and plays every event safely without AudioContext', () => {
    const audio = createAudio();
    for (const event of EVENTS) {
      expect(() => audio.play(event)).not.toThrow();
      expect(() => audio.play(event, 8)).not.toThrow();
    }
  });

  it('starts unmuted and toggles mute state', () => {
    const audio = createAudio();
    expect(audio.isMuted()).toBe(false);
    audio.setMuted(true);
    expect(audio.isMuted()).toBe(true);
    audio.setMuted(false);
    expect(audio.isMuted()).toBe(false);
  });

  it('creates the context lazily, once, and resumes it', () => {
    installFake();
    const audio = createAudio();
    expect(FakeAudioContext.instances).toHaveLength(0);

    audio.play('select');
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(FakeAudioContext.instances[0]!.resumed).toBeGreaterThan(0);

    audio.play('match', 2);
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('never creates a context while muted', () => {
    installFake();
    const audio = createAudio();
    audio.setMuted(true);
    for (const event of EVENTS) audio.play(event, 3);
    expect(FakeAudioContext.instances).toHaveLength(0);

    audio.setMuted(false);
    audio.play('select');
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('creates at least one oscillator or buffer source per event', () => {
    installFake();
    const audio = createAudio();
    audio.play('select');
    const context = FakeAudioContext.instances[0]!;

    for (const event of EVENTS) {
      const before = context.oscillators.length + context.bufferSources.length;
      audio.play(event, 1);
      expect(context.oscillators.length + context.bufferSources.length).toBeGreaterThan(before);
    }
  });

  it('raises match pitch with level and caps it at level eight', () => {
    installFake();
    const audio = createAudio();
    for (const level of [1, 2, 8, 9, 100]) audio.play('match', level);

    const oscillators = FakeAudioContext.instances[0]!.oscillators;
    expect(oscillators).toHaveLength(10);
    const main = oscillators.filter((_, index) => index % 2 === 0).map(item => item.frequency.value);
    expect(main[1]!).toBeGreaterThan(main[0]!);
    expect(main[2]!).toBeGreaterThan(main[1]!);
    expect(main[3]!).toBe(main[2]!);
    expect(main[4]!).toBe(main[3]!);
  });
});
