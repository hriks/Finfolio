import { parseReceiptText } from '../../src/services/ocr/parse-receipt';

describe('parseReceiptText', () => {
  it('extracts total, merchant, date from a typical receipt', () => {
    const text = `
      Coffee Day
      14-MAY-2026
      Latte           Rs.250.00
      Cookie          Rs.100.00
      Total           Rs.350.00
      Thank you
    `;
    const r = parseReceiptText(text);
    expect(r?.amountMinor).toBe(35000);
    expect(r?.merchantRaw?.toLowerCase()).toContain('coffee day');
    expect(r?.occurredAt).toBe(new Date('2026-05-14').getTime());
  });

  it('returns null when no total found', () => {
    expect(parseReceiptText('random text\nno money')).toBeNull();
  });

  it('falls back to first line as merchant when no obvious header', () => {
    const text = 'PIZZA HUT\nTotal Rs.499.00';
    const r = parseReceiptText(text);
    expect(r?.merchantRaw?.toUpperCase()).toBe('PIZZA HUT');
  });
});
