/**
 * views/settings/IncomeSourcesSection.jsx
 *
 * The "Income Sources" card in Settings. Reads income state from context, owns
 * which period sections are expanded, and dispatches the add / move flows.
 *
 * Income sources are scoped to a BUDGET PERIOD, keyed by `cycle_id` — never by
 * month. Sources group under a period header (the active period expanded by
 * default, others collapsible — a statement / calendar feel). Two periods can
 * start in the same calendar month, so grouping by `month` silently merged them
 * and the add-picker could only name one of the two; see docs/backlog.md
 * (income's two period keys).
 *
 * An UNALLOCATED group catches sources whose `cycle_id` matches no live period —
 * legacy mis-stamped rows and rows orphaned by a deleted period. They are invisible
 * in Payday, so the group renders expanded and every row carries a "Move to period"
 * action rather than being a dead-end heading.
 */

import { useState }               from 'react';
import { useBudgetCentreContext } from '../../context/BudgetCentreContext';
import { useFinanceContext }      from '../../context/FinanceContext';
import { fmtDate }                from '../../lib/finance';
import { formatMonth }            from '../../lib/dates';
import { IncomeSourceRow }        from './IncomeSourceRow';
import { AddIncomeSourceForm }    from './AddIncomeSourceForm';
import { MoveCycleSheet }         from '../daily/MoveCycleSheet';

const card         = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const sectionLabel = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: 0, textTransform: 'uppercase', letterSpacing: 0.8 };

// Group key for sources whose cycle_id matches no live period. Not a cycle id, so
// it can never collide with one.
const UNALLOCATED = '__unallocated__';

const periodRange = (c) => `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`;

