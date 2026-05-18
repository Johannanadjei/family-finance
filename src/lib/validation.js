/**
 * lib/validation.js
 *
 * Pure validation functions for all service layer writes.
 * Every function throws on invalid input — never returns silently.
 * Import and call at the top of every service insert/update function.
 */

const VALID_WEEKS      = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];
const VALID_CURRENCIES = ['GHS', 'USD', 'GBP', 'EUR', 'NGN', 'KES', 'ZAR', 'CAD'];
const VALID_TYPES      = ['income', 'expense'];

/**
 * Validate and round a financial amount.
 * Must be a positive finite number.
 */
export const validateAmount = (amount) => {
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error('Amount must be a number');
  if (n <= 0)              throw new Error('Amount must be greater than zero');
  return Math.round(n);
};

/**
 * Validate a date string — must be YYYY-MM-DD format and a real date.
 */
export const validateDate = (dateStr) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Date must be YYYY-MM-DD');
  const d = new Date(dateStr);
  if (isNaN(d.getTime()))                    throw new Error('Date is invalid: ' + dateStr);
  return dateStr;
};

/**
 * Validate a week label — must be one of Week 1–5.
 */
export const validateWeek = (week) => {
  if (!VALID_WEEKS.includes(week)) throw new Error('Week must be one of: ' + VALID_WEEKS.join(', '));
  return week;
};

/**
 * Validate a currency code — must be a supported currency.
 */
export const validateCurrency = (currency) => {
  if (!VALID_CURRENCIES.includes(currency)) throw new Error('Unsupported currency: ' + currency);
  return currency;
};

/**
 * Validate a transaction type.
 */
export const validateType = (type) => {
  if (!VALID_TYPES.includes(type)) throw new Error('Type must be income or expense');
  return type;
};

/**
 * Validate a non-empty string field.
 */
export const validateString = (value, field) => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(field + ' must be a non-empty string');
  }
  return value.trim();
};

/**
 * Validate a UUID string.
 */
export const validateUUID = (value, field) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(field + ' must be a valid UUID');
  }
  return value;
};

/**
 * Validate a full transaction object before insert.
 * Returns a cleaned, validated object ready for Supabase.
 */
export const validateTransaction = ({ date, week, type, category_name, amount, currency, description, logged_by_name, source }) => ({
  date:          validateDate(date),
  week:          validateWeek(week),
  type:          validateType(type),
  category_name: validateString(category_name, 'category_name'),
  amount:        validateAmount(amount),
  currency:      validateCurrency(currency),
  description:   typeof description === 'string' ? description.trim() : '',
  logged_by_name: typeof logged_by_name === 'string' ? logged_by_name.trim() : '',
  source:        ['main_app', 'guest_portal'].includes(source) ? source : 'main_app',
});

/**
 * Validate a budget category before insert or update.
 */
export const validateCategory = ({ name, icon, budget_amount, month, sort_order }) => {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Month must be YYYY-MM format');
  return {
    name:          validateString(name, 'name'),
    icon:          typeof icon === 'string' && icon.trim() ? icon.trim() : '💸',
    budget_amount: Math.round(Math.max(0, Number(budget_amount) || 0)),
    month,
    sort_order:    Number.isInteger(sort_order) ? sort_order : 0,
  };
};

/**
 * Validate an income source before insert or update.
 */
export const validateIncomeSource = ({ label, icon, expected_amount, currency, pay_day, pay_day_type, notes }) => {
  const VALID_PAY_DAY_TYPES = ['fixed_date', 'last_working_day', 'flexible'];
  return {
    label:          validateString(label, 'label'),
    icon:           typeof icon === 'string' && icon.trim() ? icon.trim() : '💰',
    expected_amount: Math.round(Math.max(0, Number(expected_amount) || 0)),
    currency:       validateCurrency(currency),
    pay_day:        pay_day ? Math.min(31, Math.max(1, parseInt(pay_day))) : null,
    pay_day_type:   VALID_PAY_DAY_TYPES.includes(pay_day_type) ? pay_day_type : 'flexible',
    notes:          typeof notes === 'string' ? notes.trim() : '',
  };
};
