import { extractTraiSuffix, senderStem, normalizeMerchant, senderBucket, normalizeCounterpart } from '../../src/services/parser/rules/normalize';

describe('normalize', () => {
  it('extracts TRAI suffix', () => {
    expect(extractTraiSuffix('VK-HDFCBK-T')).toBe('T');
    expect(extractTraiSuffix('JD-AXISBK-S')).toBe('S');
    expect(extractTraiSuffix('AX-PROMO-P')).toBe('P');
    expect(extractTraiSuffix('GOV-EPFO-G')).toBe('G');
    expect(extractTraiSuffix('VK-HDFCBK')).toBeNull();
    expect(extractTraiSuffix('+919876543210')).toBeNull();
  });

  it('extracts sender stem', () => {
    expect(senderStem('VK-HDFCBK-T')).toBe('HDFCBK');
    expect(senderStem('JD-AXISBK-S')).toBe('AXISBK');
    expect(senderStem('AD-PAYTM-T')).toBe('PAYTM');
    expect(senderStem('HDFCBK')).toBe('HDFCBK');
  });

  it('normalizes merchants', () => {
    expect(normalizeMerchant('SWIGGY BANGALORE')).toBe('swiggy bangalore');
    expect(normalizeMerchant('  Amazon.in*XYZ  ')).toBe('amazon');
    expect(normalizeMerchant('UBER*TRIP12345')).toBe('uber');
    expect(normalizeMerchant('RAPIDO IND')).toBe('rapido');
    expect(normalizeMerchant(null)).toBe('');
  });

  it('buckets senders to coarse families', () => {
    expect(senderBucket('VK-HDFCBK-T')).toBe('hdfc');
    expect(senderBucket('JD-HDFCB-T')).toBe('hdfc');
    expect(senderBucket('AD-PAYTM-T')).toBe('paytm');
    expect(senderBucket('com.ubercab')).toBe('uber');
    expect(senderBucket(null)).toBe('');
  });
});

describe('normalizeCounterpart', () => {
  it('strips +91 and non-digits for phone-like inputs', () => {
    expect(normalizeCounterpart('+91 98765 43210')).toEqual({ kind: 'phone', value: '9876543210' });
    expect(normalizeCounterpart('919876543210')).toEqual({ kind: 'phone', value: '9876543210' });
  });
  it('lowercases UPI VPAs', () => {
    expect(normalizeCounterpart('Driver@PAYTM')).toEqual({ kind: 'upi', value: 'driver@paytm' });
  });
  it('falls back to merchant kind for free text', () => {
    expect(normalizeCounterpart('Rapido')).toEqual({ kind: 'merchant', value: 'rapido' });
  });
  it('returns null for empty', () => {
    expect(normalizeCounterpart('')).toBeNull();
    expect(normalizeCounterpart(null)).toBeNull();
  });
});
