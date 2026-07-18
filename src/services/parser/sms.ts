import { extractTraiSuffix, senderStem, normalizeMerchant } from './rules/normalize';
import { matchSmsRule, CREDIT_HINTS } from './rules/sms-rules';

export interface SmsEvent {
  sender: string | null;
  body: string;
  ts: number;
}

export interface ParserDraft {
  amountMinor: number;
  merchantRaw: string | null;
  merchantNorm: string;
  occurredAt: number;
  sourceRef: string | null;
  sourceMsg: string;
  confidence: number;
}

// Rejects daily-balance, upcoming-charge, OTP, money-request, bill-generated, premium-due
// and recharge-reminder SMSes that look like transactions but aren't. Applied before rule
// path AND heuristic.
// Balance hints are deliberately narrow — genuine debit alerts carry balance FOOTERS
// ("Avl Bal", "Available balance Rs X", "Updated balance is Rs X") that must not reject:
// - "available bal ... as on" = the daily-summary form (HDFC "as on yesterday:...")
// - "<new|current|...> balance is" = balance-report phrasing, not the "Updated balance is"
//   footer on real debits.
export const NON_TRANSACTION_HINTS =
  /\bavailable bal\w*[^\n]*\bas on\b|\b(?:new|current|closing|total|avl|available|account|a\/c) balance is\b|\bbalance:|\b(?:scheduled on|due on|premium due|renewal due|will expire|recharge with|reminder|upcoming|maintain sufficient balance|next sip|cheques are subject|otp|requested money|will be debited|amount to be paid)\b|\binstallment[^\n]*scheduled\b/i;
// Heuristic requires a past-tense debit verb so informational messages don't slip through.
const DEBIT_VERB = /\b(debited|spent|paid|sent|withdrawn|purchased|charged)\b/i;
const AMOUNT_RE = /(?:rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i;
const MERCHANT_RE =
  /(?:to|at|towards|for)\s+([A-Z][A-Z0-9 .&\-_*]{1,40}?)(?:\s+on\b|\.|\s+Avl|\s+via|$)/i;

const heuristicParse = (body: string): { amountMinor: number; merchantRaw: string } | null => {
  if (CREDIT_HINTS.test(body)) return null;
  if (NON_TRANSACTION_HINTS.test(body)) return null;
  if (!DEBIT_VERB.test(body)) return null;
  const am = body.match(AMOUNT_RE);
  if (!am) return null;
  const amountMinor = Math.round(parseFloat(am[1].replace(/,/g, '')) * 100);
  const mm = body.match(MERCHANT_RE);
  const merchantRaw = mm ? mm[1].trim() : '';
  if (!merchantRaw) return null;
  return { amountMinor, merchantRaw };
};

export const parseSms = (event: SmsEvent): ParserDraft | null => {
  const suffix = extractTraiSuffix(event.sender);
  if (suffix === 'P' || suffix === 'G') return null;
  if (NON_TRANSACTION_HINTS.test(event.body)) return null;

  const stem = senderStem(event.sender);
  const ruleHit = matchSmsRule(stem, event.body);
  if (ruleHit) {
    return {
      amountMinor: ruleHit.amountMinor,
      merchantRaw: ruleHit.merchantRaw,
      merchantNorm: normalizeMerchant(ruleHit.merchantRaw),
      occurredAt: event.ts,
      sourceRef: event.sender,
      sourceMsg: event.body,
      confidence: ruleHit.confidence ?? 0.95,
    };
  }

  const heur = heuristicParse(event.body);
  if (!heur) return null;
  return {
    amountMinor: heur.amountMinor,
    merchantRaw: heur.merchantRaw,
    merchantNorm: normalizeMerchant(heur.merchantRaw),
    occurredAt: event.ts,
    sourceRef: event.sender,
    sourceMsg: event.body,
    confidence: 0.6,
  };
};
