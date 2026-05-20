/**
 * views/log/LogFilterBar.jsx
 *
 * Filter tabs (All / Expenses / Income) and search input for LogView.
 *
 * @param {string}   filter    — 'all' | 'expense' | 'income'
 * @param {function} onFilter  — (filter) => void
 * @param {string}   search    — current search text
 * @param {function} onSearch  — (search) => void
 */

const FILTERS = [
  { key: 'all',     label: 'All'      },
  { key: 'expense', label: 'Expenses' },
  { key: 'income',  label: 'Income'   },
];

export function LogFilterBar({ filter, onFilter, search, onSearch }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {FILTERS.map(f => {
          const isActive = filter === f.key;
          return (
            <button
              key={f.key}
              data-testid={`log-filter-${f.key}`}
              data-active={isActive ? 'true' : 'false'}
              onClick={() => onFilter(f.key)}
              style={{
                flex:         1,
                padding:      '8px 0',
                borderRadius: 10,
                border:       'none',
                background:   isActive
                  ? 'linear-gradient(135deg, var(--c-primary, #064e3b), var(--c-primary-2, #0d7060))'
                  : 'var(--c-card, #fff)',
                color:        isActive ? '#fff' : 'var(--c-muted, #6b7280)',
                fontSize:     13,
                fontWeight:   800,
                cursor:       'pointer',
                fontFamily:   "'Nunito', sans-serif",
                border:       isActive ? 'none' : '1.5px solid var(--c-border, #e5e7eb)',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <input
        data-testid="log-search-input"
        type="text"
        value={search}
        onChange={e => onSearch(e.target.value)}
        placeholder="Search by category..."
        style={{
          width:        '100%',
          padding:      '10px 14px',
          borderRadius: 10,
          border:       '1.5px solid var(--c-border, #e5e7eb)',
          fontSize:     14,
          fontWeight:   600,
          outline:      'none',
          background:   'var(--c-card, #fff)',
          boxSizing:    'border-box',
          fontFamily:   "'Nunito', sans-serif",
          color:        'var(--c-text, #1c1917)',
        }}
      />
    </div>
  );
}
