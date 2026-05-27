# Payday Bug — Phase 1 Diagnosis Recap

> Generated 2026-05-27. This recap was produced by reading the actual source files
> (no prior diagnosis existed in context — it was reconstructed from scratch).
> Items marked **(uncertain)** could not be confirmed against a definitive source.

---

## 1. Files involved

| Role | File |
|---|---|
| View (screen) | `src/views/PaydayView.jsx` |
| State hook | `src/hooks/useFinance.js` (called once in `App.jsx`, exposed via `FinanceContext`) |
| Income query/service | `src/services/income.service.js` |
| Transaction query/service | `src/services/transactions.service.js` |
| Pure calc functions | `src/lib/finance.js` |
| AVAILABLE header | `src/components/layout/Header.jsx` |
| Tests | `src/views/PaydayView.test.jsx` |

Sub-components: `src/views/payday/IncomeCard.jsx`, `ConfirmSheet.jsx`, `UpdateReceivedSheet.jsx`.

---

## 2. Current data-fetching query (actual code)

Income sources are fetched with **no month filter** — `income.service.js`:

```js
export const getIncomeSources = async (centreId) => {
  const { data, error } = await supabase
    .from('income_sources')
    .select('*')
    .eq('budget_centre_id', centreId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  if (error) console.error('[income.service] getIncomeSources error:', error.message);
  return { data: data || [], error };
};
```

For contrast, transactions **are** month-scoped — `transactions.service.js`:

```js
export const getTransactionsByMonth = async (centreId, month) => {
  const from = month + '-01';
  const to   = new Date(new Date(from).setMonth(new Date(from).getMonth() + 1) - 1)
    .toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('budget_centre_id', centreId)
    .gte('date', from)
    .lte('date', to)
    .is('deleted_at', null)
    .order('date', { ascending: false });

  if (error) console.error('[transactions.service] getTransactionsByMonth error:', error.message);
  return { data: data || [], error };
};
```

The hook loads both together (`useFinance.js`, `load()`):

```js
const [txResult, incomeResult] = await Promise.all([
  loadTxs(month),   // month-aware
  loadIncomes(),    // NOT month-aware — ignores `month`
]);
```

---

## 3. Where month state lives + its format

- Lives in `useFinance.js`: `const [activeMonth, setActiveMonth] = useState(getCurrentMonth());`
- **Format: `'YYYY-MM'` string** (e.g. `'2026-05'`). Produced by `getCurrentMonth()` from `lib/finance.js`.
- Changed via `loadMonth(month)` → `setActiveMonth(month)` then `await load(month)`.
- `PaydayView` navigates with `loadMonth(offsetMonth(activeMonth, ±1))`.
- A `useEffect([load, activeMonth])` re-runs `load(activeMonth)` whenever the month changes.

---

## 4. `income_sources` schema (all columns)

**(uncertain — no `schema.sql`/migration file exists in the repo; columns inferred from
service + validation + hook usage.)** Every column referenced in code:

| Column | Source of evidence | Notes |
|---|---|---|
| `id` | `.eq('id', sourceId)`, optimistic `id` | PK (uuid) |
| `budget_centre_id` | `.eq('budget_centre_id', centreId)`, insert | FK to `budget_centres` |
| `label` | validation, insert/update | text |
| `icon` | validation (defaults `'💰'`) | text/emoji |
| `expected_amount` | validation (`Math.round(Math.max(0, …))`) | integer (minor units) |
| `currency` | `validateCurrency` | text |
| `pay_day` | `1–31` or `null` | int |
| `pay_day_type` | enum `'fixed_date' \| 'last_working_day' \| 'flexible'` | text |
| `notes` | validation | text |
| `received` | `markReceived`/`markPending` | **boolean** |
| `received_amount` | `markReceived` sets, `markPending` zeroes | integer |
| `actual_pay_date` | `markReceived` sets, `markPending` nulls | date `'YYYY-MM-DD'` |
| `deleted_at` | soft-delete filter | timestamptz, nullable |
| `created_at` | `.order('created_at')` | timestamptz |

**Critical finding:** there is **no month/period column** on `income_sources`. `received`,
`received_amount`, and `actual_pay_date` are single fields on the source row — they are
**overwritten each month**, not stored per-month.

---

## 5. Does any per-month table exist?

- **`transactions`** — month-aware **by date range** (see §2), not by a month column.
  It is the only table with a usable time dimension. The income-received "ledger" lives here:
  `markReceived` Phase 2 inserts a `type: 'income'` transaction dated to `actual_pay_date`.
- **`income_sources`** — config/state table, **no month dimension** (see §4).
- **No** `wallet_entries`, `payday_history`, `income_receipts`, or any per-month income
  table exists. **(uncertain re: DB itself — confirmed only against the codebase; no
  service or query references any such table, and no schema file lists one.)**

So "income received in month X" is reconstructable only from the `transactions` table
(income-type rows by date), **not** from `income_sources`.

---

## 6. How AVAILABLE (header) is computed + its data source

`Header.jsx` reads a single value:

```js
const { availableNow } = useFinanceContext();
```

`availableNow` is computed in `useFinance.js`:

```js
const allIncome    = useMemo(() => totalIncome, [totalIncome]);
const availableNow = useMemo(() => allIncome - totalSpent, [allIncome, totalSpent]);
```

where both inputs come from the **month-scoped `txs`**:

```js
const totalIncome = useMemo(() => calcTotalIncome(txs), [txs]);  // sum of type==='income' tx amounts
const totalSpent  = useMemo(() => calcTotalSpent(txs),  [txs]);  // sum of type==='expense' tx amounts
```

