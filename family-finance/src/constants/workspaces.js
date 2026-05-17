/** Workspace types — each maps to a different financial context */
export const WORKSPACE_TYPES = [
  {
    id:      'home',
    label:   'Home & Family',
    icon:    '🏡',
    color:   '#064e3b',
    accent:  '#6ee7b7',
    desc:    'Household income, budgets and expenses',
  },
  {
    id:      'business',
    label:   'Business / Shop',
    icon:    '🏪',
    color:   '#1e3a5f',
    accent:  '#93c5fd',
    desc:    'Track shop revenue and operating costs',
  },
  {
    id:      'overseas',
    label:   'Overseas Residence',
    icon:    '✈️',
    color:   '#4c1d95',
    accent:  '#c4b5fd',
    desc:    'Expenses and income in another country',
  },
  {
    id:      'investment',
    label:   'Investment Portfolio',
    icon:    '📈',
    color:   '#78350f',
    accent:  '#fcd34d',
    desc:    'Track assets, returns and contributions',
  },
  {
    id:      'rental',
    label:   'Rental Property',
    icon:    '🏘️',
    color:   '#0c4a6e',
    accent:  '#7dd3fc',
    desc:    'Rental income, maintenance and costs',
  },
  {
    id:      'custom',
    label:   'Custom',
    icon:    '📌',
    color:   '#374151',
    accent:  '#d1d5db',
    desc:    'Any other financial tracking need',
  },
];

/** Plan limits */
export const PLAN_LIMITS = {
  free:    { workspaces: 1 },
  premium: { workspaces: 10 },
};

/** Currencies available per workspace */
export const CURRENCIES = [
  { code: 'GHS', symbol: '₵',  name: 'Ghana Cedi',        flag: '🇬🇭' },
  { code: 'USD', symbol: '$',  name: 'US Dollar',          flag: '🇺🇸' },
  { code: 'GBP', symbol: '£',  name: 'British Pound',      flag: '🇬🇧' },
  { code: 'EUR', symbol: '€',  name: 'Euro',               flag: '🇪🇺' },
  { code: 'NGN', symbol: '₦',  name: 'Nigerian Naira',     flag: '🇳🇬' },
  { code: 'KES', symbol: 'KSh',name: 'Kenyan Shilling',    flag: '🇰🇪' },
  { code: 'ZAR', symbol: 'R',  name: 'South African Rand', flag: '🇿🇦' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar',    flag: '🇨🇦' },
];
