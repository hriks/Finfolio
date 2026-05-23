import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  Pressable,
  AppState,
  Linking,
  Animated,
  Alert,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { startOfDay, format, isToday, subDays } from 'date-fns';
import { palette, spacing, font, radius } from '../../theme';
import { useExpensesStore } from '../../stores/expenses';
import { ExpenseRow, formatAmount } from '../../components/ExpenseRow';
import { EmptyState } from '../../components/EmptyState';
import { PermissionBanner } from '../../components/PermissionBanner';
import { GlassCard } from '../../components/GlassCard';
import { AmbientBackground } from '../../components/AmbientBackground';
import { loadCategoriesMap } from '../../categories';
import { getDb } from '../../services';
import { useSettingsStore } from '../../stores/settings';
import {
  fetchPermissionStatus,
  openNotificationListenerSettings,
  openBatteryOptimizationSettings,
  type PermissionStatus,
} from '../../native/permission-status';
import { tapHaptic } from '../../haptic';
import type { RootStackParamList, HomeStackParamList } from '../../navigation';
import type { Category, Expense } from '../../../types/domain';

type Nav = NativeStackNavigationProp<RootStackParamList & HomeStackParamList>;

// 6-month rolling window of days, today is the rightmost page.
const WINDOW_DAYS = 180;
const TODAY_INDEX = WINDOW_DAYS - 1;
const TIMELINE_PILL_W = 60;

const dateForIndex = (idx: number, anchorToday: Date): Date =>
  subDays(anchorToday, TODAY_INDEX - idx);

const lastBackupAt = (): number | null => {
  try {
    const row = getDb().get<{ created_at: number }>(
      'SELECT created_at FROM backup_meta ORDER BY created_at DESC LIMIT 1',
    );
    return row?.created_at ?? null;
  } catch {
    return null;
  }
};

