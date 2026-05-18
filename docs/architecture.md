# Family Finance Command Centre — Architecture

## Version
2.0 — Complete rebuild from requirements first. Started 2026-05-18.

## Core Principle
Supabase is the single source of truth for all financial data.
No mock data. No hardcoded constants for user-specific values.
Every calculation function accepts data from Supabase as parameters.

---

## Stack
- React 18 + Vite 5
- Supabase (auth + database + RLS)
- Vercel (deployment)
- PWA
- Inline styles only — no CSS frameworks
- No CSS-in-JS libraries

---

## Naming Conventions

| Concept | Name in code | Name in database |
|---|---|---|
| Financial unit | BudgetCentre | budget_centres |
| Member | BudgetCentreMember | budget_centre_members |
| Category | BudgetCategory | budget_categories |
| Income source | IncomeSource | income_sources |
| Transaction | Transaction | transactions |
| Guest | GuestUser | guest_users |
| User config | UserPreferences | user_preferences |

---

## Database Schema

### users
```
id           uuid PK (mirrors auth.users)
email        text
name         text
avatar_url   text
plan         text ('free' | 'pro')
created_at   timestamptz
updated_at   timestamptz
```

### budget_centres
```
id              uuid PK
name            text
currency        text (e.g. 'GHS', 'USD', 'GBP')
surplus_target  numeric
icon            text (emoji)
owner_id        uuid FK → users
created_at      timestamptz
updated_at      timestamptz
deleted_at      timestamptz (soft delete)
```

### budget_centre_members
```
id               uuid PK
budget_centre_id uuid FK → budget_centres
user_id          uuid FK → users
role             text ('owner' | 'member')
joined_at        timestamptz
deleted_at       timestamptz (soft delete)
UNIQUE (budget_centre_id, user_id)
```

### budget_categories
```
id               uuid PK
budget_centre_id uuid FK → budget_centres
name             text
icon             text (emoji)
budget_amount    numeric
month            text ('YYYY-MM')
is_fixed         boolean
sort_order       integer
created_at       timestamptz
updated_at       timestamptz
deleted_at       timestamptz (soft delete)
```

### income_sources
```
id               uuid PK
budget_centre_id uuid FK → budget_centres
label            text
icon             text (emoji)
expected_amount  numeric
currency         text
pay_day          integer (1–31, nullable)
pay_day_type     text ('fixed_date' | 'last_working_day' | 'flexible')
notes            text
received         boolean
received_amount  numeric
actual_pay_date  date
created_at       timestamptz
updated_at       timestamptz
deleted_at       timestamptz (soft delete)
```

### transactions
```
id                    uuid PK
budget_centre_id      uuid FK → budget_centres
date                  date
week                  text ('Week 1'–'Week 5')
type                  text ('income' | 'expense')
category_id           uuid FK → budget_categories (nullable)
category_name         text
amount                numeric
currency              text (defaults to centre currency, overridable)
description           text
logged_by_user_id     uuid FK → users (nullable)
logged_by_name        text
source                text ('main_app' | 'guest_portal')
submitted_by_guest_id uuid (nullable)
submitted_by_name     text
created_at            timestamptz
updated_at            timestamptz
deleted_at            timestamptz (soft delete)
```

### guest_users
```
id               uuid PK
budget_centre_id uuid FK → budget_centres
name             text
pin_hash         text
allowed_categories text[]
is_active        boolean
created_at       timestamptz
updated_at       timestamptz
deleted_at       timestamptz (soft delete)
```

### user_preferences
```
id           uuid PK
user_id      uuid FK → users (UNIQUE)
theme_skin   text
theme_accent text
notifications jsonb
created_at   timestamptz
updated_at   timestamptz
```

---

## RLS Policy Map

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| users | own row | authenticated | own row | never |
| budget_centres | is_member OR is_owner | authenticated | is_owner | never |
| budget_centre_members | is_member OR is_owner | is_owner | is_owner | never |
| budget_categories | is_member OR is_owner | is_member | is_member | never |
| income_sources | is_member OR is_owner | is_member | is_member | never |
| transactions | is_member OR is_owner | is_member | is_member | never |
| guest_users | is_owner | is_owner | is_owner | never |
| user_preferences | own row | authenticated | own row | never |

All deletes are soft — `deleted_at = now()`. Never hard delete financial data.

---

## Helper Functions

```sql
is_budget_centre_member(centre_id uuid) → boolean
is_budget_centre_owner(centre_id uuid) → boolean
handle_updated_at() → trigger function
handle_new_user() → trigger function (creates users + user_preferences on signup)
```

---

## Plan Tiers

