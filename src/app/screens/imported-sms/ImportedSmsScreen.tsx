import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { format } from 'date-fns';
import { palette, spacing, font, radius } from '../../theme';
import { getDb } from '../../services';

interface LogRow {
  id: string;
  source: string;
  source_ref: string | null;
  outcome: string;
  created_at: number;
  amount_minor: number | null;
  merchant_raw: string | null;
  body: string | null;
}

const OUTCOME_LABEL: Record<string, string> = {
  inserted: 'Imported',
  merged: 'Merged',
  dropped_promo: 'Promo (skipped)',
  dropped_no_parse: 'No parse',
  dropped_dup: 'Duplicate',
  dropped_error: 'Error',
};

const OUTCOME_COLOR: Record<string, string> = {
  inserted: palette.ok,
  merged: palette.accent,
  dropped_promo: palette.muted,
  dropped_no_parse: palette.warn,
  dropped_dup: palette.muted,
  dropped_error: palette.danger,
};

const loadLog = (): LogRow[] => {
  try {
    return getDb().all<LogRow>(
      `SELECT il.id, il.source, il.source_ref, il.outcome, il.created_at,
              e.amount_minor, e.merchant_raw,
              COALESCE(il.body, e.source_msg) AS body
         FROM ingestion_log il
         LEFT JOIN expenses e ON e.id = il.expense_id
        WHERE NOT (il.source = 'sms'
                   AND (il.source_ref LIKE '%-P' OR il.source_ref LIKE '%-G'))
        ORDER BY il.created_at DESC
        LIMIT 500`,
    );
  } catch {
    return [];
  }
};

const formatAmount = (m: number | null): string | null => {
  if (m === null) return null;
  const major = Math.floor(m / 100);
  const minor = String(m % 100).padStart(2, '0');
  return `₹${major.toLocaleString('en-IN')}.${minor}`;
};

export const ImportedSmsScreen: React.FC = () => {
  const [rows, setRows] = React.useState<LogRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [expandedIds, setExpandedIds] = React.useState<ReadonlySet<string>>(new Set());
  const refresh = React.useCallback(() => {
    setLoading(true);
    setRows(loadLog());
    setExpandedIds(new Set());
    setLoading(false);
  }, []);
  React.useEffect(refresh, [refresh]);
  const toggle = React.useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        extraData={expandedIds}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={palette.text} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerText}>
              {rows.length} event{rows.length === 1 ? '' : 's'} processed
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>No SMS imported yet</Text>
            <Text style={styles.emptyBody}>
              Tap the icon on the Expenses tab to run an inbox scan.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const amt = formatAmount(item.amount_minor);
          const expanded = expandedIds.has(item.id);
          return (
            <Pressable
              onPress={item.body ? () => toggle(item.id) : undefined}
              android_ripple={item.body ? { color: palette.border } : undefined}
              style={styles.rowWrap}
            >
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.merchant} numberOfLines={1}>
                    {item.merchant_raw ?? item.source_ref ?? '(unknown)'}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text
                      style={[styles.outcome, { color: OUTCOME_COLOR[item.outcome] ?? palette.muted }]}
                    >
                      {OUTCOME_LABEL[item.outcome] ?? item.outcome}
                    </Text>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.meta}>{format(new Date(item.created_at), 'MMM d, HH:mm')}</Text>
                  </View>
                </View>
                {amt ? <Text style={styles.amount}>{amt}</Text> : null}
                {item.body ? (
                  <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
                ) : null}
              </View>
              {expanded && item.body ? (
                <View style={styles.smsBox}>
                  {item.source_ref ? (
                    <Text style={styles.smsSender}>{item.source_ref}</Text>
                  ) : null}
                  <Text style={styles.smsBody} selectable>
                    {item.body}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  header: { padding: spacing.lg },
  headerText: { color: palette.muted, fontSize: font.sm },
  rowWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  merchant: { color: palette.text, fontSize: font.md, fontWeight: '600', marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  outcome: { fontSize: font.xs, fontWeight: '700' },
  dot: { color: palette.muted, marginHorizontal: 6 },
  meta: { color: palette.muted, fontSize: font.xs },
  amount: { color: palette.danger, fontSize: font.md, fontWeight: '700' },
  chevron: { color: palette.muted, fontSize: font.sm },
  smsBox: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.md,
  },
  smsSender: { color: palette.muted, fontSize: font.xs, fontWeight: '700', marginBottom: spacing.xs },
  smsBody: { color: palette.text, fontSize: font.sm, lineHeight: 20 },
  emptyWrap: { padding: spacing.xl, alignItems: 'center' },
  empty: { color: palette.text, fontSize: font.lg, fontWeight: '700' },
  emptyBody: { color: palette.muted, fontSize: font.sm, marginTop: spacing.sm, textAlign: 'center' },
});
