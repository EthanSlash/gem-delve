import { describe, expect, it } from 'vitest';
import { cacheKey } from '../src/ui/art';

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
