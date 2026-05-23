import { fixedClock } from '../helpers/fixed-clock';

describe('fixedClock', () => {
  it('advances time', () => {
    const c = fixedClock(1000);
    expect(c.now()).toBe(1000);
    c.advance(500);
    expect(c.now()).toBe(1500);
  });
});
