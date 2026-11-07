import { describe, expect, it } from 'vitest';
import { ENEMY_IMAGE_URLS, cacheKey, enemyImageUrls, fitContain, keepRecentSizes, rasterScale } from '../src/ui/art';
import { GAME_CONTENT } from '../src/data/index';
import { enemyPose } from '../src/ui/enemy-motion';

describe('raster scale steps', () => {
  it('rounds up to quarter steps, never below 1, and keeps exact steps', () => {
    expect(rasterScale(2)).toBe(2);
    expect(rasterScale(2 + 1e-12)).toBe(2);
    expect(rasterScale(2.01)).toBe(2.25);
    expect(rasterScale(1.1)).toBe(1.25);
    expect(rasterScale(0.5)).toBe(1);
    expect(rasterScale(NaN)).toBe(1);
  });

  it('gives an idle breathing enemy at most two cache variants, so the cache keeps hitting', () => {
    for (const dpr of [1, 1.5, 2, 2.625, 3]) for (const id of GAME_CONTENT.enemies.map(enemy => enemy.id)) {
      const steps = new Set<number>();
      for (let time = 0; time < 5000; time += 16) {
        const pose = enemyPose(id, { time, reduced: false });
        const raw = dpr * Math.max(Math.abs(pose.scaleX), Math.abs(pose.scaleY));
        const step = rasterScale(raw);
        expect(step).toBeGreaterThanOrEqual(raw - 1e-9);
        steps.add(step);
      }
      expect(steps.size).toBeLessThanOrEqual(2);
    }
  });
});

describe('enemy images', () => {
  it('maps files to enemy ids by name and prefers webp over png', () => {
    expect(enemyImageUrls({
      '../assets/enemies/slime.png': 'a.png',
      '../assets/enemies/caveBat.webp': 'b.webp',
      '../assets/enemies/caveBat.png': 'b.png',
      '../assets/enemies/notes.txt': 'c.txt',
    })).toEqual({ slime: 'a.png', caveBat: 'b.webp' });
  });

  it('only ships images named after an existing enemy', () => {
    const ids = GAME_CONTENT.enemies.map(enemy => enemy.id);
    for (const id of Object.keys(ENEMY_IMAGE_URLS)) expect(ids).toContain(id);
  });

  it('fits an image inside the box, keeping its aspect ratio and centering it', () => {
    expect(fitContain(512, 512, 78, 78)).toEqual({ x: 0, y: 0, w: 78, h: 78 });
    expect(fitContain(200, 100, 80, 80)).toEqual({ x: 0, y: 20, w: 80, h: 40 });
    expect(fitContain(100, 200, 80, 80)).toEqual({ x: 20, y: 0, w: 40, h: 80 });
    expect(fitContain(0, 0, 80, 60)).toEqual({ x: 0, y: 0, w: 80, h: 60 });
  });
});

describe('art raster cache keys', () => {
  it('imports without a DOM and separates sprite types and CSS sizes', () => {
    const key = cacheKey('red', 40, 40, 2);
    expect(key).toBe(cacheKey('red', 40, 40, 2));
    expect(key).not.toBe(cacheKey('junk', 40, 40, 2));
    expect(key).not.toBe(cacheKey('red', 40, 41, 2));
  });

  it('separates different physical resolutions, including fractional DPR', () => {
    expect(cacheKey('green', 35, 35, 1)).not.toBe(cacheKey('green', 35, 35, 2));
    expect(cacheKey('green', 35, 35, 1.5)).toContain('53x53');
    expect(cacheKey('wall', 375, 812, 2)).toContain('750x1624');
  });
});

describe('sprite size cache', () => {
  it('keeps two recent size/DPR variants, refreshing hits and evicting older ones', () => {
    const first = cacheKey('red', 40, 40, 1);
    const second = cacheKey('red', 40, 40, 2);
    const third = cacheKey('red', 48, 48, 2);
    const original = new Map([[first, 'first']]);
    const two = keepRecentSizes(original, second, 'second');
    const refreshed = keepRecentSizes(two, first, 'first');
    const three = keepRecentSizes(refreshed, third, 'third');
    expect([...three.keys()]).toEqual([first, third]);
    expect(three.has(second)).toBe(false);
    expect(original.has(second)).toBe(false);
    expect(keepRecentSizes(three, second, 'new').has(first)).toBe(false);
  });
});
