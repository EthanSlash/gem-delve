import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../src/audio/index';
import { MUSIC, notesBetween } from '../src/audio/music';
import type { MusicTrack } from '../src/types';

class Param {
  value = 0;
  changes: { value: number; time: number }[] = [];
  setValueAtTime(value: number, time: number) { this.value = value; this.changes.push({ value, time }); }
  linearRampToValueAtTime(value: number, time: number) { this.setValueAtTime(value, time); }
  exponentialRampToValueAtTime(value: number, time: number) { this.setValueAtTime(value, time); }
}
class Node {
  to: Node | null = null;
  onended: (() => void) | null = null;
  connect(to: Node) { this.to = to; }
  disconnect() { this.to = null; }
  start(_at?: number) {}
  stop(_at?: number) {}
}
class Gain extends Node { gain = new Param(); }
class Oscillator extends Node { type = 'sine'; frequency = new Param(); }
class Filter extends Node { type = 'lowpass'; frequency = new Param(); Q = new Param(); }
class Buffer { getChannelData() { return new Float32Array(5720); } }
class BufferSource extends Node { buffer: Buffer | null = null; }
class FakeContext {
  static instances: FakeContext[] = [];
  currentTime = 0;
  state = 'running';
  sampleRate = 44100;
  destination = new Node();
  gains: Gain[] = [];
  oscillators: Oscillator[] = [];
  sources: BufferSource[] = [];
  constructor() { FakeContext.instances.push(this); }
  createGain() { const gain = new Gain(); this.gains.push(gain); return gain; }
  createOscillator() { const source = new Oscillator(); this.oscillators.push(source); return source; }
  createBuffer(_channels: number, _length: number, _rate: number) { return new Buffer(); }
  createBufferSource() { const source = new BufferSource(); this.sources.push(source); return source; }
  createBiquadFilter() { return new Filter(); }
}
const audioGlobal = globalThis as { AudioContext?: unknown };
beforeEach(() => { vi.useFakeTimers(); FakeContext.instances = []; audioGlobal.AudioContext = FakeContext; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); delete audioGlobal.AudioContext; });

describe('original loop data', () => {
  it('has sixteen bars of in-range notes, with distinct A and B sections', () => {
    for (const track of ['title', 'combat', 'boss'] as MusicTrack[]) {
      const piece = MUSIC[track];
      expect(piece.beats).toBe(64);
      expect(piece.notes.length).toBeGreaterThan(50);
      expect(piece.notes.every(n => n.beat >= 0 && n.beat < piece.beats && n.length > 0)).toBe(true);
      expect(piece.notes.filter(n => n.beat < 32)).not.toEqual(piece.notes.filter(n => n.beat >= 32));
    }
  });
  it('wraps at both ends of a half-open beat window without missing or duplicating notes', () => {
    for (const track of ['title', 'combat', 'boss'] as MusicTrack[]) {
      const beginning = notesBetween(track, 0, 1);
      const wrap = notesBetween(track, 63, 65);
      expect(wrap.filter(n => n.beat >= 64).map(n => n.beat - 64)).toEqual(beginning.map(n => n.beat));
      expect(notesBetween(track, 64, 128).length).toBe(MUSIC[track].notes.length);
      expect(notesBetween(track, -1, 1).some(n => n.beat === 0)).toBe(true);
      expect(notesBetween(track, 1, 1)).toEqual([]);
    }
  });
});

describe('music scheduler', () => {
  it('remembers the requested track until unlock and keeps the same track playing', () => {
    const audio = createAudio();
    audio.setMusic('combat');
    expect(FakeContext.instances).toHaveLength(0);
    audio.unlock();
    const context = FakeContext.instances[0]!;
    expect(context.oscillators.length).toBeGreaterThan(0);
    const buses = context.gains.filter(g => g.to === context.destination);
    expect(buses).toHaveLength(1);
    audio.setMusic('combat');
    expect(context.gains.filter(g => g.to === context.destination)).toHaveLength(1);
    audio.setMusic('boss');
    expect(context.gains.filter(g => g.to === context.destination)).toHaveLength(2);
    expect(buses[0]!.gain.changes.at(-1)?.value).toBe(0);
  });
  it('mutes only music and never schedules further notes while muted or suspended', () => {
    const audio = createAudio();
    audio.setMusic('title'); audio.unlock();
    const context = FakeContext.instances[0]!;
    audio.setMusicMuted(true);
    expect(audio.isMusicMuted()).toBe(true);
    const count = context.oscillators.length;
    context.currentTime += 1;
    vi.advanceTimersByTime(160);
    expect(context.oscillators).toHaveLength(count);
    audio.setMusicMuted(false);
    expect(context.oscillators.length).toBeGreaterThan(count);
    audio.setSuspended(true);
    const paused = context.oscillators.length;
    context.currentTime += 3;
    vi.advanceTimersByTime(160);
    expect(context.oscillators).toHaveLength(paused);
    audio.setSuspended(false);
    expect(context.oscillators.length).toBeGreaterThan(paused);
  });
  it('keeps sound-effect muting independent from the music bus', () => {
    const audio = createAudio();
    audio.setMuted(true);
    audio.setMusic('title'); audio.unlock();
    const context = FakeContext.instances[0]!;
    const before = context.oscillators.length;
    audio.play('select');
    expect(context.oscillators.length).toBe(before);
    context.currentTime += .3;
    vi.advanceTimersByTime(40);
    expect(context.oscillators.length).toBeGreaterThan(before);
    expect(context.gains.filter(g => g.to === context.destination).every(g => g.gain.value <= .1)).toBe(true);
  });
  it('is safe without Web Audio for every music operation', () => {
    delete audioGlobal.AudioContext;
    const audio = createAudio();
    expect(() => { audio.setMusic('boss'); audio.unlock(); audio.setMusicMuted(true);
      audio.setSuspended(true); audio.setSuspended(false); audio.setMusic(null); }).not.toThrow();
  });
});