| Feature | Free | Pro |
|---|---|---|
| Budget centres | 1 | Unlimited |
| Members per centre | 2 (owner + 1) | Unlimited (3rd+ requires Pro) |
| Income streams per centre | 2 | Unlimited |
| Guest users per centre | 1 | Unlimited |
| Skins and themes | 1 | All |
| CSV export | No | Yes |
| Yearly dashboard | No | Yes |

---

## React Architecture

```
Supabase
  ↓
useAuth(user)
  ↓
useBudgetCentre(user, centreId)    ← loads centre + categories + members
  ↓
BudgetCentreProvider               ← provides centre, categories, fmt, getCatIcon
  ↓
useFinance(centre, categories)     ← calculations only, Supabase data only
  ↓
Views                              ← read from context, zero prop threading
```

### BudgetCentreContext shape
```js
{
  centre,       // full Supabase budget_centres row
  categories,   // Supabase budget_categories for active month
  members,      // Supabase budget_centre_members
  fmt,          // currency-aware formatter — makeFmt(centre.currency)
  getCatIcon,   // (categoryName) => emoji string
}
```

---

## File Structure

```
src/
├── App.jsx
├── context/
│   └── BudgetCentreContext.jsx
├── hooks/
│   ├── useAuth.js
│   ├── useBudgetCentre.js
│   └── useFinance.js
├── lib/
│   ├── finance.js
│   ├── supabase.js
│   └── storage.js
├── services/
│   ├── centres.service.js
│   ├── categories.service.js
│   ├── income.service.js
│   ├── transactions.service.js
│   └── guests.service.js
├── features/
│   └── onboarding/
├── views/
│   ├── AuthScreen.jsx
│   ├── HomeView.jsx
│   ├── PaydayView.jsx
│   ├── BudgetView.jsx
│   ├── DailyView.jsx
│   ├── LogView.jsx
│   ├── SettingsView.jsx
│   └── GuestView.jsx
└── components/
    ├── layout/
    │   ├── Header.jsx
    │   ├── BottomNav.jsx
    │   ├── FAB.jsx
    │   └── SidePanel.jsx
    ├── modals/
    │   └── AddModal.jsx
    └── ui/
        └── index.jsx
```

---

## Build Order

| Session | What gets built | Verified by |
|---|---|---|
| 1 | Supabase schema + RLS + functions | SQL audit ✅ DONE |
| 2 | lib/finance.js + context + hooks | Code audit |
| 3 | Auth + Onboarding | SQL data audit after each step |
| 4 | Dashboard shell (no data) | Visual check |
| 5 | Home view | Numbers correct in live app |
| 6 | Payday view | Mark received creates transaction |
| 7 | Budget view | Categories from Supabase |
| 8 | Daily + Log views | All transactions visible |
| 9 | Settings | Edits persist to Supabase |
| 10 | Guest portal | Completely isolated |
| 11 | Side panel + multi-centre | Centre switching works |
| 12 | PWA + deployment | Install prompt works |

---

## Rules — Non-Negotiable

1. No mock data ever enters the codebase
2. No calculation function uses hardcoded financial values
3. Every view reads currency via `fmt` from `BudgetCentreContext`
4. Every view reads categories from `BudgetCentreContext`
5. After every session: code audit + SQL data audit + live app check
6. No session starts until previous session passes all three checks
7. Soft deletes only — never hard delete financial data
8. Every new Supabase table needs both owner AND member SELECT policies
9. Commit after every verified step
10. No patches — find the root cause and fix it properly

---

## Validation Rules

Every value must be validated in the service layer before any Supabase write.
Never trust the UI. Never skip validation because "the form already checks it".

### Amount validation
```js
const validateAmount = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error('Amount must be a number');
  if (n <= 0)              throw new Error('Amount must be greater than zero');
  return Math.round(n);    // always round to nearest integer before storing
};
```

### Date validation
```js
const validateDate = (dateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Date must be YYYY-MM-DD');
  const d = new Date(dateStr);
  if (isNaN(d.getTime()))                    throw new Error('Date is invalid');
  return dateStr;
};
```

### Week validation
```js
const VALID_WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
const validateWeek = (week) => {
  if (!VALID_WEEKS.includes(week)) throw new Error('Week must be Week 1–5');
  return week;
};
```

### Currency validation
```js
const VALID_CURRENCIES = ['GHS', 'USD', 'GBP', 'EUR', 'NGN', 'KES', 'ZAR', 'CAD'];
const validateCurrency = (currency) => {
  if (!VALID_CURRENCIES.includes(currency)) throw new Error('Unsupported currency: ' + currency);
  return currency;
};
```

### String validation
```js
const validateString = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(field + ' must be a non-empty string');
  return value.trim();
};
```

### Rules
- Call validate functions at the top of every service insert/update function
- If validation fails, throw immediately — never write partial data
- Validation errors are caught by the calling hook and shown to the user
- Never validate in components — always in services

