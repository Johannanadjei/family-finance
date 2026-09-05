/**
 * lib/finance.js
 * Pure calculation functions. No mock data. No hardcoded user values.
 * All functions accept Supabase data as parameters.
 * Currency formatting created per budget centre via makeFmt().
 */

// getCurrentMonth lives in lib/dates.js (canonical month-key home); re-exported
// here so the many existing `import { getCurrentMonth } from '../lib/finance'`
// call sites keep working without a churn-wide import rewrite.
export { getCurrentMonth } from './dates';

export const WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];

const CURRENCY_CONFIG = {
  GHS: { symbol: 'GHS', locale: 'en-GH' },
  USD: { symbol: '$',   locale: 'en-US' },
  GBP: { symbol: '£',   locale: 'en-GB' },
  EUR: { symbol: '€',   locale: 'de-DE' },
  NGN: { symbol: '₦',   locale: 'en-NG' },
  KES: { symbol: 'KSh', locale: 'en-KE' },
  ZAR: { symbol: 'R',   locale: 'en-ZA' },
  CAD: { symbol: 'CA$', locale: 'en-CA' },
};

export const makeFmt = (currency = 'GHS') => {
  const config = CURRENCY_CONFIG[currency] || CURRENCY_CONFIG.GHS;
  return (n) => config.symbol + ' ' + Math.round(n || 0).toLocaleString(config.locale);
};

export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export const fmtDayHeader = (dateStr) => {
  const today     = new Date().toISOString().split('T')[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (dateStr === today)     return 'Today';
  if (dateStr === yesterday) return 'Yesterday';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'short',
  });
};

export const getWeekForDate = (dateStr) => {
  const day = new Date(dateStr).getDate();
  if (day <= 7)  return 'Week 1';
  if (day <= 14) return 'Week 2';
  if (day <= 21) return 'Week 3';
  if (day <= 28) return 'Week 4';
  return 'Week 5';
};

export const offsetMonth = (ym, delta) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};


export const calcTotalIncome = (txs) =>
  txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);

export const calcTotalSpent = (txs) =>
  txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

export const calcBudgetUsedPct = (fixedSpent, fixedTotal) =>
  fixedTotal > 0 ? Math.round((fixedSpent / fixedTotal) * 100) : 0;

// Canonical budget-status thresholds, shared by the Home Budget Health bar
// (via useFinance) and the per-category Budget page rows (CategoryBudgetRow):
// amber above 70%, red above 90%. Returns CSS var tokens so both surfaces stay
// theme-aware on every skin.
export const getBudgetStatusFromBudget = (usedPct) => {
  if (usedPct > 90) return { label: 'Over Budget 🚨', color: 'var(--c-danger, #dc2626)' };
  if (usedPct > 70) return { label: 'Watch Out ⚠️',  color: 'var(--c-warning, #d97706)' };
  return                    { label: 'On Track 🎯',   color: 'var(--c-success, #059669)' };
};

export const calcSpendByDay = (txs) => {
  const m = {};
  txs.filter(t => t.type === 'expense').forEach(t => {
    m[t.date] = (m[t.date] || 0) + Number(t.amount);
  });
  return m;
};

const norm = (name) => (name || '').trim().toLowerCase();

export const calcTotalFixed = (categories = []) =>
  categories.reduce((s, c) => s + Number(c.budget_amount || 0), 0);

export const calcCategorySpend = (txs, categories = []) => {
  const map = {};
  categories.forEach(c => { map[c.name] = 0; });
  txs
    .filter(t => t.type === 'expense')
    .forEach(t => { map[t.category_name] = (map[t.category_name] || 0) + Number(t.amount); });
  return map;
};

