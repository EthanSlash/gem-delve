import type { GemColor } from '../types';

export interface Particle {
  x: number; y: number; vx: number; vy: number; size: number;
  color: GemColor; age: number; life: number;
}
export type FloatAnchor = 'enemy' | 'heart' | 'shield' | 'coin';
export interface FloatingNumber { anchor: FloatAnchor; value: string; color: string; age: number }

// All time values are milliseconds. This system has no dependency on game RNG or the DOM.
export class Effects {
  readonly particles: Particle[] = [];
  readonly numbers: FloatingNumber[] = [];
  flash = 0;
  shake = 0;
  trail = 0;
  private trailStart = 0;
  private trailTarget = 0;
  private trailAge = 400;

  constructor(readonly reduced: boolean, private readonly random: () => number = Math.random) {}

  burst(x: number, y: number, color: GemColor, cell: number) {
    if (this.reduced) return;
    for (let i = 0; i < 4; i++) {
      const angle = this.random() * Math.PI * 2;
      const speed = cell * (1.1 + this.random() * 1.5);
      if (this.particles.length >= 80) this.particles.shift();
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - cell,
        size: Math.max(2, cell * (.06 + this.random() * .06)), color, age: 0, life: 350 + this.random() * 250 });
    }
  }

  hit() { this.flash = 200; }
  attack() { if (!this.reduced) this.shake = 250; }
  number(anchor: FloatAnchor, value: string, color: string) {
    this.numbers.push({ anchor, value, color, age: 0 });
  }
  setHp(previous: number, current: number) {
    this.trailStart = Math.max(previous, this.trail);
    this.trailTarget = current;
    this.trail = Math.max(current, this.trailStart);
    this.trailAge = this.trail > current ? 0 : 400;
  }
  reset() {
    this.particles.length = 0; this.numbers.length = 0;
    this.flash = 0; this.shake = 0; this.trail = 0;
    this.trailStart = 0; this.trailTarget = 0; this.trailAge = 400;
  }
  update(dt: number) {
    const step = Math.min(50, Math.max(0, Number.isFinite(dt) ? dt : 0));
    this.flash = Math.max(0, this.flash - step);
    this.shake = Math.max(0, this.shake - step);
    if (this.trailAge < 400) {
      this.trailAge = Math.min(400, this.trailAge + step);
      this.trail = this.trailStart + (this.trailTarget - this.trailStart) * this.trailAge / 400;
    }
    for (const p of this.particles) {
      p.age += step;
      p.x += p.vx * step / 1000; p.y += p.vy * step / 1000;
      p.vy += 180 * step / 1000;
    }
    for (let i = this.particles.length - 1; i >= 0; i--) if (this.particles[i]!.age >= this.particles[i]!.life) this.particles.splice(i, 1);
    for (const number of this.numbers) number.age += step;
    for (let i = this.numbers.length - 1; i >= 0; i--) if (this.numbers[i]!.age >= 650) this.numbers.splice(i, 1);
  }
  get idle() {
    return !this.particles.length && !this.numbers.length && !this.flash && !this.shake && this.trailAge >= 400;
  }
}