export const HomeScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const { width: screenW } = useWindowDimensions();

  const items = useExpensesStore((s) => s.items);
  const pending = useExpensesStore((s) => s.pending);
  const loading = useExpensesStore((s) => s.loading);
  const refreshExpenses = useExpensesStore((s) => s.refresh);

  const settings = useSettingsStore((s) => s.settings);
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const [cats, setCats] = React.useState<Record<string, Category>>({});
  const [, setLastBackup] = React.useState<number | null>(null);
  const [dismissed, setDismissed] = React.useState<Record<string, boolean>>({});
  const [permStatus, setPermStatus] = React.useState<PermissionStatus | null>(null);

  // Pager state. `today` is locked at mount so all index math is stable.
  const todayRef = React.useRef<Date>(startOfDay(new Date()));
  const [pageIndex, setPageIndex] = React.useState<number>(TODAY_INDEX);
  const pagerRef = React.useRef<FlatList<number>>(null);
  const timelineRef = React.useRef<FlatList<number>>(null);

  const doRefresh = React.useCallback(() => {
    refreshExpenses();
    refreshSettings();
    setCats(loadCategoriesMap());
    setLastBackup(lastBackupAt());
    fetchPermissionStatus()
      .then(setPermStatus)
      .catch(() => setPermStatus(null));
  }, [refreshExpenses, refreshSettings]);

  React.useEffect(() => {
    doRefresh();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') doRefresh();
    });
    return () => sub.remove();
  }, [doRefresh]);

  const perms = permStatus ?? settings.perms ?? {};
  const missing: Array<{ key: string; title: string; body: string; onFix: () => void }> = [];
  if (!perms.sms)
    missing.push({
      key: 'sms',
      title: 'SMS access missing',
      body: 'Enable to auto-import transactional SMS.',
      onFix: () => Linking.openSettings().catch(() => undefined),
    });
  if (!perms.notificationListener)
    missing.push({
      key: 'nl',
      title: 'Notification Listener off',
      body: 'Enable to capture UPI/bank notifications.',
      onFix: () =>
        openNotificationListenerSettings().catch((e) =>
          Linking.openSettings().catch(() =>
            Alert.alert('Could not open settings', `Notification Listener: ${e?.message ?? e}`),
          ),
        ),
    });
  if (!perms.batteryExempt)
    missing.push({
      key: 'battery',
      title: 'Battery optimization on',
      body: 'Exempt the app for reliable background ingestion.',
      onFix: () =>
        openBatteryOptimizationSettings().catch((e) =>
          Linking.openSettings().catch(() =>
            Alert.alert('Could not open settings', `Battery: ${e?.message ?? e}`),
          ),
        ),
    });
  if (!perms.postNotifications)
    missing.push({
      key: 'post',
      title: 'Notifications disabled',
      body: 'Allow notifications for review alerts.',
      onFix: () => Linking.openSettings().catch(() => undefined),
    });

  // Pre-bucket active expenses by yyyy-mm-dd for O(1) day lookup inside DayPage.
  const dailyBuckets = React.useMemo(() => {
    const map = new Map<string, Expense[]>();
    for (const e of items) {
      if (e.status !== 'active') continue;
      const key = format(new Date(e.occurredAt), 'yyyy-MM-dd');
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return map;
  }, [items]);

  const indices = React.useMemo(() => Array.from({ length: WINDOW_DAYS }, (_, i) => i), []);
  const getItemLayout = React.useCallback(
    (_data: unknown, i: number) => ({ length: screenW, offset: screenW * i, index: i }),
    [screenW],
  );

  const onPagerMomentumEnd = React.useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / screenW);
      if (i !== pageIndex) {
        tapHaptic();
        setPageIndex(i);
        timelineRef.current?.scrollToIndex({
          index: Math.max(0, i - 1),
          animated: true,
        });
      }
    },
    [screenW, pageIndex],
  );

  const jumpToIndex = React.useCallback((i: number) => {
    if (i < 0 || i > TODAY_INDEX) return;
    pagerRef.current?.scrollToIndex({ index: i, animated: true });
    setPageIndex(i);
  }, []);

  const renderPage = React.useCallback(
    ({ item: idx }: ListRenderItemInfo<number>) => {
      const date = dateForIndex(idx, todayRef.current);
      const key = format(date, 'yyyy-MM-dd');
      const dayList = dailyBuckets.get(key) ?? [];
      const prevKey = format(subDays(date, 1), 'yyyy-MM-dd');
      const prevList = dailyBuckets.get(prevKey) ?? [];
      // 7-day sparkline ending on this day.
      const sparkVals: number[] = [];
      for (let k = 6; k >= 0; k--) {
        const d = format(subDays(date, k), 'yyyy-MM-dd');
        const sum = (dailyBuckets.get(d) ?? []).reduce((a, x) => a + x.amountMinor, 0);
        sparkVals.push(sum);
      }
      return (
        <DayPage
          width={screenW}
          date={date}
          expenses={dayList}
          prevDayTotal={prevList.reduce((s, e) => s + e.amountMinor, 0)}
          sparkline={sparkVals}
          cats={cats}
          refreshing={loading}
          onRefresh={doRefresh}
          onAdd={() => nav.navigate('AddSheet')}
          onOpenExpense={(id) => nav.navigate('ExpenseDetail', { id })}
        />
      );
    },
    [dailyBuckets, screenW, cats, loading, doRefresh, nav],
  );

  const renderTimelinePill = React.useCallback(
    ({ item: idx }: ListRenderItemInfo<number>) => {
      const date = dateForIndex(idx, todayRef.current);
      const active = idx === pageIndex;
      return (
        <Pressable onPress={() => jumpToIndex(idx)} hitSlop={6}>
          {active ? (
            <GlassCard tone="strong" style={styles.pillActive}>
              <Text style={styles.pillDay}>{format(date, 'EEE').toUpperCase()}</Text>
              <Text style={styles.pillDateActive}>{format(date, 'd')}</Text>
            </GlassCard>
          ) : (
            <View style={styles.pill}>
              <Text style={styles.pillDay}>{format(date, 'EEE').toUpperCase()}</Text>
              <Text style={styles.pillDate}>{format(date, 'd')}</Text>
            </View>
          )}
        </Pressable>
      );
    },
    [pageIndex, jumpToIndex],
  );

  return (
    <AmbientBackground>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.bannerArea}>
          {missing
            .filter((m) => !dismissed[m.key])
            .map((m) => (
              <PermissionBanner
                key={m.key}
                tone="warn"
                title={m.title}
                body={m.body}
                ctaLabel="Fix"
                onCta={m.onFix}
                onDismiss={() => setDismissed((d) => ({ ...d, [m.key]: true }))}
              />
            ))}
          {pending.length > 0 && !dismissed.review ? (
            <PermissionBanner
              tone="warn"
              title={`${pending.length} transaction${pending.length === 1 ? '' : 's'} need${pending.length === 1 ? 's' : ''} review`}
              body="Confirm or void auto-imported expenses to include them in your totals."
              ctaLabel="Review"
              onCta={() => nav.navigate('Review')}
              onDismiss={() => setDismissed((d) => ({ ...d, review: true }))}
            />
          ) : null}
        </View>

        {/* Timeline strip — synced with pager. Active day rendered as glass capsule. */}
        <View style={styles.timelineWrap}>
          <FlatList
            ref={timelineRef}
            data={indices}
            keyExtractor={(i) => `pill-${i}`}
            renderItem={renderTimelinePill}
            horizontal
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.max(0, pageIndex - 2)}
            getItemLayout={(_d, i) => ({
              length: TIMELINE_PILL_W,
              offset: TIMELINE_PILL_W * i,
              index: i,
            })}
            contentContainerStyle={styles.timelineContent}
            onScrollToIndexFailed={(info) => {
              // Fallback if RN hasn't measured yet.
              setTimeout(
                () =>
                  timelineRef.current?.scrollToOffset({
                    offset: info.averageItemLength * info.index,
                    animated: false,
                  }),
                50,
              );
            }}
          />
        </View>

        {/* Day pager — the WHOLE content area transitions together. */}
        <FlatList
          ref={pagerRef}
          data={indices}
          keyExtractor={(i) => `page-${i}`}
          renderItem={renderPage}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={TODAY_INDEX}
          getItemLayout={getItemLayout}
          windowSize={3}
          maxToRenderPerBatch={2}
          initialNumToRender={1}
          removeClippedSubviews
          onMomentumScrollEnd={onPagerMomentumEnd}
          onScrollToIndexFailed={(info) => {
            setTimeout(
              () =>
                pagerRef.current?.scrollToOffset({
                  offset: info.averageItemLength * info.index,
                  animated: false,
                }),
              50,
            );
          }}
        />
      </SafeAreaView>
    </AmbientBackground>
  );
};

