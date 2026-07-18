import { parseRupees } from '../../src/app/screens/detail/parse-rupees';

describe('parseRupees', () => {
  it('parses a whole rupee amount to paise', () => {
    expect(parseRupees('240')).toBe(24000);
  });

  it('parses a rupee amount with one decimal to paise', () => {
    expect(parseRupees('240.5')).toBe(24050);
  });

  it('parses a comma-grouped rupee amount to paise', () => {
    expect(parseRupees('1,240.50')).toBe(124050);
  });

  it('rejects an empty string', () => {
    expect(parseRupees('')).toBeNull();
  });

  it('rejects zero', () => {
    expect(parseRupees('0')).toBeNull();
  });

  it('rejects a negative amount', () => {
    expect(parseRupees('-5')).toBeNull();
  });

  it('rejects non-numeric input', () => {
    expect(parseRupees('abc')).toBeNull();
  });

  it('rejects multiple decimal points', () => {
    expect(parseRupees('1.2.3')).toBeNull();
  });

  it('rejects more than two decimal places', () => {
    expect(parseRupees('12.345')).toBeNull();
  });
});
