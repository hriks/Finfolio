import { extractTraiSuffix, senderStem, normalizeMerchant } from './rules/normalize';
import { matchSmsRule } from './rules/sms-rules';

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

const CREDIT_HINTS = /\b(credited|refund(ed)?|deposited|received from)\b/i;
// Rejects daily-balance, upcoming-charge, premium-due and recharge-reminder SMSes
// that look like transactions but aren't. Applied before rule path AND heuristic.
// Note: "Avl Bal" alone is NOT a hint — legitimate debit SMSes use it as a balance footer.
// We rely on "Available Bal" (the daily-summary form) and other phrases that only appear
// in non-transactional messages.
export const NON_TRANSACTION_HINTS =
  /\b(available bal|balance is|balance:|scheduled on|due on|premium due|renewal due|will expire|recharge with|reminder|upcoming|installment[^\n]*scheduled|maintain sufficient balance|next sip|cheques are subject)\b/i;
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
      confidence: 0.95,
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
