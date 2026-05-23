import type { Category } from '../types/domain';
import { getDb } from './services';

export const loadCategoriesMap = (): Record<string, Category> => {
  try {
    const rows = getDb().all<Record<string, unknown>>(
      'SELECT id, name, icon, color, is_system FROM categories',
    );
    const map: Record<string, Category> = {};
    for (const r of rows) {
      const c: Category = {
        id: r.id as string,
        name: r.name as string,
        icon: (r.icon as string) ?? null,
        color: (r.color as string) ?? null,
        isSystem: !!r.is_system,
      };
      map[c.id] = c;
    }
    return map;
  } catch {
    return {};
  }
};

export const loadCategoriesList = (): Category[] => Object.values(loadCategoriesMap());