export const calcWeeklyData = (txs, categories = [], monthlyIncome = 0) => {
  const totalFixed   = calcTotalFixed(categories);
  const weeklyFixed  = Math.round(totalFixed / 5);
  const weeklyIncome = Math.round(monthlyIncome / 5);
  return WEEKS.map(week => {
    const income   = txs.filter(t => t.week === week && t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
    const variable = txs.filter(t => t.week === week && t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
    return { week, plannedIncome: weeklyIncome, actualIncome: income, fixedExpenses: weeklyFixed, variableSpending: variable, net: income - weeklyFixed - variable };
  });
};

export const isKnownCategory = (categoryName, categories = []) =>
  categories.some(c => norm(c.name) === norm(categoryName));

export const getCategoryIcon = (categoryName, categories = []) => {
  const match = categories.find(c => norm(c.name) === norm(categoryName));
  return match?.icon || '💸';
};

export const calcFixedSpent = (txs, categories = []) =>
  txs
    .filter(t => t.type === 'expense' && isKnownCategory(t.category_name, categories))
    .reduce((s, t) => s + Number(t.amount), 0);

// budgetSpend = Σ expenses with from_spare=false (the default path)
// spareSpend  = Σ expenses with from_spare=true  (user opted out of budget)
// Spare envelope (= allIncome − fixedTotal) is reduced by two independent
// withdrawals: overflow of budgetSpend beyond fixedTotal, plus direct spareSpend.
// Reduces to Commit 1's formula when spareSpend = 0. Can go negative.
export const calcSpareMoney = (allIncome, fixedTotal, budgetSpend, spareSpend) =>
  allIncome - Math.max(fixedTotal, budgetSpend) - spareSpend;

export const calcTotalExpected = (sources) =>
  sources.reduce((s, i) => s + Number(i.expected_amount || 0), 0);

export const calcTotalReceived = (sources) =>
  sources.reduce((s, i) => s + Number(i.received_amount || 0), 0);

export const calcAvailableNow = (sources, txs) => {
  const today    = new Date();
  const received = calcTotalReceived(sources);
  const spent    = txs
    .filter(t => {
      const d = new Date(t.date);
      return t.type === 'expense'
        && d.getMonth()    === today.getMonth()
        && d.getFullYear() === today.getFullYear();
    })
    .reduce((s, t) => s + Number(t.amount), 0);
  return received - spent;
};

// ── Pay dates ─────────────────────────────────────────────────────────────────
// Every pay-day question resolves through resolvePayDate. Before it, three of them
// were answered independently and disagreed: the badge said "Flexible" while the
// subtitle right beneath it said "Last working day", and the countdown block was
// skipped entirely, because all three keyed off `pay_day` — which is NULL for a
// last-working-day source.

const UTC_DAY = 86400000;
const utcDate = (str) => new Date(`${str}T00:00:00Z`);
const ymd     = (d)   => d.toISOString().slice(0, 10);
// UTC today, matching lib/dates.getToday (not imported — finance.js takes no app imports).
const utcToday = () => new Date().toISOString().slice(0, 10);

// Last day of the calendar month containing 'YYYY-MM-DD'.
const monthLastDay = (str) => {
  const [y, m] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};

/**
 * The date a source is expected to pay WITHIN a given budget period, or null.
 *
 * The period — not the wall clock — is the frame. "Pay day 25" means the 25th OF THIS
 * PERIOD, so a period running 15 Sep – 14 Oct pays a day-25 source on 25 Sep and a
 * day-5 source on 5 Oct. Anchoring on the clock's calendar month (the old behaviour)
 * is only right when every period happens to be a calendar month.
 *
 * By pay_day_type:
 *   fixed_date       — the FIRST date inside the period whose day-of-month is pay_day,
 *                      clamped to the month's last day when pay_day overshoots (31 in a
 *                      30-day month → the 30th, the usual salary convention). Null when
 *                      the period contains no such date at all (a 1–10 Sep period has
 *                      no 25th) — that period genuinely has no pay day.
 *   last_working_day — the last Mon–Fri ON OR BEFORE the period's end_date. The period
 *                      end is the pay cycle's close, so a custom range ending Wed 14 Oct
 *                      pays on the 14th, while a calendar month ending Sat 31 Oct pays
 *                      Fri the 30th.
 *   flexible         — null, always. There is no date to compute, and keeping it null is
 *                      what lets it stay visually distinct from last_working_day.
 *
 * ⚠️ WEEKENDS ONLY — PUBLIC HOLIDAYS ARE NOT MODELLED. last_working_day walks back off
 * Saturday and Sunday and nothing else. If a Ghanaian public holiday falls on the last
 * working day, the real payment lands earlier than this returns. Modelling that needs a
 * holiday calendar with its own data source and maintenance; a documented gap is better
 * than pretend data. See docs/backlog.md.
 *
 * @param {{ pay_day?: number|null, pay_day_type?: string }} source
 * @param {{ start_date: string, end_date: string }|null} cycle — null falls back to the
 *        calendar month containing today, so a source with no period still resolves.
 * @returns {string|null} 'YYYY-MM-DD'
 */
export const resolvePayDate = (source, cycle = null) => {
  if (!source) return null;

  // No period: use the calendar month containing today, so callers without a cycle
  // (a row not yet stamped, a hub between periods) still get a sensible answer.
  const today = utcToday();
  const start = cycle?.start_date ?? `${today.slice(0, 7)}-01`;
  const end   = cycle?.end_date   ?? `${today.slice(0, 7)}-${String(monthLastDay(today)).padStart(2, '0')}`;
  if (end < start) return null;

  if (source.pay_day_type === 'last_working_day') {
    const d = utcDate(end);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);   // Sun / Sat
    const resolved = ymd(d);
    return resolved >= start ? resolved : null;   // a period made entirely of weekend days
  }

  if (!source.pay_day) return null;               // flexible, or fixed_date with no day set

  // Walk the calendar months the period touches and take the first matching day. At most
  // a handful of iterations: periods are constrained to within one year.
  let cursor = `${start.slice(0, 7)}-01`;
  while (cursor <= end) {
    const day       = Math.min(source.pay_day, monthLastDay(cursor));   // 31st → month end
    const candidate = `${cursor.slice(0, 7)}-${String(day).padStart(2, '0')}`;
    if (candidate >= start && candidate <= end) return candidate;
    const [y, m] = cursor.split('-').map(Number);
    cursor = `${new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7)}-01`;
  }
  return null;
};

/**
 * Whole days from `today` to this source's pay date in `cycle`. Negative once the date
 * has passed, null when the source has no pay date in that period.
 *
 * Both ends are UTC midnight date strings, so a pay date of TODAY is exactly 0. The old
 * implementation compared a midnight target against `new Date()` — the current instant —
 * so on the actual payday `target < today` fired, the date rolled to next month, and the
 * card read "30 days away". "Today! 🎉" was unreachable for the life of that code.
 *
 * @param {object} source
 * @param {object|null} cycle
 * @param {string} [today] — 'YYYY-MM-DD'
 * @returns {number|null}
 */
export const calcDaysUntil = (source, cycle = null, today = utcToday()) => {
  const payDate = resolvePayDate(source, cycle);
  if (!payDate) return null;
  return Math.round((utcDate(payDate) - utcDate(today)) / UTC_DAY);
};

/**
 * Display form of the next pay date: '25 Sep 2026', or 'Flexible' when the source has
 * no date in this period. Previously returned the literal 'Last working day' — a
 * SCHEDULE label, not a date — which is why wiring it up would not have helped; that
 * type now resolves to a real date like every other.
 *
 * @param {object} source
 * @param {object|null} cycle
 * @returns {string}
 */
export const fmtNextPayDate = (source, cycle = null) => {
  const payDate = resolvePayDate(source, cycle);
  if (!payDate) return 'Flexible';
  return utcDate(payDate).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
};

/**
 * Badge state for an income source in a period.
 *
 * The countdown ladder (today / soon) only means anything against the period the user is
 * actually living in, so it applies when `cycle` contains `today`; any other period
 * resolves to 'upcoming' and the UI shows a date instead of a countdown. No 'missed'
 * state: past periods render read-only cards, so it would be unreachable code.
 *
 * @param {object} source
 * @param {object|null} cycle
 * @param {string} [today] — 'YYYY-MM-DD'
 * @returns {'received'|'today'|'soon'|'upcoming'|'flexible'}
 */
export const getIncomeStatus = (source, cycle = null, today = utcToday()) => {
  if (source.received) return 'received';
  const days = calcDaysUntil(source, cycle, today);
  if (days === null) return 'flexible';

  // Outside the period we are living in, "Today!" and "Coming soon" are nonsense.
  const isCurrent = !cycle || (cycle.start_date <= today && cycle.end_date >= today);
  if (!isCurrent) return 'upcoming';

  if (days === 0)  return 'today';
  if (days > 0 && days <= 3) return 'soon';
  return 'upcoming';
};

export const INCOME_STATUS_CONFIG = {
  received: { label: 'Received ✓',  bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  today:    { label: 'Today! 🎉',   bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  soon:     { label: 'Coming soon', bg: '#ffe4e6', color: '#9f1239', border: '#fda4af' },
  upcoming: { label: 'Upcoming',    bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  flexible: { label: 'Flexible',    bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
};

/**
 * The unreceived source to chase next: the one whose pay date lands soonest in this
 * period, with flexible (dateless) sources last. Returns null when everything is in.
 *
 * Dates resolve against the PERIOD via resolvePayDate, so a last_working_day source is
 * ranked on its real date. Keying the sort on `pay_day` — which is null for that type —
 * sank the household's main salary below every ad-hoc source, as if it had no schedule.
 *
 * @param {object[]} incomes — the period's income sources
 * @param {object|null} cycle
 * @returns {object|null} the source, plus payDate ('YYYY-MM-DD'|null) and daysUntil
 */
export const pickNextUnpaid = (incomes, cycle = null) => {
  const unpaid = (incomes || []).filter(i => !i.received);
  if (!unpaid.length) return null;

  return unpaid
    .map(i => ({ ...i, payDate: resolvePayDate(i, cycle), daysUntil: calcDaysUntil(i, cycle) }))
    .sort((a, b) => {
      if (a.daysUntil === null) return 1;
      if (b.daysUntil === null) return -1;
      return a.daysUntil - b.daysUntil;
    })[0];
};

export const calcWeekSummary = (txs, week) => {
  const scoped   = week === 'All' ? txs : txs.filter(t => t.week === week);
  const expenses = scoped.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const income   = scoped.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  return { expenses, income, net: income - expenses, count: scoped.length };
};

export const groupByDate = (txs) => {
  const groups = {};
  txs.forEach(tx => {
    if (!groups[tx.date]) groups[tx.date] = [];
    groups[tx.date].push(tx);
  });
  return groups;
};

export const calcTopCategories = (txs, limit = 5) => {
  const expenses = txs.filter(t => t.type === 'expense');
  const total    = expenses.reduce((s, t) => s + Number(t.amount), 0);
  if (total === 0) return [];
  const map = {};
  expenses.forEach(t => { map[t.category_name] = (map[t.category_name] || 0) + Number(t.amount); });
  return Object.entries(map)
    .map(([category, amount]) => ({ category, amount, pct: Math.round((amount / total) * 100) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
};
