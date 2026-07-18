import { parseSms } from '../../src/services/parser/sms';
import { AUTO_CONFIRM_CONFIDENCE } from '../../src/types/domain';

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

  describe('root-cause hint fixes', () => {
    it('parses IDFC debit despite "Available balance Rs X" footer and "; MERCHANT credited." phrasing', () => {
      const r = parseSms({
        sender: 'JM-IDFCFB-S',
        body: 'Your A/c XX9550 debited by Rs. 2,478.00 on 25/06/26; LEDGERS IT SERVICES credited. RRN 120812860375. Available balance Rs. 2,746.88. Team IDFC FIRST Bank',
        ts: 1_700_000_000_000,
      });
      expect(r).toMatchObject({
        amountMinor: 247800,
        merchantRaw: 'LEDGERS IT SERVICES',
        confidence: 0.95,
      });
    });

    it('heuristic parses a debit where the payee is described as "credited"', () => {
      const r = parseSms({
        sender: 'XX-SOMEBNK-T',
        body: 'Your A/c XX1234 debited by Rs 450.00 to RAMU KIRANA. RAMU KIRANA credited. Ref 100',
        ts: 0,
      });
      expect(r?.amountMinor).toBe(45000);
      expect(r?.merchantRaw).toBe('RAMU KIRANA');
    });

    it('still drops genuine incoming credits ("credited with", "is credited")', () => {
      expect(
        parseSms({
          sender: 'AX-IDFCFB-S',
          body: 'Your A/C XXXXX969550 is credited with INR 20,000.00 on 21/06/26 12:57. Your new balance is INR 25,221.81. Team IDFC FIRST Bank',
          ts: 0,
        }),
      ).toBeNull();
    });
  });

  describe('new sender rules (real inbox fixtures)', () => {
    it('parses HDFC UPI-Mandate recurring debit', () => {
      const r = parseSms({
        sender: 'AD-HDFCBK-S',
        body: 'UPI Mandate:\nSent Rs.649.00\nfrom HDFC Bank A/c 6519\nTo NETFLIX COM\n03/07/26\nRef 103596207727\nNot You? Call 18002586161/SMS BLOCK UPI to 7308080808',
        ts: 1_700_000_000_000,
      });
      expect(r).toMatchObject({
        amountMinor: 64900,
        merchantRaw: 'NETFLIX COM',
        confidence: 0.95,
      });
    });

    it('parses debit-card e-mandate processed (IDFC)', () => {
      const r = parseSms({
        sender: 'VA-IDFCFB-S',
        body: 'Dear Customer, Your Payment of Rs 955.80 at Google Workspace for e-mandate SiHubId Xn3rnD4Z2g has been processed successfully on your Debit Card ending 2661. Please click here to manage the e-mandate: https://idfcfr.in/IDFCFB/boa41Q. Team IDFC FIRST Bank',
        ts: 0,
      });
      expect(r).toMatchObject({ amountMinor: 95580, merchantRaw: 'Google Workspace' });
    });

    it('parses Amazon Pay balance debit despite "Updated balance is" footer', () => {
      const r = parseSms({
        sender: 'VA-QCAMZN-S',
        body: 'Payment of Rs 548.00 using Apay balance is successful at A.in. Updated balance is Rs 8.08. If not u? call 18001200163 - SMS via Pine Labs',
        ts: 0,
      });
      expect(r).toMatchObject({ amountMinor: 54800, merchantRaw: 'A.in' });
    });

    it('parses HDFC IMPS transfer at low confidence (below auto-confirm)', () => {
      const r = parseSms({
        sender: 'JM-HDFCBK-S',
        body: 'IMPS INR 5,00,000.00\nsent from HDFC Bank A/c XX6519 on 13-06-26\nTo A/c xxxxxxxxxx2676\nRef-616432961412\nNot you?Call 18002586161/SMS BLOCK OB to 7308080808',
        ts: 0,
      });
      expect(r?.amountMinor).toBe(50000000);
      expect(r?.merchantRaw).toBe('A/c 2676');
      expect(r?.confidence).toBeLessThan(AUTO_CONFIRM_CONFIDENCE);
    });

    it('parses INDANE payment receipt at low confidence (below auto-confirm)', () => {
      const r = parseSms({
        sender: 'JD-INDANE-S',
        body: 'Dear Sudha Gupta, This is confirmation receipt for your online payment of Rs 995, against Order no. 2-005784238238 for consumer no. 7063938774.\nINDANE',
        ts: 0,
      });
      expect(r?.amountMinor).toBe(99500);
      expect(r?.merchantRaw).toBe('INDANE');
      expect(r?.confidence).toBeLessThan(AUTO_CONFIRM_CONFIDENCE);
    });
  });

  describe('must-not-parse guards', () => {
    const cases: Array<[string, string, string]> = [
      [
        'Amazon OTP',
        'VM-AMAZON-S',
        'Amazon: OTP for payment of INR 17799.0 to Amazon is 317898. If unauthorized, deny here: https://amzn.in/deny',
      ],
      [
        'PhonePe money request',
        'VM-PHONPE-S',
        'INDIAFILINGS PVT LTD has requested money from you on PhonePe.Rs.18761 will be debited from your account on approving the request - https://phon.pe/x',
      ],
      [
        'Axio future debit',
        'VM-AXIOPL-S',
        'Your Pay Later bill of Rs 12228 will be debited on 5th of this month from registered bank a/c.',
      ],
      [
        'Airtel bill generated',
        'VM-AIRTEL-S',
        'Hi Amit, Bill for your Airtel Mobile 8970357254 dated 03-JUL-2026 has been generated.\nAmount to be paid: Rs 1414.82\nDue Date: 13-JUL-2026\nBill summary: airtel.in/bill',
      ],
      [
        'House-tax due notice',
        'VD-UPHTAX-S',
        'HouseTax Bill for Your ComputerCode:0550001798 of Property in Ward 5 is Rs. 1183 in FY 2026-27 is Due.For Online Payment Visit https://tax.example.in',
      ],
      [
        'HDFC daily balance summary',
        'JM-HDFCBK-S',
        'Available Bal in HDFC Bank A/c XX6519 as on yesterday:04-JUL-26 is INR 4,72,251.56. Cheques are subject to clearing.For updated A/C Bal dial 18002703333.',
      ],
      [
        'DBS incoming credit',
        'JM-DBSBNK-S',
        'Dear Customer, your DBS account no ************4979 is credited with INR 166167 on 02-07-2026 and is subject to clearance. Current Balance is INR 907906.',
      ],
      [
        'IDFC upcoming e-mandate',
        'AD-IDFCFB-S',
        'Dear Customer, Your recurring transaction at Google Workspace for e-mandate SiHubId Xn3rnD4Z2g is scheduled as below. We request you to maintain sufficient balance in your account. Due date: 03/07/2026. Amount: Rs 955.80. Team IDFC FIRST Bank',
      ],
    ];

    it.each(cases)('%s does not parse', (_label, sender, body) => {
      expect(parseSms({ sender, body, ts: 0 })).toBeNull();
    });
  });
});