// --------------------------------------------------------------------------
// DayPage — vertically scrolling content for ONE day of the pager.
// --------------------------------------------------------------------------

interface DayPageProps {
  width: number;
  date: Date;
  expenses: Expense[];
  prevDayTotal: number;
  sparkline: number[];
  cats: Record<string, Category>;
  refreshing: boolean;
  onRefresh: () => void;
  onAdd: () => void;
  onOpenExpense: (id: string) => void;
}

const DayPage: React.FC<DayPageProps> = React.memo(function DayPage(props) {
  const {
    width,
    date,
    expenses,
    prevDayTotal,
    sparkline,
    cats,
    refreshing,
    onRefresh,
    onAdd,
    onOpenExpense,
  } = props;

  const total = expenses.reduce((s, e) => s + e.amountMinor, 0);
  const isCurrent = isToday(date);
  const heroLabel = isCurrent ? 'Today' : format(date, 'EEEE, MMM d');

  // Day-over-day delta. Positive % = spent more, shown in danger red.
  const delta = total - prevDayTotal;
  const deltaPct = prevDayTotal > 0 ? Math.round((delta / prevDayTotal) * 100) : null;

  // Parallax: hero shrinks slightly as user scrolls the inner list up.
  const scrollY = React.useRef(new Animated.Value(0)).current;
  const heroScale = scrollY.interpolate({
    inputRange: [-80, 0, 160],
    outputRange: [1.04, 1, 0.94],
    extrapolate: 'clamp',
  });
  const heroOpacity = scrollY.interpolate({
    inputRange: [0, 120, 240],
    outputRange: [1, 0.85, 0.55],
    extrapolate: 'clamp',
  });

  // Build "top categories" overview for this day (max 4).
  const byCat = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) {
      const k = e.categoryId ?? 'cat-uncat';
      m.set(k, (m.get(k) ?? 0) + e.amountMinor);
    }
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [expenses]);

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={styles.pageContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.text} />
      }
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: false,
      })}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator={false}
    >
      {/* HERO GLASS CARD */}
      <Animated.View style={{ transform: [{ scale: heroScale }], opacity: heroOpacity }}>
        <GlassCard tone="strong" style={styles.hero}>
          <Text style={styles.heroLabel}>{heroLabel.toUpperCase()}</Text>
          <Text style={styles.heroAmount}>{formatAmount(total)}</Text>
          <View style={styles.heroMetaRow}>
            <Text style={styles.heroMeta}>
              {expenses.length === 0
                ? 'No transactions'
                : `${expenses.length} transaction${expenses.length === 1 ? '' : 's'}`}
            </Text>
            {deltaPct !== null && expenses.length > 0 ? (
              <View
                style={[
                  styles.deltaPill,
                  {
                    backgroundColor:
                      delta >= 0 ? 'rgba(240,101,104,0.16)' : 'rgba(62,201,127,0.16)',
                  },
                ]}
              >
                <Text
                  style={[styles.deltaText, { color: delta >= 0 ? palette.danger : palette.ok }]}
                >
                  {delta >= 0 ? '▲' : '▼'} {Math.abs(deltaPct)}%
                </Text>
              </View>
            ) : null}
          </View>
          <Sparkline values={sparkline} />
        </GlassCard>
      </Animated.View>

      {/* CATEGORY OVERVIEW CHIPS */}
      {byCat.length > 0 ? (
        <View style={styles.chipsRow}>
          {byCat.map(([catId, amount]) => {
            const c = cats[catId];
            return (
              <GlassCard key={catId} tone="soft" style={styles.chip}>
                <View
                  style={[styles.chipDot, { backgroundColor: c?.color ?? palette.brandSoft }]}
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.chipName} numberOfLines={1}>
                    {c?.name ?? 'Other'}
                  </Text>
                  <Text style={styles.chipAmount}>{formatAmount(amount)}</Text>
                </View>
              </GlassCard>
            );
          })}
        </View>
      ) : null}

      {/* LEDGER — flat rows, no per-row glass per design rules. */}
      <View style={styles.ledgerHeader}>
        <Text style={styles.ledgerTitle}>Transactions</Text>
      </View>
      {expenses.length === 0 ? (
        <EmptyState
          title={isCurrent ? 'Nothing logged today' : 'No transactions on this day'}
          body={
            isCurrent
              ? 'Add an expense to start tracking. SMS imports happen in the background.'
              : 'Swipe right to see other days.'
          }
          actionLabel={isCurrent ? 'Add Expense' : undefined}
          onAction={isCurrent ? onAdd : undefined}
        />
      ) : (
        expenses.map((e) => (
          <ExpenseRow
            key={e.id}
            expense={e}
            category={e.categoryId ? cats[e.categoryId] : null}
            onPress={onOpenExpense}
          />
        ))
      )}
    </ScrollView>
  );
});

