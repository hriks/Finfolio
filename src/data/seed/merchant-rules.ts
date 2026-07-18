import type { Database } from '../database';
import { newId } from '../ids';

type Rule = { merchant: string; categoryId: string };

const RULES: Rule[] = [
  // Food
  { merchant: 'swiggy', categoryId: 'cat-food' },
  { merchant: 'zomato', categoryId: 'cat-food' },
  { merchant: 'dominos', categoryId: 'cat-food' },
  { merchant: 'kfc', categoryId: 'cat-food' },
  { merchant: 'mcdonalds', categoryId: 'cat-food' },
  // Transport
  { merchant: 'uber', categoryId: 'cat-transport' },
  { merchant: 'ola', categoryId: 'cat-transport' },
  { merchant: 'rapido', categoryId: 'cat-transport' },
  { merchant: 'namma yatri', categoryId: 'cat-transport' },
  // Groceries
  { merchant: 'bigbasket', categoryId: 'cat-groceries' },
  { merchant: 'blinkit', categoryId: 'cat-groceries' },
  { merchant: 'zepto', categoryId: 'cat-groceries' },
  { merchant: 'dmart', categoryId: 'cat-groceries' },
  { merchant: 'instamart', categoryId: 'cat-groceries' },
  // Shopping
  { merchant: 'amazon', categoryId: 'cat-shopping' },
  { merchant: 'flipkart', categoryId: 'cat-shopping' },
  { merchant: 'myntra', categoryId: 'cat-shopping' },
  { merchant: 'meesho', categoryId: 'cat-shopping' },
  // Subscriptions
  { merchant: 'netflix', categoryId: 'cat-subscriptions' },
  { merchant: 'spotify', categoryId: 'cat-subscriptions' },
  { merchant: 'youtube', categoryId: 'cat-subscriptions' },
  { merchant: 'hotstar', categoryId: 'cat-subscriptions' },
  { merchant: 'prime video', categoryId: 'cat-subscriptions' },
  // Bills / Utilities
  { merchant: 'airtel', categoryId: 'cat-bills' },
  { merchant: 'jio', categoryId: 'cat-bills' },
  { merchant: 'vi', categoryId: 'cat-bills' },
  { merchant: 'bescom', categoryId: 'cat-bills' },
  { merchant: 'tata power', categoryId: 'cat-bills' },
  // Fuel
  { merchant: 'indian oil', categoryId: 'cat-fuel' },
  { merchant: 'hpcl', categoryId: 'cat-fuel' },
  { merchant: 'bpcl', categoryId: 'cat-fuel' },
  { merchant: 'shell', categoryId: 'cat-fuel' },
  // Medical (doctor / pharmacy / hospital)
  { merchant: 'apollo pharmacy', categoryId: 'cat-medical' },
  { merchant: 'apollo hospital', categoryId: 'cat-medical' },
  { merchant: '1mg', categoryId: 'cat-medical' },
  { merchant: 'pharmeasy', categoryId: 'cat-medical' },
  { merchant: 'netmeds', categoryId: 'cat-medical' },
  { merchant: 'medplus', categoryId: 'cat-medical' },
  { merchant: 'practo', categoryId: 'cat-medical' },
  { merchant: 'fortis', categoryId: 'cat-medical' },
  { merchant: 'manipal hospital', categoryId: 'cat-medical' },
  { merchant: 'max hospital', categoryId: 'cat-medical' },
  { merchant: 'narayana health', categoryId: 'cat-medical' },
  { merchant: 'cult fit', categoryId: 'cat-health' },
  { merchant: 'cultfit', categoryId: 'cat-health' },
  { merchant: 'healthify', categoryId: 'cat-health' },
  // SIN (alcohol / tobacco / chewing products)
  { merchant: 'liquor', categoryId: 'cat-vices' },
  { merchant: 'wine shop', categoryId: 'cat-vices' },
  { merchant: 'wine', categoryId: 'cat-vices' },
  { merchant: 'bar', categoryId: 'cat-vices' },
  { merchant: 'pub', categoryId: 'cat-vices' },
  { merchant: 'beer', categoryId: 'cat-vices' },
  { merchant: 'kingfisher', categoryId: 'cat-vices' },
  { merchant: 'cigarette', categoryId: 'cat-vices' },
  { merchant: 'cigar', categoryId: 'cat-vices' },
  { merchant: 'tobacco', categoryId: 'cat-vices' },
  { merchant: 'gutka', categoryId: 'cat-vices' },
  { merchant: 'pan masala', categoryId: 'cat-vices' },
  { merchant: 'paan', categoryId: 'cat-vices' },
  { merchant: 'chewing tobacco', categoryId: 'cat-vices' },
  { merchant: 'rajshree', categoryId: 'cat-vices' },
  { merchant: 'kamla pasand', categoryId: 'cat-vices' },
  // Loan repayment
  { merchant: 'emi', categoryId: 'cat-loan' },
  { merchant: 'loan repayment', categoryId: 'cat-loan' },
  { merchant: 'lending', categoryId: 'cat-loan' },
  { merchant: 'bajaj finserv', categoryId: 'cat-loan' },
  { merchant: 'cred', categoryId: 'cat-loan' },
  { merchant: 'simpl', categoryId: 'cat-loan' },
  { merchant: 'lazypay', categoryId: 'cat-loan' },
  // Pets
  { merchant: 'heads up for tails', categoryId: 'cat-pets' },
  { merchant: 'supertails', categoryId: 'cat-pets' },
  { merchant: 'vet', categoryId: 'cat-pets' },
  // Gifts / Donations
  { merchant: 'donation', categoryId: 'cat-gifts' },
  { merchant: 'akshaya patra', categoryId: 'cat-gifts' },
  { merchant: 'goonj', categoryId: 'cat-gifts' },
  //
  // ---- Rules promoted from real usage (user-taught, origin stays 'bundled' here) ----
  // Matching is exact-first then substring (incoming merchant_norm must CONTAIN the
  // rule string — see src/services/categorizer/rules.ts), so short forms below also
  // cover truncated norms like 'bigtree entertainment pri' / 'zerodha broking limited'.
  // 'netflix com' is intentionally NOT added: the existing 'netflix' rule already
  // matches it via substring.
  { merchant: 'ekart', categoryId: 'cat-shopping' },
  { merchant: 'amazon pay later', categoryId: 'cat-shopping' },
  { merchant: 'redcliffe labs', categoryId: 'cat-medical' },
  { merchant: 'agrawal medical store', categoryId: 'cat-medical' },
  { merchant: 'bookmyshow', categoryId: 'cat-entertainment' },
  // BookMyShow's legal entity; covers the truncated norm 'bigtree entertainment pri'.
  { merchant: 'bigtree entertainment', categoryId: 'cat-entertainment' },
  // Covers 'zerodha broking limited' and any other Zerodha norm via substring.
  { merchant: 'zerodha', categoryId: 'cat-investments' },
  // Normalization artifact of 'LIC OF INDIA' — observed norm is exactly 'lic of',
  // and the substring rule also covers fuller norms like 'lic of india'.
  { merchant: 'lic of', categoryId: 'cat-insurance' },
  { merchant: 'indane', categoryId: 'cat-bills' },
  { merchant: 'claude', categoryId: 'cat-subscriptions' },
  { merchant: 'anthropic claude sub', categoryId: 'cat-subscriptions' },
  { merchant: 'google workspace', categoryId: 'cat-subscriptions' },
  { merchant: 'godaddy', categoryId: 'cat-subscriptions' },
  { merchant: 'om automobiles', categoryId: 'cat-fuel' },
  { merchant: 'badri gulab and sons', categoryId: 'cat-fuel' },
  { merchant: 'bir and sons', categoryId: 'cat-fuel' },
  { merchant: 'malnad coffee house', categoryId: 'cat-food' },
  { merchant: 'kallusweetsandnamkeen', categoryId: 'cat-food' },
  { merchant: 'm s kallu ram confectione', categoryId: 'cat-food' },
  //
  // ---- Personal payees learned from usage ----
  // Person-name UPI payees the user consistently categorized. Deliberately EXCLUDED:
  // 'web upi' (generic payment rail), 'civil lines' (location — was an ATM
  // withdrawal), 'phonepe' (payment rail; would miscategorize everything paid via
  // PhonePe).
  // Gifts & Donations
  { merchant: 'ashwini manish gupta', categoryId: 'cat-gifts' },
  { merchant: 'sarita gupta', categoryId: 'cat-gifts' },
  { merchant: 'navya shree d', categoryId: 'cat-gifts' },
  // Travel (merged into Transport — cat-travel no longer exists)
  { merchant: 'kashi prasad', categoryId: 'cat-transport' },
  { merchant: 'basavaraj meda', categoryId: 'cat-transport' },
  { merchant: 'r deepak singh', categoryId: 'cat-transport' },
  { merchant: 'kishan mali', categoryId: 'cat-transport' },
  { merchant: 'revansiddappa', categoryId: 'cat-transport' },
  { merchant: 'sunil g', categoryId: 'cat-transport' },
  { merchant: 'bhabani shankar behera', categoryId: 'cat-transport' },
  { merchant: 'guru prasad b', categoryId: 'cat-transport' },
  { merchant: 'lawrence p b', categoryId: 'cat-transport' },
  { merchant: 'rohan kumar rauniyar', categoryId: 'cat-transport' },
  // SIN
  { merchant: 'ravi pan bhandar', categoryId: 'cat-vices' },
  { merchant: 'dharm nath yadav', categoryId: 'cat-vices' },
  { merchant: 'ramvilas yadavram sundari', categoryId: 'cat-vices' },
  { merchant: 'vinod k kesharwani', categoryId: 'cat-vices' },
  { merchant: 'shivranjan kumar', categoryId: 'cat-vices' },
  { merchant: 'pradeep kumar s o ba', categoryId: 'cat-vices' },
  { merchant: 'kapil giri', categoryId: 'cat-vices' },
  { merchant: 'prem chandra chaurasia', categoryId: 'cat-vices' },
  // Groceries
  { merchant: 'sunil yadav', categoryId: 'cat-groceries' },
  { merchant: 'amit k srivastava', categoryId: 'cat-groceries' },
  { merchant: 'mr jageshwar prasa', categoryId: 'cat-groceries' },
  { merchant: 'sahib khan', categoryId: 'cat-groceries' },
  // Food
  { merchant: 'mr md shahid', categoryId: 'cat-food' },
  { merchant: 'md samim', categoryId: 'cat-food' },
  { merchant: 'himayou raza', categoryId: 'cat-food' },
  { merchant: 'santosh kumar gupta', categoryId: 'cat-food' },
  { merchant: 'aashib beg', categoryId: 'cat-food' },
  { merchant: 'chiken wala', categoryId: 'cat-food' },
  // Fuel
  { merchant: 'mr mohammad maksud alam', categoryId: 'cat-fuel' },
  { merchant: 'narayan singh chauhan', categoryId: 'cat-fuel' },
  // Education
  { merchant: 'rajat mishra', categoryId: 'cat-education' },
  { merchant: 'uttar pradesh subordinate', categoryId: 'cat-education' },
  // Investments
  { merchant: 'ashutosh giri', categoryId: 'cat-investments' },
  { merchant: 'ntagic software', categoryId: 'cat-investments' },
  // Bills
  { merchant: 'pranjal pandey', categoryId: 'cat-bills' },
  //
  // ---- AI-labeled rules (2026-07-18 categorizer optimization) ----
  { merchant: 'blue tokai coffee roaster', categoryId: 'cat-food' },
  { merchant: 'kesharwani chaat corner', categoryId: 'cat-food' },
  { merchant: 'arshad nariyal pani', categoryId: 'cat-food' },
  { merchant: 'smw rekha srivastava clin', categoryId: 'cat-medical' },
  { merchant: 'swiggy instamart', categoryId: 'cat-groceries' },
];

export const seedMerchantRules = (db: Database): void => {
  const now = Date.now();
  for (const r of RULES) {
    try {
      db.run(
        `INSERT OR IGNORE INTO merchant_rules
         (id, merchant_norm, category_id, origin, weight, created_at)
         VALUES (?, ?, ?, 'bundled', 1, ?)`,
        [newId(), r.merchant, r.categoryId, now],
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[seed] merchant rule failed', r.merchant, e);
    }
  }
};
