export interface SimClockOptions {
  startAt?: Date;
  rate?: number;
  playing?: boolean;
}

export interface SimClock {
  now(): Date;
  setTime(date: Date): void;
  resetToNow(): void;
  isPlaying(): boolean;
  setPlaying(playing: boolean): void;
  rate(): number;
  setRate(rate: number): void;
  tick(realDeltaMs: number): void;
}

export function createClock(options: SimClockOptions = {}): SimClock {
  let simMs = (options.startAt ?? new Date()).getTime();
  let rate = options.rate ?? 1;
  let playing = options.playing ?? true;

  return {
    now: () => new Date(simMs),
    setTime: (date) => {
      simMs = date.getTime();
    },
    resetToNow: () => {
      simMs = Date.now();
    },
    isPlaying: () => playing,
    setPlaying: (value) => {
      playing = value;
    },
    rate: () => rate,
    setRate: (value) => {
      if (!Number.isFinite(value) || value < 0) throw new Error('rate must be >= 0');
      rate = value;
    },
    tick: (realDeltaMs) => {
      if (!playing) return;
      simMs += realDeltaMs * rate;
    },
  };
}
