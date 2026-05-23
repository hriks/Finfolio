import React from 'react';
import { View, Text, StyleSheet, SectionList, TextInput, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear } from 'date-fns';
import { palette, spacing, font, radius } from '../../theme';
import { useExpensesStore } from '../../stores/expenses';
import { LedgerRow } from '../../components/LedgerRow';
import { EmptyState } from '../../components/EmptyState';
import { Icon } from '../../components/Icon';
import { FilterDrawer, type FilterState } from '../../components/FilterDrawer';
import { loadCategoriesMap, loadCategoriesList } from '../../categories';
import { startSmsScan } from '../../sync';
import { useScanStore } from '../../stores/scan';
import { formatAmount } from '../../components/ExpenseRow';
import type { RootStackParamList } from '../../navigation';
import type { Expense, Category } from '../../../types/domain';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface Section {
  title: string;
  data: Expense[];
}

const groupByDay = (items: Expense[]): Section[] => {
  const buckets = new Map<string, Expense[]>();
  for (const e of items) {
    const key = format(new Date(e.occurredAt), 'yyyy-MM-dd');
    const arr = buckets.get(key) ?? [];
    arr.push(e);
    buckets.set(key, arr);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([k, data]) => ({
      title: format(new Date(k), 'EEEE, MMM d'),
      data,
    }));
};

export const ExpensesScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const items = useExpensesStore((s) => s.items);
  const refresh = useExpensesStore((s) => s.refresh);

  const [cats, setCats] = React.useState<Record<string, Category>>({});
  const [catList, setCatList] = React.useState<Category[]>([]);
  const [search, setSearch] = React.useState('');
  const [filters, setFilters] = React.useState<FilterState>({
    dateFilter: 'all',
    sourceFilter: 'all',
    statusFilter: 'all',
    catFilter: null,
  });
  const [showFilter, setShowFilter] = React.useState(false);
  const scanning = useScanStore((s) => s.scanning);
  const { dateFilter, sourceFilter, statusFilter, catFilter } = filters;
  const activeFilterCount =
    (dateFilter !== 'all' ? 1 : 0) +
    (sourceFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (catFilter ? 1 : 0);

  React.useEffect(() => {
    refresh();
    setCats(loadCategoriesMap());
    setCatList(loadCategoriesList());
  }, [refresh]);

  const now = Date.now();
  const dateMin = React.useMemo(() => {
    switch (dateFilter) {
      case 'today':
        return startOfDay(new Date(now)).getTime();
      case 'week':
        return startOfWeek(new Date(now), { weekStartsOn: 1 }).getTime();
      case 'month':
        return startOfMonth(new Date(now)).getTime();
      case 'year':
        return startOfYear(new Date(now)).getTime();
      default:
        return 0;
    }
  }, [dateFilter, now]);

  // Default view = SPENT expenses only (status 'active'). pending_review/void
  // are excluded unless the user explicitly filters for them.
  const filtered = items.filter((e) => {
    if (statusFilter === 'all') {
      if (e.status !== 'active') return false;
    } else if (e.status !== statusFilter) {
      return false;
    }
    if (e.occurredAt < dateMin) return false;
    if (catFilter && e.categoryId !== catFilter) return false;
    if (sourceFilter !== 'all' && e.source !== sourceFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${e.merchantRaw ?? ''} ${e.note ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const total = filtered.reduce((s, e) => s + e.amountMinor, 0);
  const sections = groupByDay(filtered);
  const hasAnyExpenses = items.some((e) => e.status === 'active');

  const startScan = () => void startSmsScan();

  if (!hasAnyExpenses) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <EmptyState
          title="No expenses yet!"
          body="Add your first expense, or import the last 6 months from your SMS inbox."
          actionLabel="Add Expense"
          onAction={() => nav.navigate('AddSheet')}
          secondaryLabel={scanning ? 'Scanning…' : 'Sync from SMS inbox'}
          onSecondary={scanning ? undefined : startScan}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.headerRow}>
        <TextInput
          style={[styles.search, { flex: 1 }]}
          placeholder="Search merchant or note"
          placeholderTextColor={palette.muted}
          value={search}
          onChangeText={setSearch}
        />
        <Pressable style={styles.iconBtn} onPress={() => setShowFilter(true)}>
          <Icon name="filter" size={20} color={palette.text} />
          {activeFilterCount > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeFilterCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={startScan}>
          <Icon name="search" size={18} color={palette.text} />
        </Pressable>
      </View>

      <View style={styles.summaryBar}>
        <Text style={styles.summaryLabel}>
          {filtered.length} transaction{filtered.length === 1 ? '' : 's'}
        </Text>
        <Text style={styles.summaryAmount}>−{formatAmount(total)}</Text>
      </View>

      {sections.length === 0 ? (
        <View style={{ padding: spacing.xl, alignItems: 'center' }}>
          <Text style={{ color: palette.muted, fontSize: font.md }}>No transactions match</Text>
          <Text style={{ color: palette.muted, fontSize: font.sm, marginTop: spacing.xs }}>
            Try changing the filters
          </Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LedgerRow
              expense={item}
              category={item.categoryId ? cats[item.categoryId] : null}
              onPress={(id) => nav.navigate('ExpenseDetail', { id })}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.dayHeader}>
              <Text style={styles.dayText}>{section.title}</Text>
            </View>
          )}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}

      <FilterDrawer
        visible={showFilter}
        onClose={() => setShowFilter(false)}
        value={filters}
        onChange={setFilters}
        categories={catList}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg, paddingTop: 0 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  search: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: palette.surfaceStrong,
    color: palette.text,
    borderRadius: radius.md,
    fontSize: font.md,
    borderWidth: 1,
    borderColor: palette.glassHi,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.glassHi,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: palette.brand,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  summaryBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  summaryLabel: { color: palette.muted, fontSize: font.sm, fontWeight: '600' },
  summaryAmount: { color: palette.danger, fontSize: font.lg, fontWeight: '800' },
  scanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.brandFaint,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassHi,
  },
  scanText: { color: palette.text, fontSize: font.sm },
  dayHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    backgroundColor: palette.bg,
  },
  dayText: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
