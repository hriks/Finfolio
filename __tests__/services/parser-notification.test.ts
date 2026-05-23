import { parseNotification } from '../../src/services/parser/notification';

describe('parseNotification', () => {
  it('parses Uber ride completion', () => {
    const r = parseNotification({
      packageName: 'com.ubercab',
      title: 'Trip with Ramesh',
      text: 'Thanks for riding with Uber. ₹245.00 was charged.',
      ts: 1_700_000_000_000,
    });
    expect(r?.amountMinor).toBe(24500);
    expect(r?.merchantNorm).toBe('uber');
    expect(r?.confidence).toBeGreaterThan(0.85);
  });
  it('parses Rapido', () => {
    const r = parseNotification({
      packageName: 'com.rapido.passenger',
      title: 'Ride complete',
      text: 'You paid ₹75 to Rapido for your ride',
      ts: 0,
    });
    expect(r?.amountMinor).toBe(7500);
    expect(r?.merchantNorm).toBe('rapido');
  });
  it('parses Swiggy', () => {
    const r = parseNotification({
      packageName: 'in.swiggy.android',
      title: 'Order delivered',
      text: 'Your order of ₹399 has been delivered',
      ts: 0,
    });
    expect(r?.amountMinor).toBe(39900);
    expect(r?.merchantNorm).toBe('swiggy');
  });
  it('returns null for unknown packages', () => {
    expect(
      parseNotification({ packageName: 'com.example.app', title: 't', text: '₹100', ts: 0 }),
    ).toBeNull();
  });
  it('returns null when no amount in text', () => {
    expect(
      parseNotification({ packageName: 'com.ubercab', title: 't', text: 'hello', ts: 0 }),
    ).toBeNull();
  });
});
