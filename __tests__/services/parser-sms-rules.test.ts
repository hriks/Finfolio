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

  it('parses HDFC UPI-Mandate debit (lowercase "from", no "On" before date)', () => {
    const body =
      'UPI Mandate:\nSent Rs.649.00\nfrom HDFC Bank A/c 6519\nTo NETFLIX COM\n03/07/26\nRef 103596207727\nNot You? Call 18002586161/SMS BLOCK UPI to 7308080808';
    const r = matchSmsRule('HDFCBK', body);
    expect(r?.amountMinor).toBe(64900);
    expect(r?.merchantRaw).toBe('NETFLIX COM');
  });

  it('does NOT parse HDFC UPI-mandate cancellation notice', () => {
    const body =
      'Update:\nRs. 699.00 UPI mandate to Kuku TV has been cancelled from HDFC Bank A/c x6519.\nUMN: 60c77aa4fc2d4d99948df9afffef0721@ybl';
    expect(matchSmsRule('HDFCBK', body)).toBeNull();
  });

  it('parses IDFC FIRST "A/c debited by Rs ...; MERCHANT credited" despite "credited" wording', () => {
    const body =
      'Your A/c XX9550 debited by Rs. 2,478.00 on 25/06/26; LEDGERS IT SERVICES credited. RRN 120812860375. Available balance Rs. 2,746.88. Team IDFC FIRST Bank';
    const r = matchSmsRule('IDFCFB', body);
    expect(r?.amountMinor).toBe(247800);
    expect(r?.merchantRaw).toBe('LEDGERS IT SERVICES');
  });

  it('still rejects IDFC FIRST incoming credit', () => {
    const body =
      'Your A/C XXXXX969550 is credited with INR 20,000.00 on 21/06/26 12:57. Your new balance is INR 25,221.81. Team IDFC FIRST Bank';
    expect(matchSmsRule('IDFCFB', body)).toBeNull();
  });

  it('parses debit-card e-mandate processed (IDFC form, generic rule)', () => {
    const body =
      'Dear Customer, Your Payment of Rs 955.80 at Google Workspace for e-mandate SiHubId Xn3rnD4Z2g has been processed successfully on your Debit Card ending 2661. Please click here to manage the e-mandate: https://idfcfr.in/IDFCFB/boa41Q. Team IDFC FIRST Bank';
    const r = matchSmsRule('IDFCFB', body);
    expect(r?.amountMinor).toBe(95580);
    expect(r?.merchantRaw).toBe('Google Workspace');
  });

  it('does NOT parse an upcoming (scheduled) e-mandate notice', () => {
    const body =
      'Dear Customer, Your recurring transaction at Google Workspace for e-mandate SiHubId Xn3rnD4Z2g is scheduled as below. We request you to maintain sufficient balance in your account. Due date: 03/07/2026. Amount: Rs 955.80. Team IDFC FIRST Bank';
    expect(matchSmsRule('IDFCFB', body)).toBeNull();
  });

  it('parses Amazon Pay balance debit (QCAMZN)', () => {
    const body =
      'Payment of Rs 548.00 using Apay balance is successful at A.in. Updated balance is Rs 8.08. If not u? call 18001200163 - SMS via Pine Labs';
    const r = matchSmsRule('QCAMZN', body);
    expect(r?.amountMinor).toBe(54800);
    expect(r?.merchantRaw).toBe('A.in');
  });

  it('parses HDFC IMPS transfer with low rule confidence', () => {
    const body =
      'IMPS INR 5,00,000.00\nsent from HDFC Bank A/c XX6519 on 13-06-26\nTo A/c xxxxxxxxxx2676\nRef-616432961412\nNot you?Call 18002586161/SMS BLOCK OB to 7308080808';
    const r = matchSmsRule('HDFCBK', body);
    expect(r?.amountMinor).toBe(50000000);
    expect(r?.merchantRaw).toBe('A/c 2676');
    expect(r?.confidence).toBeDefined();
    expect(r?.confidence).toBeLessThan(0.85);
  });

  it('parses INDANE online payment receipt with low rule confidence', () => {
    const body =
      'Dear Sudha Gupta, This is confirmation receipt for your online payment of Rs 995, against Order no. 2-005784238238 for consumer no. 7063938774.\nINDANE';
    const r = matchSmsRule('INDANE', body);
    expect(r?.amountMinor).toBe(99500);
    expect(r?.merchantRaw).toBe('INDANE');
    expect(r?.confidence).toBeDefined();
    expect(r?.confidence).toBeLessThan(0.85);
  });
});
