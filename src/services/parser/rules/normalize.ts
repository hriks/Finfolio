export const extractTraiSuffix = (sender: string | null): 'T' | 'S' | 'P' | 'G' | null => {
  if (!sender) return null;
  const m = sender.match(/-([TSPG])$/i);
  return (m ? m[1].toUpperCase() : null) as 'T' | 'S' | 'P' | 'G' | null;
};

export const senderStem = (sender: string | null): string => {
  if (!sender) return '';
  const stripped = sender.replace(/-([TSPG])$/i, '');
  const parts = stripped.split('-');
  return parts[parts.length - 1].toUpperCase();
};

const BANK_FAMILIES: Record<string, string> = {
  HDFCBK: 'hdfc',
  HDFCB: 'hdfc',
  HDFC: 'hdfc',
  ICICIB: 'icici',
  ICICI: 'icici',
  AXISBK: 'axis',
  AXIS: 'axis',
  SBIINB: 'sbi',
  SBI: 'sbi',
  SBIPSG: 'sbi',
  KOTAKB: 'kotak',
  KOTAK: 'kotak',
  YESBNK: 'yes',
  YES: 'yes',
  PAYTM: 'paytm',
  PYTM: 'paytm',
  PHONEPE: 'phonepe',
  PHPE: 'phonepe',
  GPAY: 'gpay',
  GOOGLEPAY: 'gpay',
  AMAZONPAY: 'amazonpay',
  AMZNPAY: 'amazonpay',
};

const PACKAGE_FAMILIES: Record<string, string> = {
  'com.ubercab': 'uber',
  'com.rapido.passenger': 'rapido',
  'com.olacabs.customer': 'ola',
  'in.swiggy.android': 'swiggy',
  'com.application.zomato': 'zomato',
};

export const senderBucket = (sender: string | null): string => {
  if (!sender) return '';
  if (sender.includes('.')) {
    return PACKAGE_FAMILIES[sender] ?? sender.toLowerCase();
  }
  const stem = senderStem(sender);
  return BANK_FAMILIES[stem] ?? stem.toLowerCase();
};

const NOISE = /\b(in|ind|india|pvt|ltd|llp|the|payments?|services?|transactions?)\b/gi;
const PREFIX_NOISE = /^(amazon\.in|amzn|amz)\b.*$/i;
const STAR_PAYLOAD = /\*[A-Z0-9_]+/gi;

export type CounterpartKind = 'phone' | 'upi' | 'merchant';
export interface NormalizedCounterpart {
  kind: CounterpartKind;
  value: string;
}

export const normalizeCounterpart = (raw: string | null): NormalizedCounterpart | null => {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.includes('@')) {
    return { kind: 'upi', value: s.toLowerCase() };
  }
  const digits = s.replace(/\D+/g, '');
  if (digits.length >= 10) {
    return { kind: 'phone', value: digits.slice(-10) };
  }
  return { kind: 'merchant', value: s.toLowerCase() };
};

export const normalizeMerchant = (raw: string | null): string => {
  if (!raw) return '';
  let s = raw.toLowerCase().trim();
  if (PREFIX_NOISE.test(s)) {
    return s.replace(PREFIX_NOISE, 'amazon');
  }
  s = s.replace(STAR_PAYLOAD, '');
  s = s.replace(NOISE, '');
  s = s.replace(/[^a-z0-9 ]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
};