---

## Optimistic Update Pattern

All user-initiated writes follow this pattern exactly.
Never deviate from it.

```js
const addTransaction = async (tx) => {
  // 1. Validate first — throw if invalid
  const validated = validateTransaction(tx);

  // 2. Generate a temporary ID for optimistic state
  const tempId = crypto.randomUUID();
  const optimistic = { ...validated, id: tempId, _optimistic: true };

  // 3. Update UI immediately
  setTxs(prev => [optimistic, ...prev]);

  // 4. Write to Supabase
  const { data, error } = await supabase
    .from('transactions')
    .insert(validated)
    .select()
    .single();

  if (error) {
    // 5a. Rollback on failure — remove optimistic row, show error
    setTxs(prev => prev.filter(t => t.id !== tempId));
    throw error;
  }

  // 5b. Replace temp ID with real Supabase ID
  setTxs(prev => prev.map(t => t.id === tempId ? { ...data, _optimistic: false } : t));
};
```

### Rules
- Every optimistic update must have an explicit rollback
- Never leave a `_optimistic: true` row in state if the write fails
- Always replace the temp ID with the real Supabase ID on success
- Never assume a write succeeded because no JavaScript error was thrown

---

## Amount Precision Rules

JavaScript floating point arithmetic is unreliable for financial calculations.
`0.1 + 0.2 = 0.30000000000000004`

### Rules
- All amounts are stored as integers (minor units) in Supabase where possible
- Always use `Math.round()` at every calculation boundary
- Never display a raw floating point number — always pass through `fmt()`
- Never compare amounts with `===` after arithmetic — round first
- The `validateAmount` function always rounds before returning

---

## Security Rules

### PIN hashing
- Guest user PINs must be hashed before storing in Supabase
- Never store a plain text PIN in any database column, URL, or localStorage
- Use a bcrypt or SHA-256 hash in the service layer before insert
- The application never stores or transmits the raw PIN after the user enters it

```js
// In guests.service.js — always hash before writing
import { hashPin } from '../lib/crypto';

export const createGuestUser = async (centreId, { name, pin, allowedCategories }) => {
  const pin_hash = await hashPin(pin); // never store raw pin
  const { data, error } = await supabase
    .from('guest_users')
    .insert({ budget_centre_id: centreId, name, pin_hash, allowed_categories: allowedCategories });
  return { data, error };
};
```

### localStorage — UI only
- Never store financial data in localStorage
- Never store transaction amounts, category data, or income figures in localStorage
- localStorage is for: theme skin, theme accent, notification preferences only
- Guest portal settings are encoded in the URL for cross-device sharing — never in localStorage

### URLs
- Never put financial amounts, budget centre IDs, or sensitive data in URL parameters
- Guest portal URL encodes only: portal flag, enabled state, portal name
- Never include PINs, amounts, or user IDs in any URL

---

## Error Handling Rules

### Service layer
- Every Supabase call destructures `{ data, error }`
- Always check `error` before using `data`
- Always `console.error` with table name and operation on error
- Never swallow errors silently

```js
// Correct pattern
const { data, error } = await supabase.from('transactions').insert(row).select().single();
if (error) {
  console.error('[transactions.service] insert error:', error.message);
  return { data: null, error };
}
return { data, error: null };
```

### Hook layer
- Hooks catch errors from services and set error state
- Error state is always surfaced to the UI — never hidden
- Loading state is always reset on both success and error paths

### UI layer
- Error boundaries wrap every major view section
- A crashed component shows a fallback — never a blank screen
- Auth session expiry redirects to the auth screen gracefully

---

## Audit Commands

Run all five after every session. No session is complete until all five return zero results.

```bash
# A: Banned imports
grep -rn "import.*\bfmt\b.*finance\|import.*HOUSEHOLD\|import.*FIXED_EXPENSES\|import.*mockData" src/ --include="*.jsx" --include="*.js" | grep -v "node_modules\|lib/finance.js"

# B: Module-level calculations
grep -rn "^const.*= calc\|^const.*= fmt\|^const.*= get" src/views/ src/components/ --include="*.jsx"

# C: Hardcoded currency in components
grep -rn "'GHS'\|\"GHS\"\|'USD'\|'£'\|'₦'" src/views/ src/components/ src/hooks/ --include="*.jsx" --include="*.js" | grep -v "makeFmt\|CURRENCY\|finance.js\|storage.js\|fallback"

# D: Silent error swallowing
grep -rn "const { data" src/hooks/ src/services/ --include="*.js" | grep -v "error\|subscription"

# E: Missing deleted_at filter on selects
grep -rn "\.select(" src/services/ --include="*.js" | grep -v "deleted_at\|auth\|node_modules\|single\|count"
```
