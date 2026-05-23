import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { format } from 'date-fns';
import type { Expense, Category } from '../../types/domain';
import { palette, spacing, font, radius } from '../theme';
import { formatAmount } from './ExpenseRow';

interface Props {
  expense: Expense;
  category?: Category | null;
  onPress?: (id: string) => void;
}

const SOURCE_LABEL: Record<string, string> = {
  sms: 'SMS',
  notification: 'Notif',
  manual: 'Manual',
  ocr: 'Scan',
  merged: 'Auto',
};

export const LedgerRow: React.FC<Props> = ({ expense, category, onPress }) => {
  const isVoid = expense.status === 'void';
  const isPending = expense.status === 'pending_review';
  const dim = isVoid ? 0.5 : 1;
  return (
    <Pressable
      onPress={() => onPress?.(expense.id)}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.surfaceAlt }]}
    >
      <View style={[styles.dateCol, { opacity: dim }]}>
        <Text style={styles.dateDay}>{format(new Date(expense.occurredAt), 'd')}</Text>
        <Text style={styles.dateMonth}>{format(new Date(expense.occurredAt), 'MMM')}</Text>
      </View>

      <View style={[styles.bar, { backgroundColor: category?.color ?? palette.surfaceAlt, opacity: dim }]} />

      <View style={styles.middle}>
        <Text
          style={[
            styles.merchant,
            { opacity: dim },
            isVoid && { textDecorationLine: 'line-through' },
          ]}
          numberOfLines={1}
        >
          {expense.subcategory?.trim() || expense.merchantRaw || 'Unknown'}
        </Text>
        <View style={styles.metaRow}>
          <Text style={styles.meta} numberOfLines={1}>
            {expense.subcategory?.trim() && expense.merchantRaw
              ? `${expense.merchantRaw} · ${category?.name ?? 'Uncategorized'}`
              : (category?.name ?? 'Uncategorized')}
          </Text>
          <Text style={styles.dot}> · </Text>
          <Text style={styles.meta}>{SOURCE_LABEL[expense.source] ?? expense.source}</Text>
          {isPending ? (
            <>
              <Text style={styles.dot}> · </Text>
              <Text style={styles.reviewTag}>Review</Text>
            </>
          ) : null}
        </View>
      </View>

      <Text
        style={[
          styles.amount,
          { opacity: dim },
          isVoid && { textDecorationLine: 'line-through' },
        ]}
        numberOfLines={1}
      >
        −{formatAmount(expense.amountMinor, expense.currency)}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: palette.border,
  },
  dateCol: { width: 36, alignItems: 'center' },
  dateDay: { color: palette.text, fontSize: font.lg, fontWeight: '700', lineHeight: 22 },
  dateMonth: {
    color: palette.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bar: { width: 3, alignSelf: 'stretch', borderRadius: radius.sm, marginVertical: 2 },
  middle: { flex: 1, justifyContent: 'center' },
  merchant: { color: palette.text, fontSize: font.md, fontWeight: '600', marginBottom: 1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  meta: { color: palette.muted, fontSize: font.xs },
  dot: { color: palette.muted, fontSize: font.xs },
  reviewTag: { color: palette.warn, fontSize: font.xs, fontWeight: '700' },
  amount: { color: palette.danger, fontSize: font.md, fontWeight: '700' },
});
