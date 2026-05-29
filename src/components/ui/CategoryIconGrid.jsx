/**
 * components/ui/CategoryIconGrid.jsx
 *
 * Shared inline emoji grid for choosing a budget-category icon.
 * Used by AddCategorySheet (always visible) and StepCategories (per-row, tap
 * to open). Pure display: receives the selected `value` and an `onSelect`
 * callback — owns no state, performs no formatting.
 *
 * @param {string}   value     — currently selected icon (highlighted)
 * @param {function} onSelect  — (icon) => void, called when an icon is tapped
 */

export const CATEGORY_ICONS = ['🏠','🚗','🛒','💡','💧','📱','🎓','🏥','🎯','✈️','🎉','💰','🏋️','🐾','💸'];

export function CategoryIconGrid({ value, onSelect }) {
  return (
    <div role="group" aria-label="Category icons" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {CATEGORY_ICONS.map(i => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          aria-label={`Use icon ${i}`}
          aria-pressed={value === i}
          style={{
            width: 36, height: 36, borderRadius: 8, border: 'none', fontSize: 18, cursor: 'pointer',
            background: value === i ? 'var(--c-primary, #064e3b)' : 'var(--c-chip-bg, #f3f4f6)',
          }}
        >
          {i}
        </button>
      ))}
    </div>
  );
}
