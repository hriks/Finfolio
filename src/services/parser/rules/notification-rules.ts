export interface NotificationRule {
  merchantNorm: string;
  match: (title: string, text: string) => number | null;
}

const AMOUNT_RE = /(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)/i;

const fromAmount = (t: string): number | null => {
  const m = t.match(AMOUNT_RE);
  if (!m) return null;
  return Math.round(parseFloat(m[1].replace(/,/g, '')) * 100);
};

const simple = (merchantNorm: string): NotificationRule => ({
  merchantNorm,
  match: (_t, text) => fromAmount(text),
});

export const NOTIFICATION_RULES: Record<string, NotificationRule> = {
  'com.ubercab': simple('uber'),
  'com.rapido.passenger': simple('rapido'),
  'com.olacabs.customer': simple('ola'),
  'in.swiggy.android': simple('swiggy'),
  'com.application.zomato': simple('zomato'),
};
