export interface SmsParsed {
  amountMinor: number;
  merchantRaw: string;
  kind: 'debit' | 'credit';
  /** Optional per-rule confidence override; parseSms defaults rule hits to 0.95. */
  confidence?: number;
}

type Rule = (body: string) => SmsParsed | null;

const parseAmount = (s: string): number => {
  const n = parseFloat(s.replace(/,/g, ''));
  return Math.round(n * 100);
};

// Confidence for rules whose fixtures are ambiguous (opaque transfers, third-party
// receipts). Must stay below AUTO_CONFIRM_CONFIDENCE so drafts land in pending_review.
const REVIEW_CONFIDENCE = 0.7;

// Credit = money coming IN. Bare "credited" is a data-loss trap: many debit alerts say
// "; MERCHANT credited." for money LEAVING the account (e.g. IDFC FIRST), so we only
// treat "is credited" / "credited with|to|into|from" as incoming-credit phrasing.
export const CREDIT_HINTS =
  /\b(is\s+credited|credited\s+(?:with|to|into|from)|refund(ed)?|deposited|received from)\b/i;

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
    // UPI-Mandate recurring debit: "UPI Mandate:\nSent Rs.649.00\nfrom HDFC Bank A/c 6519\n
    // To NETFLIX COM\n03/07/26" — lowercase "from", and no "On" before the date.
    debit(
      new RegExp(
        `Sent\\s+Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+from\\s+HDFC\\s+Bank\\s+A\\/c\\s+\\*?\\d+\\s+To\\s+(${M})\\s+\\d{2}\\/\\d{2}\\/\\d{2}`,
        'i',
      ),
    ),
    // IMPS transfer to an opaque account: "IMPS INR 5,00,000.00\nsent from HDFC Bank A/c
    // XX6519 on 13-06-26\nTo A/c xxxxxxxxxx2676". Merchant is just the masked account, so
    // confidence stays below auto-confirm and the draft lands in pending_review.
    (body) => {
      if (CREDIT_HINTS.test(body)) return null;
      const m = body.match(
        /IMPS\s+INR\s+([\d,]+(?:\.\d+)?)\s+sent\s+from\s+HDFC\s+Bank\s+A\/c\s+\S+\s+on\s+\S+\s+To\s+A\/c\s+[xX*]*(\d+)/i,
      );
      if (!m) return null;
      return {
        amountMinor: parseAmount(m[1]),
        merchantRaw: `A/c ${m[2]}`,
        kind: 'debit',
        confidence: REVIEW_CONFIDENCE,
      };
    },
  ],
  IDFCFB: [
    // "Your A/c XX9550 debited by Rs. 2,478.00 on 25/06/26; LEDGERS IT SERVICES credited.
    // RRN 120812860375. Available balance Rs. 2,746.88." — the payee is the "credited" party.
    debit(
      new RegExp(
        `A\\/c\\s+\\S+\\s+debited\\s+by\\s+Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+on\\s+\\S+\\s*(${M})\\s+credited`,
        'i',
      ),
    ),
  ],
  QCAMZN: [
    // Amazon Pay balance debit: "Payment of Rs 548.00 using Apay balance is successful at
    // A.in." — merchant runs up to the sentence-ending period (so "A.in" survives).
    debit(
      new RegExp(
        `Payment\\s+of\\s+Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+using\\s+Apay\\s+balance\\s+is\\s+successful\\s+at\\s+(${M})(?=\\.(?:\\s|$))`,
        'i',
      ),
    ),
  ],
  INDANE: [
    // "This is confirmation receipt for your online payment of Rs 995, against Order no. ..."
    // Body carries no merchant; use the sender stem. Third-party receipt → review confidence.
    (body) => {
      if (CREDIT_HINTS.test(body)) return null;
      const m = body.match(
        /confirmation receipt for your online payment of Rs\.?\s*([\d,]+(?:\.\d+)?)/i,
      );
      if (!m) return null;
      return {
        amountMinor: parseAmount(m[1]),
        merchantRaw: 'INDANE',
        kind: 'debit',
        confidence: REVIEW_CONFIDENCE,
      };
    },
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
  // Debit-card e-mandate processed (IDFC FIRST wording, but generic enough for other banks):
  // "Your Payment of Rs 955.80 at Google Workspace for e-mandate ... has been processed
  // successfully". The UPCOMING variant ("is scheduled", "maintain sufficient balance")
  // lacks "Payment of Rs ... processed successfully" and must not match.
  debit(
    new RegExp(
      `Your\\s+Payment\\s+of\\s+Rs\\.?\\s*([\\d,]+(?:\\.\\d+)?)\\s+at\\s+(${M})\\s+for\\s+e-mandate[\\s\\S]*?processed\\s+successfully`,
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
