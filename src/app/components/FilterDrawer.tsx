import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { palette, spacing, font, radius } from '../theme';
import { tapHaptic, successHaptic } from '../haptic';
import type { Category, ExpenseSource, ExpenseStatus } from '../../types/domain';

export type DateFilter = 'all' | 'today' | 'week' | 'month' | 'year';
export type SourceFilter = 'all' | ExpenseSource;
export type StatusFilter = 'all' | ExpenseStatus;

export interface FilterState {
  dateFilter: DateFilter;
  sourceFilter: SourceFilter;
  statusFilter: StatusFilter;
  catFilter: string | null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  value: FilterState;
  onChange: (next: FilterState) => void;
  categories: Category[];
}

const DATE_OPTIONS: { key: DateFilter; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
];

const SOURCE_OPTIONS: { key: SourceFilter; label: string }[] = [
  { key: 'all', label: 'All sources' },
  { key: 'manual', label: 'Manual entry' },
  { key: 'sms', label: 'SMS' },
  { key: 'notification', label: 'Notification' },
  { key: 'ocr', label: 'Receipt scan' },
  { key: 'merged', label: 'Merged' },
];

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All statuses' },
  { key: 'active', label: 'Active' },
  { key: 'pending_review', label: 'Pending review' },
  { key: 'void', label: 'Void' },
];

const RadioRow: React.FC<{ label: string; active: boolean; onPress: () => void; tint?: string }> = ({
  label,
  active,
  onPress,
  tint,
}) => (
  <Pressable
    style={[styles.radioRow, active && styles.radioRowActive]}
    onPress={() => {
      tapHaptic();
      onPress();
    }}
  >
    <View style={styles.radioOuter}>
      {active ? <View style={[styles.radioInner, tint ? { backgroundColor: tint } : null]} /> : null}
    </View>
    <Text style={[styles.radioLabel, active && { color: palette.text, fontWeight: '700' }]}>
      {label}
    </Text>
  </Pressable>
);

export const FilterDrawer: React.FC<Props> = ({ visible, onClose, value, onChange, categories }) => {
  const [local, setLocal] = React.useState<FilterState>(value);
  React.useEffect(() => {
    if (visible) setLocal(value);
  }, [visible, value]);

  const apply = () => {
    successHaptic();
    onChange(local);
    onClose();
  };

  const reset = () => {
    tapHaptic();
    const r: FilterState = { dateFilter: 'all', sourceFilter: 'all', statusFilter: 'all', catFilter: null };
    setLocal(r);
    onChange(r);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <Text style={styles.title}>Filters</Text>
            <Pressable onPress={reset}>
              <Text style={styles.resetLink}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
            <Text style={styles.sectionLabel}>Date range</Text>
            {DATE_OPTIONS.map((o) => (
              <RadioRow
                key={o.key}
                label={o.label}
                active={local.dateFilter === o.key}
                onPress={() => setLocal({ ...local, dateFilter: o.key })}
              />
            ))}

            <Text style={styles.sectionLabel}>Source</Text>
            {SOURCE_OPTIONS.map((o) => (
              <RadioRow
                key={o.key}
                label={o.label}
                active={local.sourceFilter === o.key}
                onPress={() => setLocal({ ...local, sourceFilter: o.key })}
              />
            ))}

            <Text style={styles.sectionLabel}>Status</Text>
            {STATUS_OPTIONS.map((o) => (
              <RadioRow
                key={o.key}
                label={o.label}
                active={local.statusFilter === o.key}
                onPress={() => setLocal({ ...local, statusFilter: o.key })}
              />
            ))}

            <Text style={styles.sectionLabel}>Category</Text>
            <RadioRow
              label="All categories"
              active={!local.catFilter}
              onPress={() => setLocal({ ...local, catFilter: null })}
            />
            {categories.map((c) => (
              <RadioRow
                key={c.id}
                label={c.name}
                tint={c.color ?? undefined}
                active={local.catFilter === c.id}
                onPress={() => setLocal({ ...local, catFilter: c.id })}
              />
            ))}
          </ScrollView>

          <Pressable style={styles.applyBtn} onPress={apply}>
            <Text style={styles.applyText}>Apply filters</Text>
          </Pressable>
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
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
    maxHeight: '85%',
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  title: { color: palette.text, fontSize: font.xl, fontWeight: '800' },
  resetLink: { color: palette.link, fontSize: font.md, fontWeight: '600' },
  sectionLabel: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
  },
  radioRowActive: { backgroundColor: palette.surfaceStrong },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.muted,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioInner: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.accent },
  radioLabel: { color: palette.textDim, fontSize: font.md, flex: 1 },
  applyBtn: {
    backgroundColor: palette.brand,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  applyText: { color: '#ffffff', fontWeight: '800', fontSize: font.md },
});
