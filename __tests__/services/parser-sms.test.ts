import { parseSms } from '../../src/services/parser/sms';

describe('parseSms', () => {
  it('drops promotional SMS via TRAI suffix', () => {
    expect(parseSms({ sender: 'AD-OFFER-P', body: 'Rs.100 off on UBER!', ts: 0 })).toBeNull();
  });

  it('drops government SMS', () => {
    expect(
      parseSms({ sender: 'GOV-EPFO-G', body: 'Rs.5000 credited to your PF', ts: 0 }),
    ).toBeNull();
  });

  it('parses transactional with curated rule (high confidence)', () => {
    const r = parseSms({
      sender: 'VK-HDFCBK-T',
      body: 'Rs.250.00 debited from a/c **1234 on 14-05-26 to SWIGGY. Avl Bal: Rs.10,000',
      ts: 1_700_000_000_000,
    });
    expect(r).toMatchObject({
      amountMinor: 25000,
      merchantRaw: 'SWIGGY',
      merchantNorm: 'swiggy',
      confidence: 0.95,
      occurredAt: 1_700_000_000_000,
      sourceRef: 'VK-HDFCBK-T',
    });
  });

  it('falls back to heuristic for unknown transactional sender', () => {
    const r = parseSms({
      sender: 'XX-WEIRDBANK-T',
      body: 'Your card was charged Rs.123.45 at GROCER on 01-01-26',
      ts: 1_700_000_000_000,
    });
    expect(r?.amountMinor).toBe(12345);
    expect(r?.merchantRaw).toBe('GROCER');
    expect(r?.confidence).toBeCloseTo(0.6);
  });

  it('heuristic ignores credits', () => {
    expect(
      parseSms({
        sender: 'XX-BANK-T',
        body: 'Rs.500 credited from REFUND',
        ts: 0,
      }),
    ).toBeNull();
  });

  it('returns null when no amount found', () => {
    expect(parseSms({ sender: 'VK-BANK-T', body: 'Hello world', ts: 0 })).toBeNull();
  });

  it('drops daily balance SMS', () => {
    expect(
      parseSms({
        sender: 'JM-HDFCBK-S',
        body: 'Available Bal in HDFC Bank A/c XX6519 as on yesterday:21-MAY-26 is INR 7,617.94. Cheques are subject to clearing.For updated A/C Bal dial 18002703333.',
        ts: 0,
      }),
    ).toBeNull();
  });

  it('drops upcoming SIP installment reminder', () => {
    expect(
      parseSms({
        sender: 'AD-MiraeI-S',
        body: 'Your next SIP installment for Rs. 2000.00 in Mirae Asset ELSS Tax Saver Fund-Regular  is scheduled on 27/05/2026. Pls ensure sufficient funds in your bank account .MIRAE',
        ts: 0,
      }),
    ).toBeNull();
  });

  it('drops premium-due / renewal reminder', () => {
    expect(
      parseSms({
        sender: 'JM-HDFCBK-S',
        body: 'Renewal Due: Please maintain sufficient balance, Rs.20 in HDFC Bank A/c XX6519 for PMSBY (Pradhan Mantri Suraksha Bima Yojana) premium due on May 2026',
        ts: 0,
      }),
    ).toBeNull();
  });

  it('drops recharge expiry reminder', () => {
    expect(
      parseSms({
        sender: 'AD-AIRTEL-S',
        body: 'Validity for your Airtel Wi-Fi ID 20008024751 will expire on 29-MAY-26 . Please recharge with Rs 1179 to enjoy uninterrupted services.',
        ts: 0,
      }),
    ).toBeNull();
  });

  it('parses HDFC "Sent Rs.X From ... To <merchant> On" as high-confidence rule hit', () => {
    const r = parseSms({
      sender: 'JM-HDFCBK-T',
      body: 'Sent Rs.75.00\nFrom HDFC Bank A/C *6519\nTo Ravi Pan Bhandar\nOn 22/05/26\nRef 649652817102\nNot You?',
      ts: 1_700_000_000_000,
    });
    expect(r).toMatchObject({
      amountMinor: 7500,
      merchantRaw: 'Ravi Pan Bhandar',
      merchantNorm: 'ravi pan bhandar',
      confidence: 0.95,
    });
  });

  it('parses HDFC "Sent ... To ALL-CAPS merchant" at high confidence', () => {
    const r = parseSms({
      sender: 'VM-HDFCBK-T',
      body: 'Sent Rs.11000.00\nFrom HDFC Bank A/C *6519\nTo ASHWINI MANISH GUPTA\nOn 22/05/26\nRef 392927014956',
      ts: 0,
    });
    expect(r?.confidence).toBe(0.95);
    expect(r?.merchantRaw).toBe('ASHWINI MANISH GUPTA');
  });

  it('heuristic requires a debit verb (rejects informational rs.X messages)', () => {
    expect(
      parseSms({
        sender: 'XX-RANDOM-T',
        body: 'Your statement is ready. Total dues Rs.500 to be cleared.',
        ts: 0,
      }),
    ).toBeNull();
  });
});
