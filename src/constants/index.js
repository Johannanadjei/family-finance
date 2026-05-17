/** Fixed expense categories matching the family spreadsheet */
export const FIXED_EXPENSES = [
  { id: 1,  category: 'Rent',               budget: 2500,  icon: '🏠', notes: 'Housing' },
  { id: 2,  category: 'Food',               budget: 8000,  icon: '🛒', notes: 'Groceries & household food' },
  { id: 3,  category: 'Levi Activities',    budget: 4110,  icon: '⚽', notes: 'Child activity budget' },
  { id: 4,  category: 'Elijah Driver',      budget: 2200,  icon: '🚗', notes: 'School transport' },
  { id: 5,  category: 'Elijah School Fees', budget: 5500,  icon: '📚', notes: 'Education' },
  { id: 6,  category: 'Aliyah Activities',  budget: 1200,  icon: '🎨', notes: 'Child activity budget' },
  { id: 7,  category: 'Family Activities',  budget: 3000,  icon: '🎉', notes: 'Family outings & fun' },
  { id: 8,  category: 'Medicine',           budget: 1000,  icon: '💊', notes: 'Healthcare' },
  { id: 9,  category: 'Nanny',              budget: 3400,  icon: '👶', notes: 'Childcare support' },
  { id: 10, category: 'Gas',                budget: 400,   icon: '🔥', notes: 'Gas for the cooker' },
  { id: 11, category: 'Water',              budget: 400,   icon: '💧', notes: 'Water bill' },
  { id: 12, category: 'Data',               budget: 800,   icon: '📱', notes: 'Phones & internet' },
  { id: 13, category: 'Nails',              budget: 1000,  icon: '💅', notes: 'Nails — Eddieta Adjei' },
  { id: 14, category: 'Hair cuts',          budget: 700,   icon: '✂️', notes: 'Adjei hair cuts' },
  { id: 15, category: 'Kids hair products', budget: 800,   icon: '🧴', notes: 'Kids hair care' },
  { id: 16, category: 'Dita upkeep',        budget: 1500,  icon: '💇', notes: 'Hair & wax' },
  { id: 17, category: 'Uber for girls',     budget: 360,   icon: '🚕', notes: 'Travel for staff' },
  { id: 18, category: 'Electricity',        budget: 2000,  icon: '⚡', notes: 'Utilities' },
  { id: 19, category: 'Transport',          budget: 1500,  icon: '🚌', notes: 'Travel / fuel / commuting' },
];

export const WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5'];

export const INCOME_CATS = ['Salary', 'Side Income', 'Bonus', 'Freelance', 'Other Income'];

export const EXPENSE_CATS = [...FIXED_EXPENSES.map(e => e.category), 'Other'];

export const NOTIF_DEFAULTS = {
  newPayment:         true,
  categoryOverspent:  true,
  spreadsheetUpdate:  false,
  weeklySummary:      true,
  monthlySummary:     true,
};
