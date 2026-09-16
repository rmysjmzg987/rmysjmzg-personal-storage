import { describe, it, expect } from 'vitest';
import { generateFallbackPixels } from '../src/core/earth-texture';

describe('generateFallbackPixels', () => {
  const w = 64;
  const h = 32;
  const px = generateFallbackPixels(w, h);

  it('produces RGBA bytes for every texel', () => {
    expect(px.length).toBe(w * h * 4);
  });

  it('paints the poles light and the oceans blue', () => {
    const top = (0 * w + 32) * 4;
    const middle = (16 * w + 3) * 4;
    expect(px[top]).toBeGreaterThan(200);
    expect(px[middle + 2]).toBeGreaterThan(px[middle]);
  });

  it('is deterministic', () => {
    expect(Array.from(generateFallbackPixels(w, h))).toEqual(Array.from(px));
  });
});
