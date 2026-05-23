# Expense Manager — Plan 6: UI Shell + Onboarding

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Build a navigable, functional UI shell on top of all services from Plans 1–5. Bottom tabs (Home / Expenses / + / Insights / Settings), a detail screen, an onboarding wizard, and permission banners. Visual polish is intentionally minimal — this plan delivers structure and wiring; iteration happens on-device.

**Architecture:**
- `@react-navigation/native` + `@react-navigation/bottom-tabs` + `@react-navigation/native-stack`.
- Zustand stores per service surface (`useExpensesStore`, `useBudgetsStore`, `useSettingsStore`).
- Query layer: services are called directly via the stores; lists refresh on focus.
- Charts: `react-native-gifted-charts`.

---

## Dependencies

```bash
npm install @react-navigation/native @react-navigation/bottom-tabs @react-navigation/native-stack \
  react-native-screens react-native-safe-area-context react-native-gifted-charts zustand \
  react-native-svg react-native-vector-icons react-native-image-picker
```

(Vector icons + image picker for FAB sub-actions.)

---

## File structure

```
src/
├── app/
│   ├── App.tsx                      replaces root App.tsx
│   ├── navigation.tsx               root stack + bottom tabs
│   ├── theme.ts                     colors, spacing tokens
│   ├── screens/
│   │   ├── home/HomeScreen.tsx
│   │   ├── expenses/ExpensesScreen.tsx
│   │   ├── detail/ExpenseDetailScreen.tsx
│   │   ├── add/AddExpenseSheet.tsx           (manual/ocr/photo chooser)
│   │   ├── add/ManualEntryScreen.tsx
│   │   ├── insights/InsightsScreen.tsx
│   │   ├── settings/SettingsScreen.tsx
│   │   └── onboarding/OnboardingScreen.tsx
│   ├── stores/
│   │   ├── expenses.ts
│   │   ├── budgets.ts
│   │   └── settings.ts
│   └── components/
│       ├── ExpenseRow.tsx
│       ├── BudgetBar.tsx
│       ├── CategoryPicker.tsx
│       ├── AmountInput.tsx
│       ├── PermissionBanner.tsx
│       └── EmptyState.tsx
```

`App.tsx` at repo root becomes a thin re-export of `./src/app/App`.

---

## Task 1 — Install deps and root navigator scaffold

- [ ] Install the deps listed above. If peer-dep issues, allow `--legacy-peer-deps`.
- [ ] `src/app/theme.ts` — small token module: `palette` (bg, surface, text, muted, accent, danger, ok), `spacing` (4/8/12/16/24), `radius`, `font` sizes.
- [ ] `src/app/navigation.tsx`:
  - `RootStack`: `Onboarding`, `Tabs`, `ExpenseDetail`, `ManualEntry`.
  - `Tabs`: bottom-tab navigator with five tabs (`Home`, `Expenses`, `Add`, `Insights`, `Settings`). The Add tab's button opens the `AddExpenseSheet` modal instead of switching tabs (use `tabPress` listener with `preventDefault` + navigation to a screen with `presentation: 'modal'`).
- [ ] `src/app/App.tsx`:
  ```tsx
  import { NavigationContainer } from '@react-navigation/native';
  import { SafeAreaProvider } from 'react-native-safe-area-context';
  import { RootNavigator } from './navigation';
  export default function App() {
    return (
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    );
  }
  ```
- [ ] Replace `App.tsx` at repo root with `export { default } from './src/app/App';`.
- [ ] Each screen file gets a placeholder: a `<View>` with the screen name and a couple of read-only stats from the services (e.g. expense count) so the wiring is exercised.
- [ ] Typecheck passes.
- [ ] Commit: `feat(ui): root navigator + theme + screen placeholders`.

---

## Task 2 — Zustand stores

For each store, dispose actions take the `db` and `clock` via a shared module that lazily acquires `getAppDb()` and `systemClock`.

- [ ] `src/app/stores/expenses.ts`:
  - State: `items: Expense[]`, `loading: boolean`, `pending: Expense[]`.
  - Actions: `refresh()`, `add(input)`, `update(id, patch)`, `setCategory(id, catId)`, `void(id)`, `unvoid(id)`, `delete(id)`, `confirmPending(id)`.
- [ ] `src/app/stores/budgets.ts`:
  - State: `items`, `rollups: Record<budgetId, {spentMinor, remainingMinor, pct}>`.
  - Actions: `refresh()`, `upsert(input)`, `delete(id)`, `evaluateAlerts(): {budgetId, pcts}[]`.
- [ ] `src/app/stores/settings.ts`:
  - Wraps the `settings` row (JSON blob). Stores theme prefs, alert hours, autoBackup flag, encryption-on flag, currency display etc.
- [ ] Tests skipped (pure UI wiring on top of already-tested services).
- [ ] Commit: `feat(ui): zustand stores wrapping services`.

---

## Task 3 — Components

Each component is small, focused, and styled minimally with `theme.ts`.

- [ ] `ExpenseRow`: shows date, merchant, category chip, amount (right-aligned). Tap → navigate to `ExpenseDetail`.
- [ ] `BudgetBar`: progress bar with label "₹X spent / ₹Y" and pct. Color shifts from accent → warn → danger at 80/100%.
- [ ] `CategoryPicker`: bottom-sheet-style modal listing system + user categories.
- [ ] `AmountInput`: numeric input that displays as `₹1,234.50` while storing `amountMinor`.
- [ ] `PermissionBanner`: dismissible banner with title + CTA.
- [ ] `EmptyState`: icon + title + body + optional action button.
- [ ] Commit: `feat(ui): reusable components`.

