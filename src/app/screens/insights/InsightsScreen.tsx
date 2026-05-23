import React from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PieChart, BarChart } from 'react-native-gifted-charts';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_INNER_WIDTH = SCREEN_WIDTH - 32 /* outer margins */ - 32 /* card padding */;
import {
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  isSameDay,
  endOfDay,
} from 'date-fns';

import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, spacing, font, radius } from '../../theme';
import { useExpensesStore } from '../../stores/expenses';
import { loadCategoriesMap } from '../../categories';
import { formatAmount } from '../../components/ExpenseRow';
import { LedgerRow } from '../../components/LedgerRow';
import { tapHaptic } from '../../haptic';
import type { Category, Expense } from '../../../types/domain';
import type { RootStackParamList } from '../../navigation';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Period = 'today' | 'yesterday' | 'week' | 'month' | 'year' | 'all';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class InsightsBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };
  static getDerivedStateFromError(e: unknown): ErrorBoundaryState {
    return { hasError: true, message: String(e) };
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, padding: spacing.lg, backgroundColor: palette.bg }}>
          <Text style={{ color: palette.text, fontSize: font.md, marginBottom: spacing.sm }}>
            Charts couldn&apos;t render.
          </Text>
          <Text style={{ color: palette.muted, fontSize: font.sm }}>{this.state.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const periodWindow = (p: Period, now: Date): { start: number; end: number; label: string } => {
  switch (p) {
    case 'today': {
      const s = startOfDay(now).getTime();
      const e = endOfDay(now).getTime();
      return { start: s, end: e, label: `Today, ${format(now, 'MMM d')}` };
    }
    case 'yesterday': {
      const y = subDays(now, 1);
      const s = startOfDay(y).getTime();
      const e = endOfDay(y).getTime();
      return { start: s, end: e, label: `Yesterday, ${format(y, 'MMM d')}` };
    }
    case 'week': {
      const start = startOfDay(subDays(now, 6)).getTime();
      return { start, end: endOfDay(now).getTime(), label: 'Last 7 days' };
    }
    case 'month': {
      const start = startOfMonth(now).getTime();
      return { start, end: endOfDay(now).getTime(), label: format(now, 'MMMM yyyy') };
    }
    case 'year': {
      const start = startOfYear(now).getTime();
      return { start, end: endOfDay(now).getTime(), label: format(now, 'yyyy') };
    }
    case 'all':
    default:
      return { start: 0, end: endOfDay(now).getTime(), label: 'All time' };
  }
};

const PeriodPill: React.FC<{ label: string; active: boolean; onPress: () => void }> = ({
  label,
  active,
  onPress,
}) => (
  <Pressable
    onPress={() => {
      tapHaptic();
      onPress();
    }}
    style={[styles.pill, active ? styles.pillActive : null]}
  >
    <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
  </Pressable>
);

const InsightsInner: React.FC = () => {
  const nav = useNavigation<Nav>();
  const items = useExpensesStore((s) => s.items);
  const refresh = useExpensesStore((s) => s.refresh);
  const [cats, setCats] = React.useState<Record<string, Category>>({});
  const [period, setPeriod] = React.useState<Period>('month');

  React.useEffect(() => {
    refresh();
    setCats(loadCategoriesMap());
  }, [refresh]);

  const now = new Date();
  const win = periodWindow(period, now);

  const inWindow = (e: Expense): boolean =>
    e.status === 'active' && e.occurredAt >= win.start && e.occurredAt <= win.end;

  const periodExpenses = items.filter(inWindow).sort((a, b) => b.occurredAt - a.occurredAt);
  const periodTotal = periodExpenses.reduce((s, e) => s + e.amountMinor, 0);

  // Pie data
  const byCat = new Map<string, number>();
  for (const e of periodExpenses) {
    const k = e.categoryId ?? 'uncategorized';
    byCat.set(k, (byCat.get(k) ?? 0) + e.amountMinor);
  }
  const pieData = Array.from(byCat.entries())
    .map(([catId, v]) => ({
      value: v,
      color: cats[catId]?.color ?? palette.muted,
      text: cats[catId]?.name ?? 'Other',
    }))
    .sort((a, b) => b.value - a.value);

  // Bar: bucket by day for week/month, by month for year, by year for all-time (best effort).
  // `fullLabel` carries the human-readable date for the focused-bar tooltip.
  type Bucket = { value: number; label: string; fullLabel: string };
  const barData: Bucket[] = (() => {
    if (period === 'week' || period === 'month') {
      const days = period === 'week' ? 7 : 30;
      const out: Bucket[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const day = startOfDay(subDays(now, i));
        const s = day.getTime();
        const e = endOfDay(day).getTime();
        const sum = items
          .filter((x) => x.status === 'active' && x.occurredAt >= s && x.occurredAt <= e)
          .reduce((a, x) => a + x.amountMinor, 0);
        out.push({
          value: sum / 100,
          label: i % Math.max(1, Math.floor(days / 6)) === 0 ? format(day, 'd') : '',
          fullLabel: format(day, 'EEE, MMM d'),
        });
      }
      return out;
    }
    if (period === 'year') {
      const out: Bucket[] = [];
      for (let i = 11; i >= 0; i--) {
        const ms = startOfMonth(subMonths(now, i));
        const s = ms.getTime();
        const e = startOfMonth(subMonths(now, i - 1)).getTime();
        const sum = items
          .filter((x) => x.status === 'active' && x.occurredAt >= s && x.occurredAt < e)
          .reduce((a, x) => a + x.amountMinor, 0);
        out.push({ value: sum / 100, label: format(ms, 'MMM'), fullLabel: format(ms, 'MMM yyyy') });
      }
      return out;
    }
    // all-time: 12 month buckets
    const out: Bucket[] = [];
    for (let i = 11; i >= 0; i--) {
      const ms = startOfMonth(subMonths(now, i));
      const s = ms.getTime();
      const e = startOfMonth(subMonths(now, i - 1)).getTime();
      const sum = items
        .filter((x) => x.status === 'active' && x.occurredAt >= s && x.occurredAt < e)
        .reduce((a, x) => a + x.amountMinor, 0);
      out.push({ value: sum / 100, label: format(ms, 'MMM'), fullLabel: format(ms, 'MMM yyyy') });
    }
    return out;
  })();

  // Tap-to-focus state for both charts.
  const [pieFocusedIdx, setPieFocusedIdx] = React.useState<number | null>(null);
  const [barFocusedIdx, setBarFocusedIdx] = React.useState<number | null>(null);
  React.useEffect(() => {
    setPieFocusedIdx(null);
    setBarFocusedIdx(null);
  }, [period]);
  const focusedPie = pieFocusedIdx != null ? pieData[pieFocusedIdx] : null;
  const focusedBar = barFocusedIdx != null ? barData[barFocusedIdx] : null;
  const [tooltipWidth, setTooltipWidth] = React.useState(120);

  // Bar chart sizing — gifted-charts BarChart needs explicit widths to fill the card.
  const barCount = barData.length;
  const barChartWidth = CARD_INNER_WIDTH - 48; // leave room for y-axis labels
  const barWidth = Math.max(4, Math.floor(barChartWidth / barCount - 4));
  const barSpacing = Math.max(2, Math.floor(barChartWidth / barCount - barWidth));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bg }} edges={['top']}>
    <ScrollView style={styles.root} contentContainerStyle={{ paddingBottom: 120 }}>
      <View style={styles.header}>
        <Text style={styles.heroLabel}>{win.label}</Text>
        <Text style={styles.heroAmount}>{formatAmount(periodTotal)}</Text>
        <Text style={styles.heroSub}>
          {periodExpenses.length} transaction{periodExpenses.length === 1 ? '' : 's'}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
      >
        <PeriodPill label="Today" active={period === 'today'} onPress={() => setPeriod('today')} />
        <PeriodPill label="Yesterday" active={period === 'yesterday'} onPress={() => setPeriod('yesterday')} />
        <PeriodPill label="7d" active={period === 'week'} onPress={() => setPeriod('week')} />
        <PeriodPill label="Month" active={period === 'month'} onPress={() => setPeriod('month')} />
        <PeriodPill label="Year" active={period === 'year'} onPress={() => setPeriod('year')} />
        <PeriodPill label="All" active={period === 'all'} onPress={() => setPeriod('all')} />
      </ScrollView>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>By category</Text>
        <View style={[styles.card, { padding: spacing.lg }]}>
          {pieData.length === 0 ? (
            <Text style={styles.muted}>No expenses in this period</Text>
          ) : (
            <View style={styles.pieRow}>
              <PieChart
                data={pieData.map((d, i) => ({
                  ...d,
                  onPress: () => setPieFocusedIdx((cur) => (cur === i ? null : i)),
                }))}
                donut
                focusOnPress
                radius={92}
                innerRadius={56}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center', paddingHorizontal: 4 }}>
                    {focusedPie ? (
                      <>
                        <Text style={styles.centerCategory} numberOfLines={1}>
                          {focusedPie.text}
                        </Text>
                        <Text style={styles.centerAmount}>{formatAmount(focusedPie.value)}</Text>
                        <Text style={styles.centerPct}>
                          {((focusedPie.value / periodTotal) * 100).toFixed(0)}%
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.centerAmount}>
                        {formatAmount(pieData.reduce((s, d) => s + d.value, 0))}
                      </Text>
                    )}
                  </View>
                )}
              />
              <View style={styles.legend}>
                {pieData.slice(0, 8).map((d, idx) => {
                  const pct = ((d.value / periodTotal) * 100).toFixed(0);
                  return (
                    <View key={idx} style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: d.color }]} />
                      <View style={styles.legendTextWrap}>
                        <Text style={styles.legendText} numberOfLines={1}>
                          {d.text}
                        </Text>
                        <Text style={styles.legendSub}>{formatAmount(d.value)}</Text>
                      </View>
                      <Text style={styles.legendPct}>{pct}%</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Spend over time</Text>
        <View style={styles.card}>
          {barData.some((d) => d.value > 0) ? (
            <View style={styles.barChartWrap}>
              <BarChart
                data={barData.map((d, i) => ({
                  ...d,
                  frontColor: i === barFocusedIdx ? palette.lavender : palette.accent,
                  onPress: () => setBarFocusedIdx((cur) => (cur === i ? null : i)),
                }))}
                width={barChartWidth}
                barWidth={barWidth}
                spacing={barSpacing}
                frontColor={palette.accent}
                yAxisColor={palette.border}
                xAxisColor={palette.border}
                yAxisTextStyle={{ color: palette.muted, fontSize: 10 }}
                xAxisLabelTextStyle={{ color: palette.muted, fontSize: 10 }}
                hideRules
                initialSpacing={4}
                endSpacing={0}
              />
              {focusedBar ? (
                (() => {
                  // gifted-charts y-axis label area is ~35px wide; data area follows.
                  const Y_AXIS_W = 35;
                  const dataAreaW = barChartWidth - Y_AXIS_W;
                  const barCenter =
                    Y_AXIS_W + 4 + barFocusedIdx! * (barWidth + barSpacing) + barWidth / 2;
                  // Clamp tooltip horizontally so it stays inside the data area.
                  let left = barCenter - tooltipWidth / 2;
                  const maxLeft = Y_AXIS_W + dataAreaW - tooltipWidth;
                  if (left < Y_AXIS_W) left = Y_AXIS_W;
                  if (left > maxLeft) left = maxLeft;
                  return (
                    <View
                      style={[styles.tooltipCard, styles.tooltipOverlay, { left }]}
                      onLayout={(e) => setTooltipWidth(e.nativeEvent.layout.width)}
                      pointerEvents="none"
                    >
                      <Text style={styles.tooltipLabel}>{focusedBar.fullLabel}</Text>
                      <Text style={styles.tooltipAmount}>
                        {formatAmount(Math.round(focusedBar.value * 100))}
                      </Text>
                    </View>
                  );
                })()
              ) : null}
            </View>
          ) : (
            <Text style={styles.muted}>No data in this period</Text>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transactions</Text>
        <View style={[styles.card, { padding: 0 }]}>
          {periodExpenses.length === 0 ? (
            <Text style={[styles.muted, { padding: spacing.md }]}>No transactions</Text>
          ) : (
            periodExpenses.slice(0, 50).map((e) => (
              <LedgerRow
                key={e.id}
                expense={e}
                category={e.categoryId ? cats[e.categoryId] : null}
                onPress={(id) => nav.navigate('ExpenseDetail', { id })}
              />
            ))
          )}
          {periodExpenses.length > 50 ? (
            <Text style={[styles.muted, { textAlign: 'center', padding: spacing.md }]}>
              Showing 50 of {periodExpenses.length} · open Expenses tab for the rest
            </Text>
          ) : null}
        </View>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
};

export const InsightsScreen: React.FC = () => (
  <InsightsBoundary>
    <InsightsInner />
  </InsightsBoundary>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  heroLabel: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  heroAmount: { color: palette.text, fontSize: 40, fontWeight: '800', lineHeight: 48 },
  heroSub: { color: palette.muted, fontSize: font.sm, marginTop: 2 },
  pillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  pill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.glassHi,
  },
  pillActive: { backgroundColor: palette.brand, borderColor: palette.brand },
  pillText: { color: palette.textDim, fontSize: font.sm, fontWeight: '700' },
  pillTextActive: { color: '#ffffff' },
  section: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  sectionTitle: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: palette.surfaceStrong,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: palette.glassHi,
    overflow: 'visible',
  },
  pieRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, width: '100%' },
  legend: { flex: 1, gap: spacing.sm },
  legendTextWrap: { flex: 1 },
  legendPct: { color: palette.text, fontSize: font.sm, fontWeight: '800' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { color: palette.text, fontSize: font.sm, fontWeight: '600' },
  legendSub: { color: palette.muted, fontSize: font.xs, marginTop: 1 },
  muted: { color: palette.muted, fontSize: font.sm },
  centerAmount: { color: palette.text, fontSize: font.sm, fontWeight: '800' },
  centerCategory: {
    color: palette.lavender,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 2,
  },
  centerPct: { color: palette.muted, fontSize: 10, marginTop: 2 },
  barChartWrap: { position: 'relative' },
  tooltipOverlay: { position: 'absolute', top: -4 },
  tooltipCard: {
    backgroundColor: palette.brand,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassHi,
    minWidth: 100,
    alignItems: 'center',
    shadowColor: palette.brandGlow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 12,
  },
  tooltipLabel: {
    color: palette.lavender,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  tooltipAmount: { color: '#ffffff', fontSize: font.md, fontWeight: '700', marginTop: 1 },
});
