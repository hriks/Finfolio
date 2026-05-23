import type { Clock } from '../../src/data/clock';

export const fixedClock = (start = 1_700_000_000_000): Clock & { advance(ms: number): void; set(ms: number): void } => {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => { t += ms; },
    set: (ms) => { t = ms; },
  };
};
