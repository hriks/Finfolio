export interface SmsParsed {
  amountMinor: number;
  merchantRaw: string;
  kind: 'debit' | 'credit';
}

type Rule = (body: string) => SmsParsed | null;

const parseAmount = (s: string): number => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Math.round(n * 100);
};

const CREDIT_HINTS = /\b(credited|refund(ed)?|deposited|received from)\b/i;

const debit =
  (re: RegExp): Rule =>
  (body) => {
    if (CREDIT_HINTS.test(body)) return null;
    const m = body.match(re);
    if (!m) return null;
    return {
      amountMinor: parseAmount(m[1]),
      merchantRaw: m[2].trim(),
      kind: 'debit',
    };
  };

// Merchant character class — allows lowercase too so names like "Ravi Pan Bhandar" match.
// Stops at end-of-line, period, " on ", " Avl ", " Ref ".
const M = `[\\w .&\\-_*]+?`;

const RULES: Record<string, Rule[]> = {
  HDFCBK: [
    // "Sent Rs.X From HDFC Bank A/C *NNNN To <merchant> On DD/MM/YY" — the dominant modern HDFC format.
    debit(
      new RegExp(
        `Sent\\s+Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+From\\s+HDFC\\s+Bank\\s+A\\/C\\s+\\*?\\d+\\s+To\\s+(${M})\\s+On\\b`,
        'i',
      ),
    ),
    debit(
      new RegExp(
        `Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+debited.*?to\\s+(${M})(?:\\.|\\s+Avl|\\s+on)`,
        'i',
      ),
    ),
    debit(
      new RegExp(
        `Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+(?:spent|paid).*?at\\s+(${M})(?:\\.|\\s+on|\\s+Avl)`,
        'i',
      ),
    ),
  ],
  ICICIB: [
    debit(new RegExp(`INR\\s+([\\d,]+(?:\\.\\d+)?)\\s+spent.*?at\\s+(${M})\\s+on`, 'i')),
    debit(
      new RegExp(`Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+debited.*?to\\s+(${M})(?:\\.|\\s+on)`, 'i'),
    ),
  ],
  AXISBK: [
    debit(
      new RegExp(
        `INR\\s+([\\d,]+(?:\\.\\d+)?)\\s+(?:spent|debited).*?(?:at|to)\\s+(${M})(?:\\.|\\s+on)`,
        'i',
      ),
    ),
  ],
  SBIINB: [
    debit(
      new RegExp(
        `Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+(?:debited|withdrawn).*?(?:to|at)\\s+(${M})(?:\\.|\\s+Avl|\\s+Ref)`,
        'i',
      ),
    ),
  ],
  KOTAKB: [
    debit(
      new RegExp(
        `Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+(?:spent|debited).*?(?:at|to)\\s+(${M})(?:\\.|\\s+on)`,
        'i',
      ),
    ),
  ],
  PAYTM: [
    debit(
      new RegExp(
        `Paid\\s+Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+to\\s+(${M})(?:\\s+from|\\.|\\s+Txn)`,
        'i',
      ),
    ),
  ],
  PHONEPE: [
    debit(
      new RegExp(
        `Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+(?:paid|sent)\\s+to\\s+(${M})(?:\\.|\\s+via)`,
        'i',
      ),
    ),
  ],
  AMAZONPAY: [
    debit(
      new RegExp(
        `Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+paid.*?(?:to|for)\\s+(${M})(?:\\.|\\s+via)`,
        'i',
      ),
    ),
  ],
};

// Fallback rules tried when no stem-specific rule matched. Covers the "Sent Rs.X ... To X On"
// shape that many banks now share.
const GENERIC_RULES: Rule[] = [
  debit(
    new RegExp(
      `Sent\\s+Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+(?:From\\s+[A-Za-z][\\w ]+\\s+A\\/C\\s+\\*?\\d+\\s+)?To\\s+(${M})\\s+On\\b`,
      'i',
    ),
  ),
];

export const matchSmsRule = (stem: string, body: string): SmsParsed | null => {
  const rules = RULES[stem];
  if (rules) {
    for (const r of rules) {
      const out = r(body);
      if (out) return out;
    }
  }
  for (const r of GENERIC_RULES) {
    const out = r(body);
    if (out) return out;
  }
  return null;
};
