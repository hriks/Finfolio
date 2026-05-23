import { create } from 'zustand';
import type { Expense } from '../../types/domain';
import type { InsertExpenseInput } from '../../services/expense-service';
import { getExpenseService } from '../services';

interface ExpensesState {
  items: Expense[];
  pending: Expense[];
  loading: boolean;
  refresh: () => void;
  add: (input: InsertExpenseInput) => Expense;
  update: (
    id: string,
    patch: Parameters<ReturnType<typeof getExpenseService>['update']>[1],
  ) => void;
  setCategory: (id: string, categoryId: string | null) => void;
  void: (id: string) => void;
  unvoid: (id: string) => void;
  delete: (id: string) => void;
  confirmPending: (id: string) => void;
}

const loadAll = () => {
  try {
    const svc = getExpenseService();
    const items = svc.list({ includeVoid: true, limit: 1000 });
    const pending = items.filter((e) => e.status === 'pending_review');
    return { items, pending };
  } catch {
    return { items: [], pending: [] };
  }
};

export const useExpensesStore = create<ExpensesState>((set, get) => ({
  items: [],
  pending: [],
  loading: false,
  refresh: () => {
    set({ loading: true });
    const data = loadAll();
    set({ ...data, loading: false });
  },
  add: (input) => {
    const e = getExpenseService().insert(input);
    get().refresh();
    return e;
  },
  update: (id, patch) => {
    getExpenseService().update(id, patch);
    get().refresh();
  },
  setCategory: (id, categoryId) => {
    getExpenseService().update(id, { categoryId });
    get().refresh();
  },
  void: (id) => {
    getExpenseService().void(id);
    get().refresh();
  },
  unvoid: (id) => {
    getExpenseService().unvoid(id);
    get().refresh();
  },
  delete: (id) => {
    getExpenseService().delete(id);
    get().refresh();
  },
  confirmPending: (id) => {
    getExpenseService().setStatus(id, 'active');
    get().refresh();
  },
}));
