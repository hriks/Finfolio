// Bundled fallback for suggestSubcategory when the user's history has fewer than
// MIN_COUNT prior expenses for a merchant. User history always wins; this is the
// floor a fresh install starts from. Eventually populated by server-trained data.
//
// Keys are merchantNorm strings (lowercase, post-normalizeMerchant). Values are
// short lowercase-with-hyphens labels matching what a typical user might type.
export const BUNDLED_SUBCATEGORY_HINTS: Record<string, string> = {
  // Ride-hailing
  uber: 'cab',
  ola: 'cab',
  rapido: 'bike',
  'namma yatri': 'auto',

  // Food delivery
  swiggy: 'food-delivery',
  zomato: 'food-delivery',
  dominos: 'dine-out',
  kfc: 'dine-out',
  mcdonalds: 'dine-out',

  // Quick-commerce / groceries
  blinkit: 'grocery',
  zepto: 'grocery',
  bigbasket: 'grocery',
  dmart: 'grocery',
  instamart: 'grocery',
  'swiggy instamart': 'grocery',

  // Shopping
  amazon: 'shopping',
  flipkart: 'shopping',
  myntra: 'clothing',
  meesho: 'shopping',

  // Subscriptions
  netflix: 'streaming',
  spotify: 'music',
  hotstar: 'streaming',
  youtube: 'streaming',
  'prime video': 'streaming',

  // Telecom / utilities
  airtel: 'mobile',
  jio: 'mobile',
  vi: 'mobile',
  bescom: 'electricity',
  'tata power': 'electricity',

  // Fuel
  'indian oil': 'fuel',
  hpcl: 'fuel',
  bpcl: 'fuel',
  shell: 'fuel',

  // Health
  'apollo pharmacy': 'pharmacy',
  '1mg': 'pharmacy',
  pharmeasy: 'pharmacy',
  netmeds: 'pharmacy',
  medplus: 'pharmacy',
  practo: 'doctor',
  'apollo hospital': 'hospital',
  fortis: 'hospital',
  'manipal hospital': 'hospital',
  'max hospital': 'hospital',
  'narayana health': 'hospital',

  // Credit / BNPL
  cred: 'credit-card-bill',
  simpl: 'bnpl',
  lazypay: 'bnpl',
};
