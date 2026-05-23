import { NOTIFICATION_RULES } from './rules/notification-rules';
import { NON_TRANSACTION_HINTS } from './sms';
import type { ParserDraft } from './sms';

export interface NotificationEvent {
  packageName: string;
  title: string;
  text: string;
  ts: number;
}

export const parseNotification = (e: NotificationEvent): ParserDraft | null => {
  const rule = NOTIFICATION_RULES[e.packageName];
  if (!rule) return null;
  const combined = `${e.title}\n${e.text}`;
  if (NON_TRANSACTION_HINTS.test(combined)) return null;
  const amount = rule.match(e.title, e.text);
  if (!amount) return null;
  return {
    amountMinor: amount,
    merchantRaw: rule.merchantNorm,
    merchantNorm: rule.merchantNorm,
    occurredAt: e.ts,
    sourceRef: e.packageName,
    sourceMsg: `${e.title}\n${e.text}`,
    confidence: 0.9,
  };
};
