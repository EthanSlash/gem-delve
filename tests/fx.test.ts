import { describe, expect, it } from 'vitest';
import { Effects } from '../src/ui/fx';

describe('visual effects', () => {
  it('caps particles at 80, dropping the oldest first', () => {
    const fx = new Effects(false, () => .5);
    for (let i = 0; i < 21; i++) fx.burst(i, 0, 'red', 30);
    expect(fx.particles).toHaveLength(80);
    expect(fx.particles[0]!.x).toBe(1);
    expect(fx.particles.at(-1)!.x).toBe(20);
  });

  it('expires particles and becomes idle after all effects finish', () => {
    const fx = new Effects(false, () => .5);
    fx.burst(0, 0, 'green', 30);
    fx.hit(); fx.attack(); fx.setHp(100, 30);
    fx.number('enemy', '-70', '#fff');
    expect(fx.idle).toBe(false);
    for (let i = 0; i < 13; i++) fx.update(50);
    expect(fx.particles).toHaveLength(0);
    expect(fx.numbers).toHaveLength(0);
    expect(fx.trail).toBe(30);
    expect(fx.idle).toBe(true);
  });

  it('clamps a huge frame gap to 50ms', () => {
    const fx = new Effects(false, () => .5);
    fx.burst(0, 0, 'yellow', 30);
    fx.hit(); fx.attack(); fx.setHp(100, 20);
    fx.number('coin', '+5', '#fff');
    fx.update(100_000);
    expect(fx.particles[0]!.age).toBe(50);
    expect(fx.numbers[0]!.age).toBe(50);
    expect(fx.flash).toBe(150);
    expect(fx.shake).toBe(200);
    expect(fx.trail).toBe(90);
  });

  it('suppresses particles and shake for reduced motion but keeps numbers and hp', () => {
    const fx = new Effects(true, () => { throw new Error('random should not be used'); });
    fx.burst(0, 0, 'purple', 30); fx.attack();
    fx.setHp(100, 60); fx.number('heart', '+4', '#fff');
    expect(fx.particles).toHaveLength(0);
    expect(fx.shake).toBe(0);
    expect(fx.numbers).toHaveLength(1);
    for (let i = 0; i < 8; i++) fx.update(50);
    expect(fx.trail).toBe(60);
    for (let i = 0; i < 5; i++) fx.update(50);
    expect(fx.idle).toBe(true);
  });
});