So **AVAILABLE = (income transactions this month) − (expense transactions this month)**, fed
entirely by the month-filtered `transactions` query. It does **not** read `income_sources`.

> Note: `lib/finance.js` also exports a `calcAvailableNow(sources, txs)` that mixes
> `calcTotalReceived(sources)` with current-calendar-month spend — but the **hook does not
> use it**. The live header value is the simpler `allIncome - totalSpent` above. **(flagged
> as a latent inconsistency, not the active code path.)**

---

## 7. Is AVAILABLE correctly month-aware?

**Yes — AVAILABLE is correctly month-aware.** Because it derives only from `txs`, which is
re-fetched by date range on every `loadMonth`. AJ's observation that it shows **GHS 0 in
April is the *correct* result**, not a bug: income only enters `transactions` when
`markReceived` runs (Phase 2 insert), dated to `actual_pay_date`. If no income was confirmed
*in April*, there are no April income transactions, so April AVAILABLE = 0.

**The real bug is the opposite side of the Payday screen.** The summary card's **Received**
and **Pending** figures, and the income list itself, come from `incomes` (i.e.
`income_sources`), which is **not month-filtered**:

```js
totalReceived = calcTotalReceived(incomes)                       // sums received_amount across ALL sources
totalPending  = incomes.filter(i => !i.received)
                  .reduce((s, i) => s + (i.expected_amount||0),0) // same regardless of month
```

So Received/Pending show the **same numbers in every month**, while AVAILABLE (correctly)
changes per month — an internal contradiction the screen even half-acknowledges with its
"Income status shown reflects current state, not historical data" past-month warning
(`PaydayView.jsx` lines 126–132).

---

## 8. Empty-state pattern from LogView (reference component)

`LogView.jsx` uses a **two-tier** empty state inside the list-empty branch
(`dates.length === 0`):

1. **True empty** (`txs.length === 0`): document SVG (opacity 0.3) + "Nothing logged yet";
   sub-line "Tap + to log your first transaction" shown **only if `isCurrentMonth`**.
2. **Filtered-empty** (txs exist but none match filter/search): magnifier SVG + "No results
   found" + context line (`No transactions matching "{search}"` or `No {filter} transactions
   this month`).

Structure: centered container `padding: '56px 24px 48px'`, 64×64 inline SVG with
`stroke="var(--c-primary)"` at `opacity: 0.3`, bold 16px title in `--c-text`, 13px muted
sub-line. No emoji.

> PaydayView's current empty state diverges from this reference: it uses a `💜` **emoji** at
> 36px and a "Go to Settings" CTA button rather than the LogView SVG pattern. Worth noting if
> the fix touches empty states.

---

## 9. Tests that exist for Payday + what they assert

`src/views/PaydayView.test.jsx` mocks both contexts (a mutable `mockFinance` object) and asserts:

1. **shows skeleton when loading** — `loading: true` renders something.
2. **shows month label** — `payday-month-label` contains `'2026'`.
3. **shows total received** — `payday-total-received` === `'GHS 30,000'`.
4. **shows total pending** — `payday-total-pending` === `'GHS 15,000'`.
5. **shows all income streams** — "Adjei Salary" and "Dita Salary" present.
6. **shows past month warning** — with `activeMonth: '2026-04'`, the warning text renders.
7. **shows empty state** — `incomes: []` → "No income sources" copy.
8. **shows error state** — `error: 'Failed to load'` renders.
9. **shows previous month button** — `Previous month` label exists.
10. **next month disabled on current month** — `Next month`.disabled === true.

**Coverage gap:** every figure is asserted against **hardcoded mock values**
(`totalReceived: 30000`, etc.). **No test exercises month-awareness** — i.e. nothing asserts
that Received/Pending should *change* between April and May. The mocks supply the same numbers
regardless of `activeMonth`, so the bug is invisible to the current suite. This is why it
passed tests yet failed for AJ.

---

## 10. Fix-complexity assessment

**Moderate — and a design decision is required before coding.** It is not a one-line query
tweak, because `income_sources` has no month dimension (§4) and no per-month table exists (§5).

Two viable directions:

- **(A) Display-only / low effort — derive Payday figures from `txs`.**
  Compute Received from month-scoped income transactions (already in `txs`), and treat
  expected-but-not-received per month. Keeps schema unchanged; makes Received genuinely
  month-aware and consistent with AVAILABLE. Risk: "Pending" for past months is ambiguous
  without a per-month expectation record — likely show received-only history for past months.
  Touches `useFinance.js` (new memos) + `PaydayView.jsx`; pure-fn additions go in
  `lib/finance.js` + `finance.test.js` per CLAUDE.md §7.

- **(B) Correct / higher effort — introduce a per-month income-receipt model.**
  A `payday_history`/`income_receipts` table (source_id, month, expected, received_amount,
  received, actual_pay_date) keyed by month. Most faithful, enables true historical Payday,
  but is a **migration project**: new table + RLS + service + hook rewrite + month-scoped
  fetch + fixtures + tests. Per CLAUDE.md, cross-user/multi-table writes would need a
  `SECURITY DEFINER` RPC.

**Recommendation (uncertain, pending AJ's intent):** if the requirement is "stop showing
wrong/duplicated numbers in past months," **(A)** is the proportionate fix. If the requirement
is "see true historical payday state per month," only **(B)** satisfies it.

**Sequencing note:** confirm with AJ whether the goal is *historical accuracy* or just
*not-misleading past months* before writing code — that single answer decides A vs B.
