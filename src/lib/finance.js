/**
 * lib/finance.js
 * Pure calculation functions. No mock data. No hardcoded user values.
 * All functions accept Supabase data as parameters.
 * Currency formatting created per budget centre via makeFmt().
 */

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

export const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

export const calcTotalIncome = (txs) =>
  txs.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);

export const calcTotalSpent = (txs) =>
  txs.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);

export const calcRemaining = (monthlyIncome, totalSpent) =>
  monthlyIncome - totalSpent;

export const calcHealthPct = (remaining, monthlyIncome) =>
  monthlyIncome > 0
    ? Math.max(0, Math.min(100, Math.round((remaining / monthlyIncome) * 100)))
    : 0;

export const getBudgetStatus = (remaining, surplusTarget) => {
  if (remaining > surplusTarget) return { label: 'On Track 🎯',   color: '#059669' };
  if (remaining > 0)             return { label: 'Watch Out ⚠️',  color: '#d97706' };
  return                                { label: 'Over Budget 🚨', color: '#dc2626' };
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

export const calcVariableSpent = (txs, categories = []) =>
  txs
    .filter(t => t.type === 'expense' && !isKnownCategory(t.category_name, categories))
    .reduce((s, t) => s + Number(t.amount), 0);

export const calcSurplusLeft = (monthlyIncome, totalBudgeted, variableSpent) =>
  monthlyIncome - totalBudgeted - variableSpent;

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

export const calcDaysUntil = (dayOfMonth) => {
  if (!dayOfMonth) return null;
  const today  = new Date();
  const target = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
  if (target < today) target.setMonth(target.getMonth() + 1);
  return Math.ceil((target - today) / 86400000);
};

export const fmtNextPayDate = (source) => {
  if (source.pay_day_type === 'last_working_day') return 'Last working day';
  if (!source.pay_day)                            return 'Flexible';
  const today  = new Date();
  const target = new Date(today.getFullYear(), today.getMonth(), source.pay_day);
  if (target < today) target.setMonth(target.getMonth() + 1);
  return target.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const getIncomeStatus = (source) => {
  if (source.received) return 'received';
  const days = calcDaysUntil(source.pay_day);
  if (days === null) return 'flexible';
  if (days === 0)    return 'today';
  if (days <= 3)     return 'soon';
  return 'upcoming';
};

export const INCOME_STATUS_CONFIG = {
  received: { label: 'Received ✓',  bg: '#d1fae5', color: '#065f46', border: '#6ee7b7' },
  today:    { label: 'Today! 🎉',   bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  soon:     { label: 'Coming soon', bg: '#ffe4e6', color: '#9f1239', border: '#fda4af' },
  upcoming: { label: 'Upcoming',    bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  flexible: { label: 'Flexible',    bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
};

export const calcWeekSummary = (txs, week) => {
  const scoped   = week === 'All' ? txs : txs.filter(t => t.week === week);
  const expenses = scoped.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0);
  const income   = scoped.filter(t => t.type === 'income').reduce((s, t) => s + Number(t.amount), 0);
  return { expenses, income, net: income - expenses, count: scoped.length };
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
