import { describe, it, expect } from 'vitest';
import { createClock } from '../src/core/clock';

const T0 = new Date('2026-09-16T00:00:00.000Z');

describe('createClock', () => {
  it('starts at the given time and rate 1', () => {
    const clock = createClock({ startAt: T0 });
    expect(clock.now().toISOString()).toBe(T0.toISOString());
    expect(clock.rate()).toBe(1);
    expect(clock.isPlaying()).toBe(true);
  });

  it('advances by real delta times rate', () => {
    const clock = createClock({ startAt: T0, rate: 60 });
    clock.tick(16.7);
    expect(clock.now().getTime() - T0.getTime()).toBeCloseTo(16.7 * 60, 3);
  });

  it('does not advance while paused', () => {
    const clock = createClock({ startAt: T0, rate: 600 });
    clock.setPlaying(false);
    clock.tick(1000);
    expect(clock.now().getTime()).toBe(T0.getTime());
  });

  it('rejects negative rates', () => {
    const clock = createClock({ startAt: T0 });
    expect(() => clock.setRate(-1)).toThrow();
  });

  it('resets to device time', () => {
    const clock = createClock({ startAt: T0 });
    clock.resetToNow();
    expect(Math.abs(clock.now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
