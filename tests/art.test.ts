import { describe, expect, it } from 'vitest';
import { cacheKey, keepRecentSizes } from '../src/ui/art';

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