// --------------------------------------------------------------------------
// Sparkline — hand-rolled 7-bar mini graph using flex views. No chart dep.
// --------------------------------------------------------------------------

const Sparkline: React.FC<{ values: number[] }> = ({ values }) => {
  const max = Math.max(...values, 1);
  return (
    <View style={styles.spark}>
      {values.map((v, i) => {
        const h = Math.max(4, (v / max) * 36);
        const isLast = i === values.length - 1;
        return (
          <View
            key={i}
            style={[
              styles.sparkBar,
              { height: h, backgroundColor: isLast ? palette.lavender : palette.glassStrong },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  safe: { flex: 1 },
  bannerArea: {},

  timelineWrap: {
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
  },
  timelineContent: { paddingRight: spacing.lg, alignItems: 'center' },
  pill: {
    width: TIMELINE_PILL_W - 8,
    height: 60,
    marginRight: 8,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillActive: {
    width: TIMELINE_PILL_W - 4,
    height: 68,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillDay: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  pillDate: { color: palette.textDim, fontSize: font.lg, fontWeight: '700', marginTop: 2 },
  pillDateActive: {
    color: '#ffffff',
    fontSize: font.xl,
    fontWeight: '800',
    marginTop: 2,
    textShadowColor: palette.brandGlow,
    textShadowRadius: 8,
  },

  pageContent: { paddingBottom: spacing.xxl * 3 },

  hero: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  heroLabel: {
    color: palette.lavender,
    fontSize: font.xs,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: spacing.sm,
  },
  heroAmount: {
    color: '#ffffff',
    fontSize: 52,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 58,
  },
  heroMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  heroMeta: { color: palette.textDim, fontSize: font.sm },
  deltaPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  deltaText: { fontSize: font.xs, fontWeight: '700' },

  spark: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: spacing.lg,
    height: 40,
  },
  sparkBar: { flex: 1, borderRadius: 3 },

  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    flexBasis: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.lg,
  },
  chipDot: { width: 10, height: 10, borderRadius: 5 },
  chipName: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  chipAmount: { color: palette.text, fontSize: font.md, fontWeight: '700', marginTop: 2 },

  ledgerHeader: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    marginBottom: spacing.xs,
  },
  ledgerTitle: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
});
