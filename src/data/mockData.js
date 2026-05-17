/**
 * MOCK DATA — Replace with Google Sheets / Firebase API calls.
 *
 * Google Sheets sync point:
 *   GET https://sheets.googleapis.com/v4/spreadsheets/{SHEET_ID}/values/A1:Z100
 *   Map rows → HOUSEHOLD and INITIAL_TXS
 *
 * Firebase sync point:
 *   const snap = await getDocs(collection(db, 'families', familyId, 'transactions'));
 *   const INITIAL_TXS = snap.docs.map(d => ({ id: d.id, ...d.data() }));
 */

export const HOUSEHOLD = {
  name:          'Adjei Family',
  monthlyIncome: 45000,
  adults:        2,
  children:      3,
  surplusTarget: 4630,
  month:         'May 2026',
  currency:      'GHS',
  familyId:      'adjei-family-001',
};

/** Seed transactions — mirrors the spreadsheet Transaction Log */
export const INITIAL_TXS = [
  { id: 1, date: '2026-05-05', week: 'Week 1', type: 'Income',  category: 'Salary',          description: 'Main household income',  amount: 9000, source: 'main_app' },
  { id: 2, date: '2026-05-06', week: 'Week 1', type: 'Expense', category: 'Food',             description: 'Weekly groceries',       amount: 1200, source: 'main_app' },
  { id: 3, date: '2026-05-07', week: 'Week 1', type: 'Expense', category: 'Transport',        description: 'Fuel top up',            amount: 300,  source: 'main_app' },
  { id: 4, date: '2026-05-07', week: 'Week 1', type: 'Expense', category: 'Elijah Driver',    description: 'Driver weekly fee',      amount: 550,  source: 'main_app' },
  { id: 5, date: '2026-05-12', week: 'Week 2', type: 'Income',  category: 'Salary',           description: 'Main household income',  amount: 9000, source: 'main_app' },
  { id: 6, date: '2026-05-13', week: 'Week 2', type: 'Expense', category: 'Medicine',         description: 'Pharmacy run',           amount: 450,  source: 'main_app' },
  { id: 7, date: '2026-05-14', week: 'Week 2', type: 'Expense', category: 'Food',             description: 'Groceries & snacks',     amount: 900,  source: 'main_app' },
  { id: 8, date: '2026-05-15', week: 'Week 2', type: 'Expense', category: 'Levi Activities',  description: 'Football registration',  amount: 800,  source: 'main_app' },
];

/**
 * Payday income sources — mirrors the Pay-Date Income Tracker spreadsheet tab.
 * GOOGLE SHEETS SYNC POINT: Map 'Pay-Date Income Tracker' rows to this shape.
 * FIREBASE SYNC POINT: collection(db, 'families', familyId, 'incomes')
 */
export const INITIAL_INCOMES = [
  {
    id:             1,
    source:         'Adult 1 Salary',
    icon:           '👩',
    expectedAmount: 15000,
    receivedAmount: 0,
    expectedPayDay: 25,
    payDayType:     'fixed',
    notes:          'Paid on the 25th of each month',
    received:       false,
    actualPayDate:  null,
  },
  {
    id:             2,
    source:         'Adult 2 Salary',
    icon:           '👨',
    expectedAmount: 30000,
    receivedAmount: 0,
    expectedPayDay: 28,
    payDayType:     'last_working',
    notes:          'Paid on the last working day of the month',
    received:       false,
    actualPayDate:  null,
  },
  {
    id:             3,
    source:         'Other Income',
    icon:           '💼',
    expectedAmount: 0,
    receivedAmount: 0,
    expectedPayDay: null,
    payDayType:     'custom',
    notes:          'Optional extra income or side earnings',
    received:       false,
    actualPayDate:  null,
  },
];

/**
 * Guest access settings.
 * FIREBASE SYNC POINT: doc(db, 'families', familyId, 'guestSettings')
 */
export const GUEST_DEFAULTS = {
  enabled:           false,
  pin:               '1234',
  label:             'Household Staff Portal',
  allowedCategories: [],
};
