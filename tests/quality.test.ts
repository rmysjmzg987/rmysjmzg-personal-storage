import { describe, it, expect } from 'vitest';
import {
  qualitySettings,
  createFpsSampler,
  shouldDowngrade,
  nextLowerLevel,
} from '../src/core/quality';

describe('qualitySettings', () => {
  it('disables heavy features on low', () => {
    const low = qualitySettings('low');
    expect(low.bloom).toBe(false);
    expect(low.atmosphere).toBe(false);
  });

  it('scales star count with level', () => {
    expect(qualitySettings('low').starCount).toBeLessThan(qualitySettings('high').starCount);
  });
});

describe('createFpsSampler', () => {
  it('reports about 60 fps for 16.7 ms frames', () => {
    const sampler = createFpsSampler(1000);
    for (let i = 0; i < 60; i++) sampler.push(16.7);
    expect(sampler.fps()).toBeGreaterThan(55);
    expect(sampler.fps()).toBeLessThan(65);
  });

  it('forgets frames older than the window', () => {
    const sampler = createFpsSampler(500);
    sampler.push(16.7);
    sampler.push(900);
    expect(sampler.fps()).toBeLessThan(20);
  });
});

describe('shouldDowngrade', () => {
  it('requires sustained low fps', () => {
    expect(shouldDowngrade(20, 1000, 99999)).toBe(false);
    expect(shouldDowngrade(20, 2500, 99999)).toBe(true);
  });

  it('ignores healthy fps', () => {
    expect(shouldDowngrade(58, 5000, 99999)).toBe(false);
  });

  it('respects the cooldown after a downgrade', () => {
    expect(shouldDowngrade(20, 5000, 3000)).toBe(false);
  });
});

describe('nextLowerLevel', () => {
  it('walks high to medium to low to null', () => {
    expect(nextLowerLevel('high')).toBe('medium');
    expect(nextLowerLevel('medium')).toBe('low');
    expect(nextLowerLevel('low')).toBeNull();
  });
});
