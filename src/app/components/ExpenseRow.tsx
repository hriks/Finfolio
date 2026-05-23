import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { format } from 'date-fns';
import type { Expense, Category } from '../../types/domain';
import { palette, spacing, font, radius } from '../theme';

export const formatAmount = (amountMinor: number, currency = 'INR'): string => {
  const sign = amountMinor < 0 ? '-' : '';
  const abs = Math.abs(amountMinor);
  const major = Math.floor(abs / 100);
  const minor = String(abs % 100).padStart(2, '0');
  const symbol = currency === 'INR' ? '₹' : currency + ' ';
  return `${sign}${symbol}${major.toLocaleString('en-IN')}.${minor}`;
};

const initials = (name: string | null | undefined): string => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

interface Props {
  expense: Expense;
  category?: Category | null;
  onPress?: (id: string) => void;
}

export const ExpenseRow: React.FC<Props> = ({ expense, category, onPress }) => {
  const isVoid = expense.status === 'void';
  const isPending = expense.status === 'pending_review';
  const dim = isVoid ? { opacity: 0.45 } : null;
  const strike = isVoid ? { textDecorationLine: 'line-through' as const } : null;

  const avatarColor = category?.color ?? palette.brandSoft;
  const sourceLabel =
    expense.source === 'manual' ? 'Manual'
    : expense.source === 'sms' ? 'SMS'
    : expense.source === 'notification' ? 'Notification'
    : expense.source === 'ocr' ? 'OCR'
    : expense.source === 'merged' ? 'SMS + Notif'
    : 'Auto';

  return (
    <Pressable
      onPress={() => onPress?.(expense.id)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.avatar, { backgroundColor: avatarColor }, dim]}>
        <Text style={styles.avatarText}>{initials(expense.merchantRaw ?? category?.name)}</Text>
      </View>

      <View style={styles.middle}>
        <Text style={[styles.merchant, strike, dim]} numberOfLines={1}>
          {expense.subcategory?.trim() || expense.merchantRaw || 'Unknown'}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.metaText, dim]} numberOfLines={1}>
            {expense.subcategory?.trim() && expense.merchantRaw
              ? `${expense.merchantRaw} · ${category?.name ?? 'Uncategorized'}`
              : (category?.name ?? 'Uncategorized')}
          </Text>
          <Text style={styles.dot}>·</Text>
          <Text style={[styles.metaText, dim]}>{sourceLabel}</Text>
        </View>
      </View>

      <View style={styles.right}>
        <Text style={[styles.amount, strike, dim]} numberOfLines={1}>
          −{formatAmount(expense.amountMinor, expense.currency)}
        </Text>
        <Text style={[styles.date, dim]}>{format(new Date(expense.occurredAt), 'MMM d')}</Text>
        {isPending ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingText}>Review</Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  rowPressed: { backgroundColor: palette.surfaceAlt },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#ffffff', fontWeight: '700', fontSize: font.md },
  middle: { flex: 1, justifyContent: 'center' },
  merchant: { color: palette.text, fontSize: font.md, fontWeight: '600', marginBottom: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  metaText: { color: palette.muted, fontSize: font.xs },
  dot: { color: palette.muted, marginHorizontal: 4 },
  right: { alignItems: 'flex-end' },
  amount: { color: palette.danger, fontSize: font.md, fontWeight: '700' },
  date: { color: palette.muted, fontSize: font.xs, marginTop: 2 },
  pendingBadge: {
    backgroundColor: palette.warn,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    marginTop: 4,
  },
  pendingText: { color: '#0f172a', fontSize: 10, fontWeight: '700' },
});
