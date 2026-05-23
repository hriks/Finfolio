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