---

## Task 4 — Home screen

- [ ] Sections:
  1. Today summary: total spend today + count.
  2. Active month-budget `BudgetBar` (if a monthly overall budget exists).
  3. Pending review inbox: list of `Expense[]` with status `pending_review` and a "Confirm / Edit" action.
  4. Backup status banner if last backup > 48h ago (read `backup_meta` for latest).
  5. Recent 5 expenses (tap → detail).
- [ ] Pull-to-refresh re-runs `refresh()` on stores.
- [ ] Commit: `feat(ui): Home screen`.

---

## Task 5 — Expenses list

- [ ] Infinite `FlatList` grouped by day (header per day).
- [ ] Filter bar: date range (this week / month / custom), category, source, status.
- [ ] Search by merchant/note.
- [ ] Tap row → detail.
- [ ] Empty state when no results.
- [ ] Commit: `feat(ui): Expenses list with filters`.

---

## Task 6 — Detail + manual entry

- [ ] `ExpenseDetailScreen`:
  - Header: amount + status badge (`pending_review` shown distinctly).
  - Fields editable inline: merchant, category, date, note, photo.
  - Bottom actions: **Delete** if `now - createdAt < 5min` (via `canDelete`), else **Void/Unvoid**.
  - Raw source text collapsible (audit).
  - Modify category triggers `expense.update` AND offers "Apply to N other Swiggy entries?" if `merchantNorm` repeats in the last 90 days (calls `ExpenseService.list` filtered, then `update` in a transaction).
- [ ] `ManualEntryScreen` (full-screen modal route):
  - Amount, merchant, date (defaults to now), category, note, photo (image picker).
  - Save → `expense.insert({source: 'manual', ...})` → back to previous screen.
- [ ] `AddExpenseSheet` (small modal):
  - Three buttons: Manual / Scan receipt / Quick photo. Each dismisses sheet then navigates.
  - Scan receipt: use `react-native-image-picker` to capture, pass URI to `OcrService.scan`, navigate to `ManualEntryScreen` with prefilled fields.
- [ ] Commit: `feat(ui): detail + manual entry + add sheet`.

---

## Task 7 — Insights (charts)

- [ ] Pie chart by category for current month (`react-native-gifted-charts.PieChart`).
- [ ] Bar chart of daily spend for last 30 days.
- [ ] Line chart of monthly trend for last 12 months.
- [ ] Budget vs actual for active overall budget.
- [ ] Commit: `feat(ui): Insights charts`.

---

## Task 8 — Settings

- [ ] Sections:
  - **Permissions:** rows showing SMS, Notification Listener, Battery exemption, POST_NOTIFICATIONS status. Tap → deep-link to relevant Settings page. Refresh status on app foreground.
  - **Budgets:** overall budget (period + amount + alert pcts). Add per-category budgets deferred.
  - **Backup:** sign-in/out, Backup now, Restore (lists `appDataFolder`), passphrase set/change, autoBackup toggle, frequency.
  - **Categories:** list system + user categories, allow creating user categories.
  - **Rules:** view user-created merchant rules; delete.
  - **ML Model:** status (loaded / re-extract).
  - **Advanced:** auto-confirm threshold, "Re-scan SMS inbox" (enqueues `InboxScanWorker`), "Export raw DB" (share-sheet the encrypted backup file).
  - **About:** app version, schema version, log export.
- [ ] Commit: `feat(ui): Settings`.

---

## Task 9 — Onboarding wizard

- [ ] `OnboardingScreen` with 7 numbered steps matching spec §7 (welcome, POST_NOTIFICATIONS, SMS, Notification Listener, battery exemption, inbox scan, backup). Each step is its own React component with a `next()` callback. Skippable except Welcome.
- [ ] On finish: write `settings.onboardingComplete = true` then navigate to `Tabs`.
- [ ] On every cold start, `RootNavigator` reads `settings.onboardingComplete` and picks initial route accordingly.
- [ ] Commit: `feat(ui): onboarding wizard`.

---

## Task 10 — Permission banners on Home

- [ ] On Home, render a `PermissionBanner` per missing permission with a "Fix" CTA that deep-links to the relevant Settings page. Re-check on AppState change to 'active'.
- [ ] Commit: `feat(ui): permission banners`.

---

## Task 11 — Wire up real BackupTask in `src/ingestion-task.ts`

- [ ] Replace the BackupTask stub from Plan 5 with the real implementation:
  - Construct `BackupOptions` using `getAppDb()`, `systemClock`, `createGoogleDriveClient()`, deviceId from `settings`, app version from `package.json`, photos and dbBytes from `react-native-fs`.
  - Call `BackupService.backupNow({kind, passphrase: settings.encryptionPassphrase})`.
- [ ] Commit: `feat(ui): wire periodic BackupTask`.

---

## Task 12 — Full sweep

- [ ] `npm test` — all passing (no new tests added in Plan 6 by intent; existing 95+ still pass).
- [ ] `npm run format && npm run lint && npm run typecheck` — all clean.
- [ ] Commit drift as `chore: format pass`.

---

## What lands after Plan 6

A complete v1 app: navigable shell, full CRUD on expenses and budgets, real-time SMS + notification ingestion, OCR receipts, charts, encrypted Drive backup, and a guided onboarding flow. From here, polish is on-device.
