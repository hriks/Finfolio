# Categorizer Optimization (AI-labeled rules + matcher fixes) — Design

**Date:** 2026-07-18
**Status:** Approved
**Constraints (user):** NO schema changes. NO writes to existing user data (no backfill —
declined). NO deletions. Rules affect future ingestion only. Person-name UPI payments stay
uncategorized by design.

## Basis

Analysis of real Pixel data (219 active expenses, 91.3% categorized) in
`.superpowers/sdd/ml-analysis-report.md`. The NN/embeddings path is dormant (no model
asset; `TFLiteEmbedder.embed` is a stub; `embedCorpus` uncalled) — out of scope. The
production categorizer is rules-only, so optimization targets the rules layer.

## Changes

### 1. AI-labeled bundled merchant rules (`src/data/seed/merchant-rules.ts`)

Add (INSERT OR IGNORE seeds, propagate to both phones on next launch):

| merchant_norm | category |
|---|---|
| `blue tokai coffee roaster` | `cat-food` |
| `kesharwani chaat corner` | `cat-food` |
| `arshad nariyal pani` | `cat-food` |
| `smw rekha srivastava clin` | `cat-medical` |
| `swiggy instamart` | `cat-groceries` |

Also add the same five to `src/assets/merchants-corpus.json` (keeps the future NN corpus
current; no runtime effect today).

### 2. Deterministic longest-match substring lookup (`src/services/categorizer/rules.ts`)

`lookupSubstring` currently returns the first match in arbitrary row order. Change: among
all bundled rules whose `merchant_norm` is a substring of the needle, pick the LONGEST
`merchant_norm` (most specific). Ties broken deterministically (alphabetical). With rule 1
this sends `swiggy instamart …` to Groceries while plain `swiggy …` stays Food.

### 3. Case-insensitive subcategory autofill (`src/services/categorizer/subcategory.ts`)

Group past subcategories case-insensitively so `Grocery`/`grocery` (and `Third wave
coffee`/`Third Wave Coffee`, `Alpha Movie`/`Alpha movie` — real splits in the data) count
as one when applying the ≥2 threshold. Return the most frequent original spelling within
the winning group (ties → most recent). Read-only behavior change; no stored data is
rewritten.

## Testing (TDD, existing suites)

- `__tests__/services/categorizer-rules.test.ts`: longest-match — with bundled rules
  `swiggy→food` and `swiggy instamart→groceries`, needle `swiggy instamart order` →
  groceries and `swiggy order` → food, regardless of rule insertion order.
- `__tests__/data/seed.test.ts`: new rules present after seeding.
- `__tests__/services/subcategory.test.ts`: `Grocery` + `grocery` (1 each) now meets the
  ≥2 threshold and returns the more recent spelling; existing behavior otherwise intact.

## Out of scope

- Backfilling the 19 existing uncategorized rows (user declined — future SMS only).
- TFLite model shipping / NN activation (separate project).
- Any change to `cat-transport`'s user-renamed "Travel" label.
