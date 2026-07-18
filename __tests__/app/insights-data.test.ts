import { startOfDay, endOfDay } from 'date-fns';
import { periodWindow } from '../../src/app/screens/insights/insights-data';

// Saturday 2026-07-18 14:30 local time
const NOW = new Date(2026, 6, 18, 14, 30, 0);

describe('periodWindow', () => {
  it('month = current calendar month to end of today', () => {
    const w = periodWindow('month', NOW);
    expect(w.start).toBe(new Date(2026, 6, 1).getTime());
    expect(w.end).toBe(endOfDay(NOW).getTime());
    expect(w.label).toBe('July 2026');
  });

  it('week = last 7 days inclusive of today', () => {
    const w = periodWindow('week', NOW);
    expect(w.start).toBe(startOfDay(new Date(2026, 6, 12)).getTime());
    expect(w.end).toBe(endOfDay(NOW).getTime());
    expect(w.label).toBe('Last 7 days');
  });

  it('custom clamps to start-of-day / end-of-day', () => {
    // Range chosen with arbitrary times of day: Jun 1 09:15 → Jun 30 18:45
    const w = periodWindow('custom', NOW, {
      start: new Date(2026, 5, 1, 9, 15).getTime(),
      end: new Date(2026, 5, 30, 18, 45).getTime(),
    });
    expect(w.start).toBe(startOfDay(new Date(2026, 5, 1)).getTime());
    expect(w.end).toBe(endOfDay(new Date(2026, 5, 30)).getTime());
  });

  it('custom label, same year', () => {
    const w = periodWindow('custom', NOW, {
      start: new Date(2026, 5, 1).getTime(),
      end: new Date(2026, 5, 30).getTime(),
    });
    expect(w.label).toBe('Jun 1 – Jun 30, 2026');
  });

  it('custom label, crossing years', () => {
    const w = periodWindow('custom', NOW, {
      start: new Date(2025, 11, 15).getTime(),
      end: new Date(2026, 0, 10).getTime(),
    });
    expect(w.label).toBe('Dec 15, 2025 – Jan 10, 2026');
  });

  it('custom without a range falls back to today', () => {
    const w = periodWindow('custom', NOW, null);
    expect(w.start).toBe(startOfDay(NOW).getTime());
    expect(w.end).toBe(endOfDay(NOW).getTime());
  });
});
