# Family Finance — Engineering Standards & Code Conventions

> This document defines how we write, structure, and ship code for the Family Finance app.
> Every engineer (human or AI) working on this codebase must follow these standards.

---

## 1. Project Architecture

The app follows a **modular, layered architecture**. Every layer has a single responsibility.

```
src/
├── constants/        # Static values — categories, weeks, types
├── data/             # Mock data — replaced by API later
├── lib/              # Pure finance functions — no React, no side effects
├── hooks/            # Shared state and derived values
├── components/
│   ├── ui/           # Primitive reusable components
│   ├── layout/       # Header, BottomNav, FAB
│   └── modals/       # Self-contained modal components
├── views/            # One file per screen/tab
├── App.jsx           # Routing + top-level composition only (~40–60 lines)
├── main.jsx          # React root mount
└── index.css         # Global resets and font imports
```

### Rules
- `App.jsx` must never contain business logic or calculation code
- Views are **dumb** — they receive props, render UI, call handlers
- All finance calculations live in `lib/finance.js` only
- All shared state lives in `hooks/useFinance.js` only
- Mock data and real API data share the same shape — only the source changes

---

## 2. File Size Limits

| File type | Max lines |
|---|---|
| `App.jsx` | 60 |
| Any view | 200 |
| Any component | 100 |
| Any hook | 80 |
| `lib/finance.js` | 150 |

If a file exceeds its limit, split it.

---

## 3. Naming Conventions

```
PascalCase    → Components, Views         HomeView.jsx, AddModal.jsx
camelCase     → Functions, variables       calcTotalSpent(), fmt()
SCREAMING     → Constants                  FIXED_EXPENSES, WEEKS
kebab-case    → Folders                    components/ui/, components/layout/
use prefix    → Custom hooks               useFinance(), useTransactions()
```

### Component file naming
```
views/HomeView.jsx          ✅
views/home.jsx              ❌
views/homeView.jsx          ❌
components/ui/ProgressBar   ✅
components/ProgressBarUI    ❌
```

---

## 4. Component Rules

```jsx
// ✅ Good — single purpose, clear props, no business logic
export function ProgressBar({ pct = 0, overspent = false }) {
  const clamped = Math.min(pct, 100);
  const bg = overspent ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981';
  return (
    <div style={{ background: '#f3f4f6', borderRadius: 6, height: 8 }}>
      <div style={{ width: String(clamped) + '%', height: '100%', background: bg }} />
    </div>
  );
}

// ❌ Bad — mixing calculation logic into UI component
export function ProgressBar({ txs, budget }) {
  const spent = txs.filter(t => t.type === 'Expense').reduce(...);  // belongs in lib/finance.js
  const pct = (spent / budget) * 100;
  ...
}
```

**Never put calculations inside components.** Pass derived values as props.

---

## 5. Finance Calculation Rules

All finance logic lives in `src/lib/finance.js`.

```js
// ✅ Good — pure function, testable, no side effects
export const calcTotalSpent = (txs) =>
  txs.filter(t => t.type === 'Expense').reduce((s, t) => s + t.amount, 0);

// ❌ Bad — impure, depends on external state
export const calcTotalSpent = () =>
  store.txs.filter(...);  // never access global state from finance functions
```

**Rules for `lib/finance.js`:**
- Pure functions only — input in, output out
- No React imports
- No side effects
- No async operations
- Easily unit testable in isolation

---

## 6. State Management Rules

All shared state lives in `src/hooks/useFinance.js`.

```js
// ✅ Good — state + derived values in one place
export function useFinance() {
  const [txs, setTxs] = useState(INITIAL_TXS);
  const totalSpent = useMemo(() => calcTotalSpent(txs), [txs]);
  const addTransaction = (tx) => setTxs(prev => [{ ...tx, id: Date.now() }, ...prev]);
  return { txs, totalSpent, addTransaction };
}

// ❌ Bad — spreading state across multiple components
function HomeView() {
  const [txs, setTxs] = useState([]);  // state does not belong here
```

**Rules:**
- `useMemo` for every derived value — never recalculate on every render
- Handlers live in the hook, not in views
- Views only call handlers — they never manipulate state directly

---

## 7. Style Rules

All styles are **inline style objects**. No CSS-in-JS libraries, no Tailwind (unless explicitly added to the project).

