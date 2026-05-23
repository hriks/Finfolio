import React from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { palette, spacing, font, radius } from '../../theme';
import { useExpensesStore } from '../../stores/expenses';
import { LedgerRow } from '../../components/LedgerRow';
import { Icon } from '../../components/Icon';
import { EmptyState } from '../../components/EmptyState';
import { loadCategoriesMap } from '../../categories';
import { getExpenseService } from '../../services';
import { formatAmount } from '../../components/ExpenseRow';
import { successHaptic, tapHaptic } from '../../haptic';
import type { RootStackParamList } from '../../navigation';
import type { Category } from '../../../types/domain';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const ReviewScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const items = useExpensesStore((s) => s.items);
  const refresh = useExpensesStore((s) => s.refresh);
  const confirmPending = useExpensesStore((s) => s.confirmPending);
  const deleteExp = useExpensesStore((s) => s.delete);
  const [cats, setCats] = React.useState<Record<string, Category>>({});

  React.useEffect(() => {
    refresh();
    setCats(loadCategoriesMap());
  }, [refresh]);

  const pending = items.filter((e) => e.status === 'pending_review');
  const total = pending.reduce((s, e) => s + e.amountMinor, 0);

  const approveAll = () => {
    if (pending.length === 0) return;
    Alert.alert(
      `Approve all ${pending.length}?`,
      'These will move into your expenses list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve all',
          onPress: () => {
            const svc = getExpenseService();
            for (const e of pending) {
              try {
                svc.setStatus(e.id, 'active');
              } catch {
                /* ignore */
              }
            }
            refresh();
          },
        },
      ],
    );
  };

  if (pending.length === 0) {
    return (
      <View style={styles.root}>
        <EmptyState
          title="Nothing to review"
          body="Any auto-imported expense with low confidence will appear here for you to approve or void."
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.headerCard}>
        <Text style={styles.headerLabel}>{pending.length} pending review</Text>
        <Text style={styles.headerAmount}>{formatAmount(total)}</Text>
        <Pressable style={styles.approveAllBtn} onPress={approveAll}>
          <Icon name="check" size={18} color="#ffffff" />
          <Text style={styles.approveAllText}>Approve all</Text>
        </Pressable>
      </View>

      <FlatList
        data={pending}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <View style={styles.rowWrap}>
            <View style={{ flex: 1 }}>
              <LedgerRow
                expense={item}
                category={item.categoryId ? cats[item.categoryId] : null}
                onPress={(id) => nav.navigate('ExpenseDetail', { id })}
              />
            </View>
            <View style={styles.actionsRow}>
              <Pressable
                style={styles.approveBtn}
                onPress={() => {
                  successHaptic();
                  confirmPending(item.id);
                }}
              >
                <Icon name="check" size={18} color="#ffffff" />
              </Pressable>
              <Pressable
                style={styles.voidBtn}
                onPress={() => {
                  tapHaptic();
                  try {
                    deleteExp(item.id);
                  } catch (e) {
                    Alert.alert('Delete failed', String(e));
                  }
                }}
              >
                <Text style={styles.voidText}>✕</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  headerCard: {
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: palette.brand,
    shadowColor: palette.brand,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  headerLabel: {
    color: palette.text,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    opacity: 0.85,
    marginBottom: 4,
  },
  headerAmount: { color: '#ffffff', fontSize: 40, fontWeight: '800', lineHeight: 48 },
  approveAllBtn: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  approveAllText: { color: '#ffffff', fontWeight: '700', fontSize: font.md },
  rowWrap: { flexDirection: 'row', alignItems: 'center', paddingRight: spacing.sm },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  approveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.ok,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voidBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voidText: { color: palette.muted, fontSize: 18, fontWeight: '700' },
});
