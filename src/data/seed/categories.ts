import type { Database } from '../database';

const CATEGORIES: ReadonlyArray<{ id: string; name: string; icon: string; color: string }> = [
  { id: 'cat-food', name: 'Food', icon: 'utensils', color: '#F59E0B' },
  { id: 'cat-groceries', name: 'Groceries', icon: 'shopping-cart', color: '#84CC16' },
  { id: 'cat-transport', name: 'Transport', icon: 'car', color: '#3B82F6' },
  { id: 'cat-fuel', name: 'Fuel', icon: 'droplet', color: '#DC2626' },
  { id: 'cat-shopping', name: 'Shopping', icon: 'shopping-bag', color: '#EC4899' },
  { id: 'cat-bills', name: 'Bills', icon: 'file-text', color: '#EF4444' },
  { id: 'cat-rent', name: 'Rent', icon: 'home', color: '#B45309' },
  { id: 'cat-entertainment', name: 'Entertainment', icon: 'film', color: '#8B5CF6' },
  { id: 'cat-subscriptions', name: 'Subscriptions', icon: 'repeat', color: '#7C3AED' },
  { id: 'cat-medical', name: 'Medical', icon: 'plus-square', color: '#E11D48' },
  { id: 'cat-health', name: 'Health & Fitness', icon: 'activity', color: '#10B981' },
  { id: 'cat-personal', name: 'Personal Care', icon: 'user', color: '#F472B6' },
  { id: 'cat-vices', name: 'SIN', icon: 'cigarette', color: '#7F1D1D' },
  { id: 'cat-pets', name: 'Pets', icon: 'paw', color: '#A16207' },
  { id: 'cat-gifts', name: 'Gifts & Donations', icon: 'gift', color: '#F472B6' },
  { id: 'cat-education', name: 'Education', icon: 'book', color: '#6366F1' },
  { id: 'cat-investments', name: 'Investments', icon: 'trending-up', color: '#059669' },
  { id: 'cat-insurance', name: 'Insurance', icon: 'shield', color: '#1E40AF' },
  { id: 'cat-loan', name: 'Loan Repayment', icon: 'credit-card', color: '#9333EA' },
  { id: 'cat-salary', name: 'Salary', icon: 'briefcase', color: '#0891B2' },
  { id: 'cat-refund', name: 'Refund', icon: 'rotate-ccw', color: '#16A34A' },
  { id: 'cat-atm', name: 'ATM', icon: 'credit-card', color: '#475569' },
  { id: 'cat-transfer', name: 'Transfer', icon: 'send', color: '#64748B' },
  { id: 'cat-uncategorized', name: 'Uncategorized', icon: 'help-circle', color: '#9CA3AF' },
];

export const seedCategories = (db: Database): void => {
  for (const c of CATEGORIES) {
    try {
      db.run(
        'INSERT OR IGNORE INTO categories (id, name, icon, color, is_system) VALUES (?, ?, ?, ?, 1)',
        [c.id, c.name, c.icon, c.color],
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[seed] category failed', c.id, e);
    }
  }
};

export const UNCATEGORIZED_ID = 'cat-uncategorized';