```jsx
// ✅ Good — inline, co-located with component
<div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>

// ✅ Good — shared style object exported from ui/index.jsx
import { cardStyle } from '../components/ui';
<div style={cardStyle}>

// ❌ Bad — template literal in JSX style tag (breaks esbuild)
<style>{`
  .card { background: #fff; }
`}</style>

// ❌ Bad — string concatenation with special chars
<div style={{ width: pct + '%' }}>       // ❌ breaks esbuild
<div style={{ width: String(pct) + '%' }}> // ✅ correct
```

**Critical rule:** Never use template literals inside JSX `<style>` tags.
Global CSS (`@import`, resets, fonts) belongs in `src/index.css` only.

---

## 8. Data Model

Every transaction must match this exact shape:

```js
{
  id:          Number,    // Date.now() for local, Firestore ID for synced
  date:        String,    // 'YYYY-MM-DD' — ISO format, no time
  week:        String,    // 'Week 1' | 'Week 2' | 'Week 3' | 'Week 4' | 'Week 5'
  type:        String,    // 'Income' | 'Expense'
  category:    String,    // must match a FIXED_EXPENSES category or INCOME_CATS
  description: String,    // optional, default ''
  amount:      Number,    // always a number, never a string, never currency-formatted
  loggedBy:    String,    // optional — guest name for staff-submitted entries
}
```

**Rules:**
- `amount` is always a raw number — format with `fmt()` for display only
- `date` is always `YYYY-MM-DD` string — never a Date object in state
- Never store formatted values (e.g. `'GHS 1,200'`) in state

---

## 9. Google Sheets / Firebase Sync Points

Every data boundary is clearly marked for future integration.

```js
// In data/mockData.js
// GOOGLE SHEETS SYNC POINT:
// Replace INITIAL_TXS with:
//   GET sheets.googleapis.com/v4/spreadsheets/{ID}/values/Transactions!A:H
//   Map rows → transaction objects

// In hooks/useFinance.js
const addTransaction = (tx) => {
  setTxs(prev => [{ ...tx, id: Date.now() }, ...prev]);
  // GOOGLE SHEETS SYNC POINT:
  // await sheetsService.appendRow(tx);
  // FIREBASE SYNC POINT:
  // await addDoc(collection(db, 'families', familyId, 'transactions'), tx);
  // NOTIFICATION SYNC POINT:
  // if (notifs.newPayment) notifyService.send('new_payment', tx);
};
```

**Every sync point must include a comment explaining exactly what goes there.**

---

## 10. Adding New Features — Step by Step

1. **Write the calculation first** in `lib/finance.js`
2. **Expose it** from `hooks/useFinance.js`
3. **Build the view** in `views/YourView.jsx`
4. **Add the tab** to `components/layout/BottomNav.jsx`
5. **Wire it up** in `App.jsx`
6. **Verify 0 backtick issues** before pushing

```bash
# Quick validation check before every push
node -e "
const fs=require('fs');
const src=fs.readFileSync('src/App.jsx','utf8');
const lines=src.split('\n');
lines.forEach((l,i)=>{
  const bt=(l.match(/\`/g)||[]).length;
  if(bt%2!==0) console.log('Issue line '+(i+1)+': '+l.trim());
});
console.log('Lines:',lines.length);
"
```

---

## 11. What Never Goes in App.jsx

```jsx
// ❌ Never in App.jsx
const totalSpent = txs.filter(t => t.type === 'Expense').reduce(...);  // → lib/finance.js
const [txs, setTxs] = useState([]);                                     // → hooks/useFinance.js
const FIXED_EXPENSES = [...];                                            // → constants/index.js
const HOUSEHOLD = { name: 'Adjei Family' };                             // → data/mockData.js
function ProgressBar() { ... }                                          // → components/ui/
```

App.jsx imports and composes. Nothing else.

---

## 12. Comments Policy

```js
// ✅ Good — explains why, not what
// Clamp to 100 so overspent categories don't break the bar visually
const clamped = Math.min(pct, 100);

// ✅ Good — marks a future integration point
// FIREBASE SYNC POINT: await addDoc(collection(db, ...), tx);

// ❌ Bad — restates the code
// Filter expenses and calculate sum
const total = txs.filter(t => t.type === 'Expense').reduce((s,t) => s+t.amount, 0);
```

**Rule:** Comments explain intent, not mechanics. Every sync point gets a comment.

---

## 13. Push Checklist

Before every `git push`:

- [ ] No backtick issues (`backtick check` above)
- [ ] No template literals in JSX style tags
- [ ] No inline `%` concatenation without `String()` wrapper
- [ ] `App.jsx` is under 60 lines
- [ ] All new calculations are in `lib/finance.js`
- [ ] All new state is in `hooks/useFinance.js`
- [ ] New view file is under 200 lines
- [ ] Mock data shape matches the real data model
- [ ] Sync point comments added for any new data operations

---

## 14. The Golden Rule

> **Every file does one thing. If you can't describe what a file does in one sentence, split it.**

| File | One sentence |
|---|---|
| `lib/finance.js` | Pure functions that calculate finance totals |
| `hooks/useFinance.js` | Holds all state and exposes derived values |
| `data/mockData.js` | Seed data that will be replaced by API calls |
| `views/HomeView.jsx` | Renders the home dashboard tab |
| `App.jsx` | Composes views, routes tabs, owns the modal |
