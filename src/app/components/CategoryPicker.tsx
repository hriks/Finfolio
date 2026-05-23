import React from 'react';
import { Modal, View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import type { Category } from '../../types/domain';
import { getDb } from '../services';
import { seedCategories } from '../../data/seed/categories';
import { palette, spacing, font, radius } from '../theme';

const mapRows = (rows: Record<string, unknown>[]): Category[] =>
  rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    icon: (r.icon as string) ?? null,
    color: (r.color as string) ?? null,
    isSystem: !!r.is_system,
  }));

const SELECT_SQL =
  'SELECT id, name, icon, color, is_system FROM categories ORDER BY is_system DESC, name ASC';

const loadCategories = (): Category[] => {
  try {
    const db = getDb();
    let rows = db.all<Record<string, unknown>>(SELECT_SQL);
    if (rows.length === 0) {
      // self-heal: seed didn't take. Force re-run.
      // eslint-disable-next-line no-console
      console.warn('[picker] categories empty — force-reseeding');
      seedCategories(db);
      rows = db.all<Record<string, unknown>>(SELECT_SQL);
      // eslint-disable-next-line no-console
      console.log(`[picker] after reseed: ${rows.length} categories`);
    }
    return mapRows(rows);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[picker] loadCategories failed', e);
    return [];
  }
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (cat: Category) => void;
  selectedId?: string | null;
}

export const CategoryPicker: React.FC<Props> = ({ visible, onClose, onSelect, selectedId }) => {
  const [cats, setCats] = React.useState<Category[]>([]);
  React.useEffect(() => {
    if (visible) setCats(loadCategories());
  }, [visible]);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Choose category</Text>
          <FlatList
            data={cats}
            keyExtractor={(c) => c.id}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.row, item.id === selectedId && styles.rowSelected]}
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
              >
                <View style={[styles.dot, { backgroundColor: item.color ?? palette.surfaceAlt }]} />
                <Text style={styles.name}>{item.name}</Text>
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.bgTint,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
    maxHeight: '75%',
    borderTopWidth: 1,
    borderTopColor: palette.glassHi,
  },
  title: {
    color: palette.text,
    fontSize: font.lg,
    fontWeight: '600',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowSelected: { backgroundColor: palette.surfaceAlt },
  dot: { width: 14, height: 14, borderRadius: 7 },
  name: { color: palette.text, fontSize: font.md },
});
