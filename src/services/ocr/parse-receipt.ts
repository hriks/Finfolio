// Matches "Total: $12.34", "TOTAL 12.34", "Grand Total Rs.345", "Amount Due 1,234.50"
const TOTAL_RE =
  /(?:total|grand\s*total|amount\s*(?:due|paid)|net\s*total|balance\s*due)[\s:]*(?:rs\.?|inr|₹|\$|usd|eur|€|£)?\s*([\d,]+(?:\.\d{1,2})?)/i;

// Matches a currency-prefixed amount: ₹250, Rs.250, INR 250, $25, USD 25, € 10
const CURRENCY_AMOUNT_RE =
  /(?:rs\.?|inr|₹|\$|usd|€|eur|£|gbp)\s*([\d,]+(?:\.\d{1,2})?)/i;

// Matches a bare decimal that looks like money (>=1.00). Anchored to not match years.
const BARE_AMOUNT_RE = /(?:^|\s)([\d,]{1,9}\.\d{2})(?:\s|$)/;

const DATE_RE =
  /(\d{1,2})[\-/.\s]+(\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\-/.\s]+(\d{2,4})/i;

const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

const parseDate = (m: RegExpMatchArray): number | null => {
  const day = parseInt(m[1], 10);
  const monthStr = m[2].toLowerCase();
  const monthIdx = MONTHS[monthStr.slice(0, 3)] ?? parseInt(m[2], 10) - 1;
  let year = parseInt(m[3], 10);
  if (year < 100) year += 2000;
  if (Number.isNaN(day) || Number.isNaN(year) || monthIdx < 0 || monthIdx > 11) return null;
  return new Date(Date.UTC(year, monthIdx, day)).getTime();
};

const toMinor = (s: string): number =>
  Math.round(parseFloat(s.replace(/,/g, '')) * 100);

export interface ReceiptDraft {
  amountMinor: number;
  merchantRaw: string | null;
  occurredAt: number | null;
}

export const parseReceiptText = (raw: string): ReceiptDraft | null => {
  const lines = raw
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  let amountMinor: number | null = null;

  // Stage 1: prefer an explicit "Total" / "Amount due" line — most reliable.
  for (const line of lines) {
    const m = line.match(TOTAL_RE);
    if (m) {
      amountMinor = toMinor(m[1]);
      break;
    }
  }

  // Stage 2: pick the largest currency-prefixed amount.
  if (amountMinor === null) {
    let max = 0;
    for (const line of lines) {
      const m = line.match(CURRENCY_AMOUNT_RE);
      if (m) {
        const v = toMinor(m[1]);
        if (v > max) max = v;
      }
    }
    if (max > 0) amountMinor = max;
  }

  // Stage 3: pick the largest bare X.YY number across all lines.
  // Receipts often print the grand total as just "12.34" on its own line.
  if (amountMinor === null) {
    let max = 0;
    for (const line of lines) {
      const m = line.match(BARE_AMOUNT_RE);
      if (m) {
        const v = toMinor(m[1]);
        if (v >= 50 /* ignore stray subtotals like 0.10 */ && v > max) max = v;
      }
    }
    if (max > 0) amountMinor = max;
  }

  if (amountMinor === null) return null;

  // Date
  let occurredAt: number | null = null;
  for (const line of lines) {
    const dm = line.match(DATE_RE);
    if (dm) {
      occurredAt = parseDate(dm);
      if (occurredAt) break;
    }
  }

  // Merchant: first non-amount, non-date, non-numeric line. Drop common boilerplate.
  let merchantRaw: string | null = null;
  const BOILERPLATE = /^(receipt|invoice|bill|tax\s*invoice|thank\s*you|welcome)$/i;
  for (const line of lines.slice(0, 6)) {
    if (CURRENCY_AMOUNT_RE.test(line)) continue;
    if (BARE_AMOUNT_RE.test(line)) continue;
    if (DATE_RE.test(line)) continue;
    if (BOILERPLATE.test(line)) continue;
    if (line.length < 2 || line.length > 60) continue;
    merchantRaw = line;
    break;
  }

  return { amountMinor, merchantRaw, occurredAt };
};
