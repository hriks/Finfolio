# Expense Detail: Editable Amount — Design

**Date:** 2026-07-18
**Status:** Approved

## Problem

The expense detail screen edits merchant, category, title (subcategory), and note — but
the amount is display-only. Wrong parses or fee differences can't be corrected. (A vestigial
`editAmount` state already exists in `ExpenseDetailScreen.tsx` but is never rendered.)

## Change

Add an **Amount** section to the edit form in `ExpenseDetailScreen.tsx`, following the
screen's existing field pattern:

- `TextInput` with `keyboardType="numeric"`, showing the amount in rupees
  (`amountMinor / 100`, formatted without trailing `.00` when whole).
- **Save on blur** via the existing `saveField({ amountMinor })` path — same as
  merchant/note/title.
- **Validation before save:** parse as decimal rupees (allow digits, one decimal point, up
  to 2 decimals; strip commas/spaces). If invalid, empty, ≤ 0, or unchanged → do NOT save;
  reset the input back to the stored amount. A stray keystroke can never corrupt a row.
- Round to integer paise: `Math.round(parsed * 100)`.
- The summary box amount and Audit "Stored:" line already re-render from the reloaded
  expense — no extra wiring.
- Repurpose the existing `editAmount` state (as a string for the input) rather than adding
  a parallel one.

## Constraints

- UI + existing `expenseService.update` only (it already whitelists `amountMinor`).
  No schema changes, no new service methods, no changes to void/merge flows.

## Testing

`__tests__/services/expense-service.test.ts` already covers `update({amountMinor})` — add
a case only if missing. The rupee-string → paise parsing/validation logic must be a small
exported pure helper (e.g. `parseRupees(input: string): number | null` in the screen file
or a tiny util) with unit tests: valid ("240", "240.5", "1,240.50" → paise), invalid
("", "0", "-5", "abc", "1.2.3", "12.345" → null). On-device: edit an amount, blur, reopen
→ persisted; type garbage, blur → reverts.
