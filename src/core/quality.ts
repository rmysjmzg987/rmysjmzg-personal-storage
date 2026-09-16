export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualitySettings {
  pixelRatioCap: number;
  bloom: boolean;
  atmosphere: boolean;
  starCount: number;
  segments: number;
}

const PRESETS: Record<QualityLevel, QualitySettings> = {
  low: { pixelRatioCap: 1, bloom: false, atmosphere: false, starCount: 2500, segments: 48 },
  medium: { pixelRatioCap: 1.5, bloom: true, atmosphere: true, starCount: 6000, segments: 72 },
  high: { pixelRatioCap: 2, bloom: true, atmosphere: true, starCount: 12000, segments: 96 },
};

export function qualitySettings(level: QualityLevel): QualitySettings {
  return PRESETS[level];
}

export function nextLowerLevel(level: QualityLevel): QualityLevel | null {
  if (level === 'high') return 'medium';
  if (level === 'medium') return 'low';
  return null;
}

export function createFpsSampler(windowMs: number): {
  push(deltaMs: number): void;
  fps(): number;
  reset(): void;
} {
  const frames: { at: number; dt: number }[] = [];
  let clock = 0;
  return {
    push(deltaMs) {
      clock += deltaMs;
      frames.push({ at: clock, dt: deltaMs });
      while (frames.length > 0 && clock - frames[0].at > windowMs) frames.shift();
    },
    fps() {
      if (frames.length === 0) return 0;
      const total = frames.reduce((sum, f) => sum + f.dt, 0);
      return total > 0 ? (frames.length * 1000) / total : 0;
    },
    reset() {
      frames.length = 0;
      clock = 0;
    },
  };
}

export function shouldDowngrade(fps: number, lowFpsMs: number, msSinceLastDowngrade: number): boolean {
  return fps < 30 && lowFpsMs >= 2000 && msSinceLastDowngrade >= 10000;
}
