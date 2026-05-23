import { matchSmsRule } from '../../src/services/parser/rules/sms-rules';

describe('matchSmsRule', () => {
  it('parses HDFC debit', () => {
    const body =
      'Rs.250.00 debited from a/c **1234 on 14-05-26 to SWIGGY. Avl Bal: Rs.10,000. Not you? Call 18002586161';
    const r = matchSmsRule('HDFCBK', body);
    expect(r).toEqual({
      amountMinor: 25000,
      merchantRaw: 'SWIGGY',
      kind: 'debit',
    });
  });

  it('parses ICICI debit with INR prefix', () => {
    const body =
      'INR 99.00 spent on ICICI Bank Card xx1234 at AMAZON on 15-MAY-26. Bal: INR 5,432.10';
    const r = matchSmsRule('ICICIB', body);
    expect(r?.amountMinor).toBe(9900);
    expect(r?.merchantRaw).toBe('AMAZON');
  });

  it('parses Paytm wallet debit', () => {
    const body = 'Paid Rs.150 to UBER from Paytm Wallet. Txn ID: 12345';
    const r = matchSmsRule('PAYTM', body);
    expect(r?.amountMinor).toBe(15000);
    expect(r?.merchantRaw).toBe('UBER');
  });

  it('ignores credits/refunds (returns null)', () => {
    const body = 'Rs.500 credited to a/c **1234 from REFUND SWIGGY';
    expect(matchSmsRule('HDFCBK', body)).toBeNull();
  });

  it('returns null for unknown stems with no generic match', () => {
    expect(matchSmsRule('UNKNOWN', 'Rs.100 to X')).toBeNull();
  });

  it('parses HDFC "Sent Rs.X From HDFC Bank A/C * To <merchant> On"', () => {
    const body =
      'Sent Rs.320.00\nFrom HDFC Bank A/C *6519\nTo Kashi Prasad\nOn 22/05/26\nRef 308794563636';
    const r = matchSmsRule('HDFCBK', body);
    expect(r).toEqual({ amountMinor: 32000, merchantRaw: 'Kashi Prasad', kind: 'debit' });
  });

  it('generic "Sent ... To ... On" fallback fires for unknown stems', () => {
    const body = 'Sent Rs.50.00\nFrom Yes Bank A/C *1234\nTo Local Chai Wala\nOn 10/05/26\nRef X';
    const r = matchSmsRule('UNKNOWNBANK', body);
    expect(r?.amountMinor).toBe(5000);
    expect(r?.merchantRaw).toBe('Local Chai Wala');
  });
});
