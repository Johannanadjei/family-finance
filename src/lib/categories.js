/**
 * categories.js
 *
 * Pure utility functions for budget category operations.
 * No React, no side effects, no API calls.
 *
 * Reusable across onboarding, budget view, guest portal, and add modal.
 */

/**
 * Normalise a category name for comparison.
 * Trims whitespace, lowercases, collapses repeated spaces.
 * @param {string} name
 * @returns {string}
 */
const normalise = (name) =>
  name.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Detect if a new category is a duplicate of an existing one.
 *
 * Match types:
 *   'name_and_amount' — same normalised name AND same amount
 *   'name'            — same normalised name only
 *   null              — no duplicate found
 *
 * @param {{ name: string, budget_amount: number }} newCat
 * @param {Array<{ name: string, budget_amount: number }>} existingCats
 * @returns {{ isDuplicate: boolean, matchType: 'name_and_amount'|'name'|null, matchedCategory: object|null }}
 */
export const detectDuplicateBudgetCategory = (newCat, existingCats) => {
  const normNew = normalise(newCat.name);

  for (const cat of existingCats) {
    const normExisting = normalise(cat.name);
    if (normExisting !== normNew) continue;

    const amountMatch = Number(cat.budget_amount) === Number(newCat.budget_amount);

    return {
      isDuplicate:     true,
      matchType:       amountMatch ? 'name_and_amount' : 'name',
      matchedCategory: cat,
    };
  }

  return { isDuplicate: false, matchType: null, matchedCategory: null };
};
