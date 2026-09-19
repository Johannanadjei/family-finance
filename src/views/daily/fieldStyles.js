/**
 * views/daily/fieldStyles.js
 *
 * The shared text-input style for the transaction sheet and its sub-fields.
 * Extracted when IncomeSourcePicker landed (#4b) and AddTransactionSheet crossed
 * its 200-line cap — the two had identical copies, so sharing removes a drift
 * risk as well as the lines. Style constant only, no logic.
 */

export const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1.5px solid var(--c-border, #e5e7eb)', fontSize: 15, fontWeight: 700,
  outline: 'none', background: 'var(--c-input-bg, #f9fafb)', boxSizing: 'border-box',
  fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
};
