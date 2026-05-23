import { DELETE_WINDOW_MS, AUTO_CONFIRM_CONFIDENCE } from '../../src/types/domain';

describe('domain constants', () => {
  it('delete window is 5 minutes', () => {
    expect(DELETE_WINDOW_MS).toBe(300_000);
  });
  it('auto-confirm threshold is 0.85', () => {
    expect(AUTO_CONFIRM_CONFIDENCE).toBeCloseTo(0.85);
  });
});
