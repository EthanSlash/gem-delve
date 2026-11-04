import { describe, expect, it } from 'vitest';
import { enemyPose, shouldAnimateEnemy } from '../src/ui/enemy-motion';

describe('enemy presentation motion', () => {
  it('uses distinct bounded idle poses without randomness', () => {
    const ids = ['slime', 'caveBat', 'skeleton', 'gargoyle', 'slimeKing'];
    for (const id of ids) {
      const poses = Array.from({ length: 30 }, (_, i) => enemyPose(id, { time: i * 113, reduced: false }));
      expect(poses.some(p => p.x !== 0 || p.y !== 0 || p.scaleY !== 1)).toBe(true);
      for (const pose of poses) {
        expect(Math.abs(pose.x)).toBeLessThanOrEqual(.15);
        expect(Math.abs(pose.y)).toBeLessThanOrEqual(.08);
        expect(pose.scaleX).toBeGreaterThan(.9); expect(pose.scaleX).toBeLessThan(1.1);
        expect(pose.scaleY).toBeGreaterThan(.9); expect(pose.scaleY).toBeLessThan(1.1);
      }
      expect(enemyPose(id, { time: 500, reduced: false })).toEqual(enemyPose(id, { time: 500, reduced: false }));
    }
    expect(enemyPose('caveBat', { time: 300, reduced: false })).not.toEqual(enemyPose('slime', { time: 300, reduced: false }));
  });
  it('anticipates, lunges and recovers within the existing enemy phase', () => {
    const idle = enemyPose('slime', { time: 0, reduced: false });
    const pose = (attackProgress: number) => enemyPose('slime', { time: 0, reduced: false, attackProgress });
    expect(pose(0)).toEqual(idle); expect(pose(1)).toEqual(idle);
    expect(pose(.2).x).toBeGreaterThan(idle.x);
    expect(pose(.48).x).toBeLessThan(-.1);
    expect(pose(.48).rotation).toBeLessThan(0);
    expect(pose(.48).scaleX).toBeGreaterThan(idle.scaleX);
  });
  it('retains hit tint but removes all movement for reduced motion', () => {
    for (const id of ['slime', 'caveBat', 'skeleton', 'gargoyle', 'slimeKing']) {
      expect(enemyPose(id, { time: 400, reduced: true, attackProgress: .48, hitFlash: 100 }))
        .toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, glow: .5 });
    }
    expect(enemyPose('slime', { time: 0, reduced: false, hitFlash: 100 }).rotation).not.toBe(0);
  });
  it('normalizes invalid presentation inputs and schedules idle only for visible combat', () => {
    const pose = enemyPose('unknown', { time: NaN, reduced: false, attackProgress: Infinity, hitFlash: NaN });
    expect(Object.values(pose).every(Number.isFinite)).toBe(true);
    expect(shouldAnimateEnemy('combat', false, false)).toBe(true);
    expect(shouldAnimateEnemy('combat', true, false)).toBe(false);
    expect(shouldAnimateEnemy('combat', false, true)).toBe(false);
    for (const screen of ['title', 'tutorial', 'reward', 'won', 'lost']) expect(shouldAnimateEnemy(screen, false, false)).toBe(false);
  });
});
