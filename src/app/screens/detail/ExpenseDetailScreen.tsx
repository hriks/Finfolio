import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute, type RouteProp, CommonActions } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { palette, spacing, font, radius } from '../../theme';
import { Icon } from '../../components/Icon';
import { useExpensesStore } from '../../stores/expenses';
import { getExpenseService, getDb } from '../../services';
import { loadCategoriesMap } from '../../categories';
import { CategoryPicker } from '../../components/CategoryPicker';
import { successHaptic, tapHaptic, warnHaptic } from '../../haptic';
import { AmountInput } from '../../components/AmountInput';
import { formatAmount } from '../../components/ExpenseRow';
import { reverseGeocode, looksLikeCoordsString } from '../../../services/geocode';
import type { RootStackParamList } from '../../navigation';
import type { Expense, Category } from '../../../types/domain';

type Nav = NativeStackNavigationProp<RootStackParamList, 'ExpenseDetail'>;
type Route = RouteProp<RootStackParamList, 'ExpenseDetail'>;

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;

export const ExpenseDetailScreen: React.FC = () => {
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { id } = route.params;
  const updateStore = useExpensesStore((s) => s.update);
  const voidExp = useExpensesStore((s) => s.void);
  const deleteExp = useExpensesStore((s) => s.delete);
  const confirmPending = useExpensesStore((s) => s.confirmPending);
  const items = useExpensesStore((s) => s.items);
  const refresh = useExpensesStore((s) => s.refresh);

  const [expense, setExpense] = React.useState<Expense | null>(null);
  const [cats, setCats] = React.useState<Record<string, Category>>({});
  const [showCatPicker, setShowCatPicker] = React.useState(false);
  const [canDelete, setCanDelete] = React.useState(false);
  const [editMerchant, setEditMerchant] = React.useState('');
  const [editNote, setEditNote] = React.useState('');
  const [editAmount, setEditAmount] = React.useState(0);
  const [editSubcategory, setEditSubcategory] = React.useState('');
  const [showRaw, setShowRaw] = React.useState(false);

  const reload = React.useCallback(() => {
    try {
      const svc = getExpenseService();
      const e = svc.get(id) ?? null;
      setExpense(e);
      setCanDelete(svc.canDelete(id));
      if (e) {
        setEditMerchant(e.merchantRaw ?? '');
        setEditNote(e.note ?? '');
        setEditAmount(e.amountMinor);
        setEditSubcategory(e.subcategory ?? '');
      }
    } catch {
      setExpense(null);
    }
  }, [id]);

  React.useEffect(() => {
    reload();
    setCats(loadCategoriesMap());
  }, [reload, items]);

  // Best-effort: if this expense's locationName is missing OR just raw coords,
  // resolve it via Nominatim once and persist the human-readable name back.
  React.useEffect(() => {
    if (!expense) return;
    const { locationLat: lat, locationLon: lon, locationName } = expense;
    if (lat == null || lon == null) return;
    if (locationName && !looksLikeCoordsString(locationName)) return;
    let cancelled = false;
    reverseGeocode(lat, lon)
      .then((name) => {
        if (cancelled || !name) return;
        updateStore(id, { locationName: name });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [expense, id, updateStore]);

  const dirty =
    !!expense &&
    ((editNote || '') !== (expense.note ?? '') ||
      (editSubcategory || '') !== (expense.subcategory ?? ''));

  const onSave = React.useCallback(() => {
    if (!expense) return;
    try {
      updateStore(id, {
        note: editNote.trim() || null,
        subcategory: editSubcategory.trim() || null,
      });
      successHaptic();
      reload();
    } catch (e) {
      Alert.alert('Save failed', String(e));
    }
  }, [expense, id, editNote, editSubcategory, updateStore, reload]);

  // Title + subtitle for the custom in-screen header.
  const headerTitleText = expense?.subcategory?.trim() ?? expense?.merchantRaw ?? 'Expense';
  const headerSubtitle = expense?.subcategory?.trim() ? (expense?.merchantRaw ?? null) : null;
  const showSaveButton = dirty && expense?.status !== 'pending_review';

  // Sibling navigation — when reviewing a pending transaction, swipe through
  // pending-only; when viewing an approved one, swipe through approved-only.
  // Computed unconditionally so hook order stays stable across the early return.
  const currentStatus = expense?.status;
  const siblings = React.useMemo(() => {
    const pool = items.filter((e) =>
      currentStatus === 'pending_review' ? e.status === 'pending_review' : e.status === 'active',
    );
    return pool.sort((a, b) => b.occurredAt - a.occurredAt);
  }, [items, currentStatus]);
  const curIdx = siblings.findIndex((e) => e.id === id);
  const prevId = curIdx > 0 ? siblings[curIdx - 1].id : null;
  const nextId = curIdx >= 0 && curIdx < siblings.length - 1 ? siblings[curIdx + 1].id : null;

  const SCREEN_W = Dimensions.get('window').width;
  const SWIPE_THRESHOLD = SCREEN_W * 0.06;
  const translateX = React.useRef(new Animated.Value(0)).current;
  const navRef = React.useRef({ nav, prevId, nextId, translateX, SCREEN_W });
  navRef.current = { nav, prevId, nextId, translateX, SCREEN_W };

  const pan = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2,
      onPanResponderMove: (_e, g) => {
        // Dampen if there's no neighbor in that direction (rubber-band feel).
        const { prevId: p, nextId: nx, translateX: tx } = navRef.current;
        const blocked = (g.dx > 0 && !p) || (g.dx < 0 && !nx);
        tx.setValue(blocked ? g.dx * 0.25 : g.dx);
      },
      onPanResponderRelease: (_e, g) => {
        const { nav: n, prevId: p, nextId: nx, translateX: tx, SCREEN_W: w } = navRef.current;
        const goNext = g.dx <= -SWIPE_THRESHOLD && !!nx;
        const goPrev = g.dx >= SWIPE_THRESHOLD && !!p;
        if (goNext || goPrev) {
          Animated.timing(tx, {
            toValue: goNext ? -w : w,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            // Snap to the opposite edge FIRST so the new content paints there.
            tx.setValue(goNext ? w : -w);
            // Defer the navigation + slide-in by one frame so the native
            // driver commits the off-screen position before React renders
            // the new content (otherwise we get a one-frame flash at 0).
            requestAnimationFrame(() => {
              n.dispatch(CommonActions.setParams({ id: goNext ? nx! : p! }));
              Animated.spring(tx, {
                toValue: 0,
                useNativeDriver: true,
                speed: 18,
                bounciness: 6,
              }).start();
            });
          });
        } else {
          Animated.spring(tx, {
            toValue: 0,
            useNativeDriver: true,
            speed: 20,
            bounciness: 8,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(navRef.current.translateX, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  if (!expense) {
    return (
      <View style={styles.root}>
        <Text style={styles.muted}>Expense not found</Text>
      </View>
    );
  }

  const cat = expense.categoryId ? cats[expense.categoryId] : null;

  const saveField = (patch: Parameters<ReturnType<typeof getExpenseService>['update']>[1]) => {
    try {
      updateStore(id, patch);
      reload();
    } catch (e) {
      Alert.alert('Save failed', String(e));
    }
  };

  const onPickCategory = (newCat: Category) => {
    if (newCat.id === expense.categoryId) return;
    // Find other recent entries with the same merchantNorm
    const cutoff = Date.now() - NINETY_DAYS;
    const sameMerchant = expense.merchantNorm
      ? items.filter(
          (e) =>
            e.id !== expense.id &&
            e.merchantNorm === expense.merchantNorm &&
            e.occurredAt >= cutoff &&
            e.categoryId !== newCat.id,
        )
      : [];

    const apply = (bulk: boolean) => {
      try {
        if (bulk && sameMerchant.length > 0) {
          updateStore(id, { categoryId: newCat.id });
          for (const e of sameMerchant) {
            getExpenseService().update(e.id, { categoryId: newCat.id });
          }
          refresh();
        } else {
          updateStore(id, { categoryId: newCat.id });
        }
        // Save a user merchant_rule so future SMS for this merchant auto-categorize
        // (this is the "learn from edits" loop). Only when merchantNorm exists.
        if (expense.merchantNorm) {
          try {
            const ruleId = `usrrule-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
            getDb().run(
              `INSERT INTO merchant_rules (id, merchant_norm, category_id, origin, weight, created_at)
               VALUES (?, ?, ?, 'user', 10, ?)
               ON CONFLICT(merchant_norm, origin) DO UPDATE SET category_id = excluded.category_id, weight = 10`,
              [ruleId, expense.merchantNorm, newCat.id, Date.now()],
            );
          } catch {
            /* ignore — best-effort */
          }
        }
        reload();
      } catch (e) {
        Alert.alert('Failed', String(e));
      }
    };

    if (sameMerchant.length > 0) {
      Alert.alert(
        'Apply to similar?',
        `Apply ${newCat.name} to ${sameMerchant.length} other entr${sameMerchant.length === 1 ? 'y' : 'ies'} for "${expense.merchantRaw ?? expense.merchantNorm}" in the last 90 days?`,
        [
          { text: 'Only this one', onPress: () => apply(false) },
          { text: 'Apply to all', onPress: () => apply(true) },
        ],
      );
    } else {
      apply(false);
    }
  };

  const onDelete = () => {
    Alert.alert('Delete expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            deleteExp(id);
            nav.goBack();
          } catch (e) {
            Alert.alert('Delete failed', String(e));
          }
        },
      },
    ]);
  };

  const isVoid = expense.status === 'void';
  const isPending = expense.status === 'pending_review';

  return (
    <Animated.View style={[styles.root, { transform: [{ translateX }] }]} {...pan.panHandlers}>
      {prevId ? <View style={[styles.edgeHint, styles.edgeHintLeft]} /> : null}
      {nextId ? <View style={[styles.edgeHint, styles.edgeHintRight]} /> : null}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.customHeader}>
          <Pressable onPress={() => nav.goBack()} hitSlop={12} style={styles.headerBack}>
            <Icon name="back" size={24} color={palette.text} />
          </Pressable>
          <View style={styles.headerTitleBox}>
            <Text style={styles.headerTitleText} numberOfLines={1}>
              {headerTitleText}
            </Text>
            {headerSubtitle ? (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {headerSubtitle}
              </Text>
            ) : null}
          </View>
          {showSaveButton ? (
            <Pressable onPress={onSave} hitSlop={10} style={styles.headerSave}>
              <Text style={styles.headerSaveText}>Save</Text>
            </Pressable>
          ) : (
            <View style={styles.headerSave} />
          )}
        </View>
      </SafeAreaView>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <Section title="Title">
          <TextInput
            style={styles.input}
            value={editSubcategory}
            onChangeText={setEditSubcategory}
            onBlur={() => saveField({ subcategory: editSubcategory.trim() || null })}
            placeholder="Optional (e.g. Lunch, Petrol)"
            placeholderTextColor={palette.muted}
          />
        </Section>

        <Section title="Category">
          <Pressable style={styles.pickerRow} onPress={() => setShowCatPicker(true)}>
            {cat ? (
              <>
                <View style={[styles.dot, { backgroundColor: cat.color ?? palette.surfaceAlt }]} />
                <Text style={styles.value}>{cat.name}</Text>
              </>
            ) : (
              <Text style={styles.muted}>Uncategorized — tap to set</Text>
            )}
          </Pressable>
        </Section>

        <Section title="Date">
          <Text style={styles.value}>{format(new Date(expense.occurredAt), 'PPpp')}</Text>
        </Section>

        <Section title="Note">
          <TextInput
            style={[styles.input, { minHeight: 60 }]}
            value={editNote}
            onChangeText={setEditNote}
            onBlur={() => saveField({ note: editNote || null })}
            multiline
            placeholder="Add a note"
            placeholderTextColor={palette.muted}
          />
        </Section>

        {expense.photoPath ? (
          <Section title="Photo">
            <Text style={styles.muted}>{expense.photoPath}</Text>
          </Section>
        ) : null}

        {expense.locationName || expense.locationLat ? (
          <Section title="Location">
            <Text style={styles.value}>
              📍{' '}
              {expense.locationName && !looksLikeCoordsString(expense.locationName)
                ? expense.locationName
                : expense.locationLat != null && expense.locationLon != null
                  ? `${expense.locationLat.toFixed(5)}, ${expense.locationLon.toFixed(5)}`
                  : (expense.locationName ?? '')}
            </Text>
          </Section>
        ) : null}

        <Section title="Audit">
          <Text style={styles.muted}>
            Created {format(new Date(expense.createdAt), 'PPpp')} · confidence{' '}
            {expense.confidence.toFixed(2)}
          </Text>
          <Text style={styles.muted}>
            Stored: {formatAmount(expense.amountMinor, expense.currency)}
          </Text>
          {expense.sourceMsg ? (
            <Pressable onPress={() => setShowRaw((s) => !s)} style={{ marginTop: spacing.sm }}>
              <Text style={styles.linkText}>{showRaw ? 'Hide' : 'Show'} raw source</Text>
            </Pressable>
          ) : null}
          {showRaw && expense.sourceMsg ? (
            <View style={styles.rawBox}>
              <Text style={styles.rawText}>{expense.sourceMsg}</Text>
            </View>
          ) : null}
        </Section>

        <View style={styles.summaryBox}>
          <Text style={styles.summaryLabel}>
            {isPending ? "You're approving" : isVoid ? 'Voided' : 'Amount'}
          </Text>
          <Text style={styles.summaryAmount}>
            {formatAmount(expense.amountMinor, expense.currency)}
          </Text>
          <Text style={styles.summaryMerchant} numberOfLines={1}>
            {expense.merchantRaw ?? 'Unknown merchant'}
          </Text>
          <Text style={styles.summaryMeta}>
            {cat?.name ?? 'Uncategorized'} · {format(new Date(expense.occurredAt), 'MMM d, yyyy')}
          </Text>
          <View style={styles.summaryBadgeRow}>
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>{expense.source.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actions}>
          {dirty && !isPending ? (
            <Pressable
              style={[
                styles.actionBtn,
                { backgroundColor: palette.brand, marginBottom: spacing.sm },
              ]}
              onPress={onSave}
            >
              <Text style={styles.actionText}>Save changes</Text>
            </Pressable>
          ) : null}
          {isPending ? (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: palette.ok, marginBottom: spacing.sm }]}
              onPress={() => {
                successHaptic();
                // Pick the next pending BEFORE confirming, since after confirm
                // the current expense is no longer in the pending pool.
                const nextPending =
                  siblings.find((e) => e.id !== id) ??
                  items.find((e) => e.status === 'pending_review' && e.id !== id) ??
                  null;
                if (dirty) {
                  try {
                    updateStore(id, {
                      note: editNote.trim() || null,
                      subcategory: editSubcategory.trim() || null,
                    });
                  } catch (e) {
                    Alert.alert('Save failed', String(e));
                    return;
                  }
                }
                confirmPending(id);
                if (nextPending) {
                  nav.dispatch(CommonActions.setParams({ id: nextPending.id }));
                } else {
                  nav.goBack();
                }
              }}
            >
              <Text style={styles.actionText}>{dirty ? 'Save & Approve' : 'Approve'}</Text>
            </Pressable>
          ) : null}
          {isPending ? (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: palette.danger }]}
              onPress={() => {
                // Auto-advance to next pending after delete, like Approve.
                const nextPending =
                  siblings.find((e) => e.id !== id) ??
                  items.find((e) => e.status === 'pending_review' && e.id !== id) ??
                  null;
                try {
                  warnHaptic();
                  deleteExp(id);
                  if (nextPending) {
                    nav.dispatch(CommonActions.setParams({ id: nextPending.id }));
                  } else {
                    nav.goBack();
                  }
                } catch (e) {
                  Alert.alert('Delete failed', String(e));
                }
              }}
            >
              <Text style={styles.actionText}>Delete</Text>
            </Pressable>
          ) : isVoid ? null : (
            <Pressable
              style={[styles.actionBtn, { backgroundColor: palette.warn }]}
              onPress={() => {
                Alert.alert(
                  'Void this expense?',
                  'Voiding excludes it from your totals. This cannot be undone.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Void',
                      style: 'destructive',
                      onPress: () => {
                        warnHaptic();
                        voidExp(id);
                        reload();
                      },
                    },
                  ],
                );
              }}
            >
              <Text style={styles.actionText}>Void</Text>
            </Pressable>
          )}
        </View>

        <CategoryPicker
          visible={showCatPicker}
          onClose={() => setShowCatPicker(false)}
          onSelect={onPickCategory}
          selectedId={expense.categoryId}
        />
      </ScrollView>
    </Animated.View>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    {children}
  </View>
);

const Badge: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <View style={[styles.badge, { backgroundColor: color }]}>
    <Text style={styles.badgeText}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  headerSafe: { backgroundColor: palette.bg },
  customHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  headerBack: { padding: spacing.xs },
  headerTitleBox: { flex: 1 },
  headerTitleText: { color: palette.text, fontSize: font.lg, fontWeight: '700' },
  headerSubtitle: { color: palette.muted, fontSize: font.xs, marginTop: 1 },
  headerSave: { minWidth: 56, alignItems: 'flex-end' },
  headerSaveText: { color: palette.link, fontSize: font.md, fontWeight: '700' },
  header: { padding: spacing.lg, gap: spacing.sm },
  statusRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgeText: { color: '#fff', fontSize: font.xs, fontWeight: '600' },
  saveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: palette.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
  },
  saveBtnText: { color: palette.link, fontSize: font.sm },
  section: { paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sectionTitle: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  value: { color: palette.text, fontSize: font.md },
  muted: { color: palette.muted, fontSize: font.sm },
  linkText: { color: palette.link },
  input: {
    backgroundColor: palette.surface,
    color: palette.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    fontSize: font.md,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: palette.surface,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  dot: { width: 14, height: 14, borderRadius: 7 },
  rawBox: {
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: palette.surface,
    borderRadius: radius.sm,
  },
  rawText: { color: palette.muted, fontSize: font.xs, fontFamily: 'monospace' },
  summaryBox: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: palette.surfaceStrong,
    borderWidth: 1,
    borderColor: palette.glassHi,
    alignItems: 'center',
  },
  summaryLabel: {
    color: palette.muted,
    fontSize: font.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  summaryAmount: {
    color: palette.danger,
    fontSize: 44,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 52,
  },
  summaryMerchant: {
    color: palette.text,
    fontSize: font.lg,
    fontWeight: '700',
    marginTop: 4,
    maxWidth: '100%',
  },
  summaryMeta: { color: palette.muted, fontSize: font.sm, marginTop: 2 },
  summaryBadgeRow: { flexDirection: 'row', marginTop: spacing.sm, gap: spacing.xs },
  sourceBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: palette.surfaceAlt,
    borderWidth: 1,
    borderColor: palette.glassHi,
  },
  sourceBadgeText: { color: palette.text, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  actions: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  actionBtn: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  actionText: { color: '#fff', fontSize: font.md, fontWeight: '700' },
  // Faint vertical bars at the edges hint that there's content to swipe to.
  edgeHint: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: palette.glassHi,
    opacity: 0.5,
    zIndex: 1,
  },
  edgeHintLeft: { left: 0 },
  edgeHintRight: { right: 0 },
});
