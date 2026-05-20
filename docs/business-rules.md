# Financial Business Rules
Last updated: 2026-05-20

All formula changes must follow this process:
1. Update this document first
2. Write failing tests
3. Update finance.js
4. Update useFinance.js if hook wiring changes
5. Verify tests pass
6. Verify on live app

---

## Cards and What They Show

### Income Received (Hero Card)
The total income confirmed received this month.
Formula: totalReceived = sum(income_sources.received_amount where received = true)
Shows: Amount, "of X expected", Spent, Money Left, Target

### Money Left (was "Remaining")
Cash remaining after all spending. Simple cash flow.
Formula: remaining = monthlyIncome - totalSpent
Note: uses monthlyIncome (expected) not totalReceived — stable reference regardless of when income arrives.

### Spent
All expense transactions this month regardless of category.
Formula: totalSpent = sum(transactions.amount where type = 'expense')

### Target
The user's monthly savings goal. Set during onboarding.
Source: budget_centres.surplus_target
NOT calculated — user-defined.

### Fixed Budget
The planned budget allocation across all budget categories.
This is PLANNED spend, not actual spend.
Formula: fixedTotal = sum(budget_categories.budget_amount)
Example: Rent 2500 + Electricity 2800 + Water 400 + ... = 25,400

### Variable Spending
Actual spending on categories NOT in the budget plan.
Formula: variableSpent = sum(expense transactions where category_name NOT IN budget_categories.name)
Example: "other" category = 15,000 (not a budget category)
Note: Water IS a budget category so Water spending is fixed, not variable.

### Budget Health
Percentage of monthly income remaining after all spending.
Formula: healthPct = max(0, min(100, round((remaining / monthlyIncome) * 100)))
Status thresholds:
  remaining > surplusTarget  → On Track (green)
  remaining > 0              → Watch Out (amber)
  remaining <= 0             → Over Budget (red)

---

## Removed

### Surplus Left (REMOVED)
Previously showed income - max(fixedTotal, totalSpent).
Removed because it duplicated Money Left and confused users.
"Money Left" (remaining) is the single source of truth for available cash.

---

## Category Classification

### Known / Fixed Category
A transaction is "fixed" if its category_name matches any budget_categories.name (case-insensitive).
These transactions contribute to fixedSpent.

### Unknown / Variable Category
A transaction is "variable" if its category_name does NOT match any budget_categories.name.
These transactions contribute to variableSpent.

This classification is dynamic — based on what categories the user has set up.
Adding a category to the budget plan moves its transactions from variable to fixed.

---

## Available Now (Header)
Money available to spend right now.
Formula: availableNow = totalReceived - totalSpent (expenses this month only)
Unlike Money Left, this uses totalReceived (actual money in hand).
