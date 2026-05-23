import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { palette, spacing, font, radius } from '../../theme';
import { getDb } from '../../services';
import { loadCategoriesList } from '../../categories';
import { Icon } from '../../components/Icon';
import { tapHaptic, successHaptic, warnHaptic } from '../../haptic';
import type { Category } from '../../../types/domain';

const COLOR_SWATCHES = [
  '#F59E0B', '#3B82F6', '#EC4899', '#EF4444', '#8B5CF6',
  '#10B981', '#06B6D4', '#6366F1', '#84CC16', '#F472B6',
  '#DC2626', '#7C3AED', '#059669', '#0891B2', '#16A34A',
  '#475569', '#64748B', '#B45309', '#1E40AF', '#E11D48',
  '#7F1D1D', '#A16207', '#9333EA',
];

export const CategoriesScreen: React.FC = () => {
  const [cats, setCats] = React.useState<Category[]>([]);
  const [editing, setEditing] = React.useState<Category | null>(null);
  const [creating, setCreating] = React.useState(false);

  const reload = React.useCallback(() => setCats(loadCategoriesList()), []);
  React.useEffect(reload, [reload]);

  return (
    <View style={styles.root}>
      <FlatList
        data={cats}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            onPress={() => {
              tapHaptic();
              setEditing(item);
            }}
          >
            <View style={[styles.dot, { backgroundColor: item.color ?? palette.surfaceAlt }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.meta}>{item.isSystem ? 'System' : 'Custom'}</Text>
            </View>
            <Icon name="forward" size={18} color={palette.muted} />
          </Pressable>
        )}
      />

      <Pressable
        style={({ pressed }) => [styles.fab, pressed && { opacity: 0.7 }]}
        onPress={() => {
          tapHaptic();
          setCreating(true);
        }}
      >
        <Icon name="plus" size={24} color="#ffffff" />
        <Text style={styles.fabText}>New category</Text>
      </Pressable>

      <EditModal
        visible={!!editing}
        category={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          reload();
          setEditing(null);
        }}
      />
      <EditModal
        visible={creating}
        category={null}
        onClose={() => setCreating(false)}
        onSaved={() => {
          reload();
          setCreating(false);
        }}
      />
    </View>
  );
};

interface EditProps {
  visible: boolean;
  category: Category | null;
  onClose: () => void;
  onSaved: () => void;
}

const EditModal: React.FC<EditProps> = ({ visible, category, onClose, onSaved }) => {
  const isNew = !category;
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState<string>(COLOR_SWATCHES[0]);
  React.useEffect(() => {
    if (visible) {
      setName(category?.name ?? '');
      setColor(category?.color ?? COLOR_SWATCHES[0]);
    }
  }, [visible, category]);

  const save = () => {
    const n = name.trim();
    if (!n) {
      Alert.alert('Name required');
      return;
    }
    try {
      if (isNew) {
        const id = `usercat-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
        getDb().run(
          'INSERT INTO categories (id, name, icon, color, is_system) VALUES (?, ?, ?, ?, 0)',
          [id, n, null, color],
        );
      } else {
        getDb().run('UPDATE categories SET name = ?, color = ? WHERE id = ?', [n, color, category.id]);
      }
      successHaptic();
      onSaved();
    } catch (e) {
      Alert.alert('Save failed', String(e));
    }
  };

  const remove = () => {
    if (!category) return;
    Alert.alert(
      `Delete "${category.name}"?`,
      category.isSystem
        ? "This is a system category; existing expenses won't be deleted, just uncategorized."
        : "Existing expenses with this category will become uncategorized.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              warnHaptic();
              const db = getDb();
              db.run("UPDATE expenses SET category_id = 'cat-uncategorized' WHERE category_id = ?", [category.id]);
              db.run("UPDATE merchant_rules SET category_id = 'cat-uncategorized' WHERE category_id = ?", [category.id]);
              db.run('DELETE FROM categories WHERE id = ?', [category.id]);
              onSaved();
            } catch (e) {
              Alert.alert('Delete failed', String(e));
            }
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <Text style={styles.modalTitle}>{isNew ? 'New category' : 'Edit category'}</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Coffee runs"
            placeholderTextColor={palette.muted}
          />

          <Text style={styles.label}>Color</Text>
          <View style={styles.swatches}>
            {COLOR_SWATCHES.map((c) => (
              <Pressable
                key={c}
                onPress={() => {
                  tapHaptic();
                  setColor(c);
                }}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  color === c && styles.swatchActive,
                ]}
              />
            ))}
          </View>

          <Pressable style={styles.saveBtn} onPress={save}>
            <Text style={styles.saveText}>{isNew ? 'Create' : 'Save'}</Text>
          </Pressable>
          {!isNew ? (
            <Pressable style={styles.deleteBtn} onPress={remove}>
              <Text style={styles.deleteText}>Delete category</Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowPressed: { backgroundColor: palette.surfaceAlt },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: palette.border },
  dot: { width: 16, height: 16, borderRadius: 8 },
  name: { color: palette.text, fontSize: font.md, fontWeight: '600' },
  meta: { color: palette.muted, fontSize: font.xs, marginTop: 2 },
  fab: {
    position: 'absolute',
    bottom: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: palette.brand,
    borderRadius: radius.pill,
    shadowColor: palette.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: { color: '#ffffff', fontSize: font.md, fontWeight: '700' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: palette.bgTint,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: palette.glassHi,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: palette.muted,
    marginBottom: spacing.md,
  },
  modalTitle: { color: palette.text, fontSize: font.xl, fontWeight: '800', marginBottom: spacing.md },
  label: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: palette.surfaceAlt,
    color: palette.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    fontSize: font.md,
    borderWidth: 1,
    borderColor: palette.glassHi,
  },
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: palette.text },
  saveBtn: {
    marginTop: spacing.lg,
    backgroundColor: palette.brand,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  saveText: { color: '#ffffff', fontSize: font.md, fontWeight: '800' },
  deleteBtn: {
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  deleteText: { color: palette.danger, fontSize: font.md, fontWeight: '700' },
});
