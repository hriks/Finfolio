import type { Database } from '../database';

// Bundled merge_patterns. Each row teaches the dedup pipeline that a particular
// merchant_norm and counterpart refer to the same payee, so two events from
// different channels (bank SMS + wallet/app notification) collapse into one
// expense. seen_count must be >= PATTERN_MIN_SEEN (currently 2 in dedup.ts) for
// the pattern to be eligible.
//
// In practice merge_patterns are payee-level aliases (e.g., "Swiggy Ltd" ↔
// "swiggy"), so most useful entries are personal data learned at runtime. This
// file is the landing place for entries that DO generalize — and the hook the
// future server-trained model bundle will write into. INSERT OR IGNORE keeps
// user-learned rows safe.

type Pattern = {
  merchantNorm: string;
  counterpart: string;
  counterpartKind: 'phone' | 'upi' | 'merchant';
  medianDelayMs: number;
};

const PATTERNS: Pattern[] = [
  // Common merchant aliases. Bank SMS often spells the merchant differently
  // from the app notification ("SWIGGY LTD" vs "swiggy"; "SWIGGY INSTAMART
  // PRIVATE" vs "instamart"). Listing the normalized forms here lets the
  // dedup patternMatch bridge them even before the user has confirmed a merge.
  {
    merchantNorm: 'swiggy',
    counterpart: 'swiggy ltd',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'instamart',
    counterpart: 'swiggy instamart private',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'instamart',
    counterpart: 'swiggy instamart',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'zomato',
    counterpart: 'zomato ltd',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'blinkit',
    counterpart: 'grofers india',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'zepto',
    counterpart: 'kiranakart technologies',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'uber',
    counterpart: 'uber india',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'ola',
    counterpart: 'ani technologies',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'rapido',
    counterpart: 'roppen transportation',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'amazon',
    counterpart: 'amazon seller',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
  {
    merchantNorm: 'amazon',
    counterpart: 'amazon retail',
    counterpartKind: 'merchant',
    medianDelayMs: 4000,
  },
];

export const seedMergePatterns = (db: Database): void => {
  const now = Date.now();
  for (const p of PATTERNS) {
    try {
      db.run(
        `INSERT OR IGNORE INTO merge_patterns
         (merchant_norm, counterpart, counterpart_kind, seen_count, last_seen_at, median_delay_ms)
         VALUES (?, ?, ?, 2, ?, ?)`,
        [p.merchantNorm, p.counterpart, p.counterpartKind, now, p.medianDelayMs],
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[seed] merge pattern failed', p.merchantNorm, p.counterpart, e);
    }
  }
};
