import { useState } from 'react';
import { fmtDate, calcDaysUntil, fmtNextPayDate, getIncomeStatus, INCOME_STATUS_CONFIG } from '../lib/finance';
import { useHouseholdContext } from '../context/HouseholdContext';
import { cardStyle } from '../components/ui';
import { EditExpectedModal } from '../components/modals/EditExpectedModal';

function MarkReceivedForm({ income, fmt, onConfirm, onCancel }) {
  const today = new Date().toISOString().split('T')[0];
  const [amount, setAmount] = useState(String(income.expectedAmount));
  const [date,   setDate]   = useState(today);
  const handle = () => onConfirm(income.id, parseFloat(amount) || income.expectedAmount, date);
  return (
    <div style={{ background: '#f5f3ff', borderRadius: 12, padding: '12px 14px' }}>
      <p style={{ fontWeight: 800, fontSize: 13, color: '#4c1d95', margin: '0 0 10px' }}>Confirm receipt</p>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)}
          style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1.5px solid #ddd6fe', fontSize: 13, fontWeight: 600, outline: 'none', background: '#fff' }} />
        <input type="date" value={date} max={today} onChange={e => setDate(e.target.value)}
          style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1.5px solid #ddd6fe', fontSize: 13, fontWeight: 600, outline: 'none', background: '#fff' }} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={handle} style={{ flex: 2, padding: '10px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>Confirm Received</button>
        <button onClick={onCancel} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid #e5e7eb', background: '#fff', fontWeight: 800, fontSize: 13, cursor: 'pointer', color: '#6b7280' }}>Cancel</button>
      </div>
    </div>
  );
}

function IncomeCard({ income, fmt, onMarkReceived, onMarkPending, onUpdateExpected }) {
  const [confirming, setConfirming] = useState(false);
  const [editing,    setEditing]    = useState(false);
  const status = getIncomeStatus(income);
  const cfg    = INCOME_STATUS_CONFIG[status];
  const days   = calcDaysUntil(income.expectedPayDay);

  return (
    <div style={{ ...cardStyle, borderLeft: '4px solid ' + cfg.border }}>
      {editing && <EditExpectedModal income={income} fmt={fmt} onSave={onUpdateExpected} onClose={() => setEditing(false)} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{income.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontWeight: 900, fontSize: 15, color: '#1c1917', margin: 0 }}>{income.source}</p>
            <span style={{ fontSize: 11, fontWeight: 800, padding: '2px 9px', borderRadius: 20, background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
          </div>
          {income.notes && <p style={{ fontSize: 11, color: '#9ca3af', margin: '2px 0 0' }}>{income.notes}</p>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div style={{ background: '#f9fafb', borderRadius: 12, padding: '10px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <p style={{ fontSize: 10, color: '#9ca3af', margin: 0 }}>Expected</p>
            <button onClick={() => setEditing(true)} title="Edit expected amount"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}>✏️</button>
          </div>
          <p style={{ fontSize: 16, fontWeight: 900, color: '#1c1917', margin: 0 }}>{fmt(income.expectedAmount)}</p>
        </div>
        <div style={{ background: income.received ? '#f0fdf4' : '#f9fafb', borderRadius: 12, padding: '10px 12px' }}>
          <p style={{ fontSize: 10, color: '#9ca3af', margin: '0 0 2px' }}>Received</p>
          <p style={{ fontSize: 16, fontWeight: 900, color: income.received ? '#059669' : '#9ca3af', margin: 0 }}>
            {income.received ? fmt(income.receivedAmount) : '—'}
          </p>
        </div>
      </div>

      {!income.received && income.expectedPayDay && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: '#f5f3ff', borderRadius: 10, padding: '8px 12px' }}>
          <span style={{ fontSize: 16 }}>🗓</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#5b21b6', margin: 0 }}>Next pay: {fmtNextPayDate(income)}</p>
            {days !== null && <p style={{ fontSize: 11, color: '#7c3aed', margin: '1px 0 0' }}>{days === 0 ? 'Due today!' : days === 1 ? 'Due tomorrow' : days + ' days away'}</p>}
          </div>
        </div>
      )}

      {income.received && income.actualPayDate && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, background: '#f0fdf4', borderRadius: 10, padding: '8px 12px' }}>
          <span style={{ fontSize: 16 }}>✅</span>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#065f46', margin: 0 }}>Received on {fmtDate(income.actualPayDate)}</p>
        </div>
      )}

      {!income.received ? (
        confirming ? (
          <MarkReceivedForm income={income} fmt={fmt} onConfirm={(id, amt, date) => { onMarkReceived(id, amt, date); setConfirming(false); }} onCancel={() => setConfirming(false)} />
        ) : (
          <button onClick={() => setConfirming(true)} style={{ width: '100%', padding: '12px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>Mark as Received</button>
        )
      ) : (
        <button onClick={() => onMarkPending(income.id)} style={{ width: '100%', padding: '10px', borderRadius: 12, border: '1.5px solid #d1d5db', background: '#fff', fontSize: 12, fontWeight: 700, color: '#9ca3af', cursor: 'pointer' }}>Undo — Mark as Pending</button>
      )}
    </div>
  );
}

export function PaydayView({ incomes, txs, totalExpected, totalReceived, availableNow, onMarkReceived, onMarkPending, onUpdateExpected }) {
  const { fmt } = useHouseholdContext();
  const totalPending = totalExpected - totalReceived;
  const receivedPct  = totalExpected > 0 ? Math.round((totalReceived / totalExpected) * 100) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'linear-gradient(145deg,#1e1b4b,#3730a3)', borderRadius: 20, padding: '20px', color: '#fff' }}>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 3, color: '#a5b4fc', textTransform: 'uppercase', margin: '0 0 4px' }}>Available Right Now</p>
        <p style={{ fontSize: 38, fontWeight: 900, margin: '0 0 4px', lineHeight: 1, color: availableNow < 0 ? '#fca5a5' : '#fff' }}>{fmt(Math.max(0, availableNow))}</p>
        <p style={{ fontSize: 12, color: '#a5b4fc', margin: '0 0 14px' }}>{fmt(totalReceived)} received · spend tracked this month</p>
        <div style={{ background: 'rgba(255,255,255,.15)', borderRadius: 6, height: 8, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ width: String(receivedPct) + '%', height: '100%', background: '#818cf8', borderRadius: 6, transition: 'width .5s' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
          {[['Received', fmt(totalReceived), '#4ade80'], ['Pending', fmt(totalPending), '#fbbf24'], ['Expected', fmt(totalExpected), '#a5b4fc']].map(([l, v, c]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,.1)', borderRadius: 10, padding: '8px 10px' }}>
              <p style={{ fontSize: 9, color: '#a5b4fc', margin: 0 }}>{l}</p>
              <p style={{ fontSize: 13, fontWeight: 900, color: c, margin: '2px 0 0' }}>{v}</p>
            </div>
          ))}
        </div>
      </div>
      <p style={{ fontWeight: 900, fontSize: 15, color: '#1c1917', margin: '2px 0 0' }}>Income Sources</p>
      {incomes.map(income => (
        <IncomeCard key={income.id} income={income} fmt={fmt} onMarkReceived={onMarkReceived} onMarkPending={onMarkPending} onUpdateExpected={onUpdateExpected} />
      ))}
    </div>
  );
}