export function IncomeSourcesSection() {
  const { fmt, centre } = useBudgetCentreContext();
  const {
    allIncomes, cycles = [], activeCycleId, loading,
    addIncomeSource, deleteIncomeSource, updateIncomeSource,
  } = useFinanceContext();

  const [addingSource,   setAddingSource]   = useState(false);
  const [showIncomeInfo, setShowIncomeInfo] = useState(false);
  // Period sections the user has toggled. Absent → the derived default below.
  const [expandedGroups, setExpandedGroups] = useState({});
  const [moveSource,     setMoveSource]     = useState(null);   // source whose move sheet is open
  const [moving,         setMoving]         = useState(false);
  const [moveError,      setMoveError]      = useState(null);

  // Live periods, newest first — both the add-picker's options and the group order.
  const livePeriods = cycles.filter(c => !c.deleted_at)
                            .slice()
                            .sort((a, b) => b.start_date.localeCompare(a.start_date));
  const periodIds   = new Set(livePeriods.map(c => c.id));

  // STUB (sequence step 2 — move-income action): swap for the real
  // moveIncomeSourceToCycle mutation, the income twin of useMoveToCycle. The UI
  // below is already wired to it, so step 2 is a one-line swap plus its tests.
  const moveIncomeSourceToCycle = async () =>
    ({ error: new Error('Moving income between periods is not wired up yet') });

  const handleMove = async (cycleId) => {
    if (!moveSource) return;
    setMoving(true);
    setMoveError(null);
    const { error } = await moveIncomeSourceToCycle(moveSource.id, cycleId);
    setMoving(false);
    setMoveSource(null);
    if (error) { setMoveError("Couldn't move this income source. Please try again."); return; }
    setExpandedGroups(prev => ({ ...prev, [cycleId]: true }));   // reveal it in its new home
  };

  // Group by cycle_id: live periods first (newest first, empty periods omitted),
  // then anything pointing at no live period — legacy month-stamped rows and rows
  // orphaned by a deleted period.
  const live    = allIncomes.filter(s => !s.deleted_at);
  const groups  = livePeriods
    .map(cycle => ({ key: cycle.id, cycle, sources: live.filter(s => s.cycle_id === cycle.id) }))
    .filter(g => g.sources.length > 0);
  const orphans = live.filter(s => !periodIds.has(s.cycle_id));
  if (orphans.length > 0) groups.push({ key: UNALLOCATED, cycle: null, sources: orphans });

  // Default-open: the active period and the (actionable) unallocated group.
  const isExpanded = (key) => expandedGroups[key] ?? (key === activeCycleId || key === UNALLOCATED);

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={sectionLabel}>Income Sources</p>
          <button onClick={() => setShowIncomeInfo(v => !v)} aria-label="Income sources info"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', color: 'var(--c-muted, #6b7280)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8v1M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <button data-testid="add-income-source-btn"
          onClick={() => setAddingSource(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-primary, #064e3b)', fontSize: 13, fontWeight: 800, padding: 0, fontFamily: "'Nunito', sans-serif" }}>
          {addingSource ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showIncomeInfo && (
        <div style={{ background: 'var(--c-accent-light, #f0fdf4)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: 0, lineHeight: 1.5 }}>
            Add a separate income source for each person contributing to this budget — e.g. your salary, your partner's salary, freelance income. Each source is tracked individually in the Payday screen.
          </p>
        </div>
      )}

      {addingSource && (
        <AddIncomeSourceForm
          periods={livePeriods}
          activeCycleId={activeCycleId}
          currency={centre?.currency}
          onSave={addIncomeSource}
          onSaved={(cycleId) => {
            setExpandedGroups(prev => ({ ...prev, [cycleId]: true }));   // reveal the new row
            setAddingSource(false);
          }}
        />
      )}

      {moveError && <p data-testid="income-move-error" style={{ fontSize: 12, color: 'var(--c-danger, #dc2626)', margin: '0 0 8px', fontWeight: 700 }}>{moveError}</p>}

      {loading
        ? <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>Loading…</p>
        : groups.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>No income sources yet</p>
          : groups.map(({ key, cycle, sources }) => {
              const expanded    = isExpanded(key);
              const unallocated = key === UNALLOCATED;
              return (
                <div key={key} data-testid={`income-period-group-${key}`}>
                  <button data-testid={`income-period-header-${key}`} aria-expanded={expanded}
                    onClick={() => setExpandedGroups(p => ({ ...p, [key]: !expanded }))}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 0', fontFamily: "'Nunito', sans-serif", textAlign: 'left' }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 900, color: unallocated ? 'var(--c-warning, #d97706)' : 'var(--c-muted, #6b7280)', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                        {unallocated ? 'Not in any period' : cycle.name}
                        {!unallocated && cycle.id === activeCycleId ? ' · This period' : ''}
                      </span>
                      {!unallocated && (
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-muted, #6b7280)' }}>{periodRange(cycle)}</span>
                      )}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--c-muted, #6b7280)' }}>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{sources.length}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9"/></svg>
                    </span>
                  </button>
                  {expanded && unallocated && (
                    <p style={{ fontSize: 12, color: 'var(--c-muted, #6b7280)', margin: '0 0 6px', lineHeight: 1.5 }}>
                      These sources aren't attached to a budget period, so they don't show up in Payday. Move each one to the period it belongs to.
                    </p>
                  )}
                  {expanded && sources.map((src, i) => (
                    <div key={src.id}>
                      <IncomeSourceRow source={src} fmt={fmt}
                        onDelete={deleteIncomeSource} onUpdate={updateIncomeSource}
                        monthLabel={unallocated && src.month ? formatMonth(src.month) : null}
                        isLast={unallocated || i === sources.length - 1} />
                      {/* Remediation affordance, unallocated rows only. Kept here rather
                          than inside IncomeSourceRow so the shared row component stays
                          untouched (and under its 200-line cap) for one rare state. */}
                      {unallocated && (
                        <button data-testid={`income-move-${src.id}`}
                          onClick={() => { setMoveError(null); setMoveSource(src); }}
                          disabled={src._optimistic === true}
                          style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', borderBottom: i === sources.length - 1 ? 'none' : '1px solid var(--c-border, #e5e7eb)', cursor: 'pointer', color: 'var(--c-primary, #064e3b)', fontSize: 12, fontWeight: 800, padding: '0 0 12px', fontFamily: "'Nunito', sans-serif" }}>
                          Move to a period →
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              );
            })
      }

      <MoveCycleSheet
        isOpen={!!moveSource}
        onClose={() => setMoveSource(null)}
        cycles={livePeriods}
        onMove={handleMove}
        moving={moving}
      />
    </div>
  );
}
