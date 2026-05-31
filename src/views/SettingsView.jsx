import { useState }                   from 'react';
import { useNavigate }                from 'react-router-dom';
import { useBudgetCentreContext }      from '../context/BudgetCentreContext';
import { useAuth }                    from '../hooks/useAuth';
import { AccessBlocked }              from '../components/ui/AccessBlocked';
import { CentreSettingsSection }      from './settings/CentreSettingsSection';
import { CategorySettingsRow }        from './settings/CategorySettingsRow';
import { IncomeSourcesSection }       from './settings/IncomeSourcesSection';
import { ThemeSection }               from './settings/ThemeSection';
import { InstallAppSection }          from './settings/InstallAppSection';
import { AddCategorySheet }           from './budget/AddCategorySheet';
import { GuestSettingsSection }       from './settings/GuestSettingsSection';
import { MembersSection }             from './settings/MembersSection';
import { SecuritySection }            from './settings/SecuritySection';

const card         = { background: 'var(--c-card, #fff)', borderRadius: 16, padding: '16px 18px', boxShadow: 'var(--c-shadow)', marginBottom: 16 };
const sectionLabel = { fontSize: 13, fontWeight: 900, color: 'var(--c-muted, #6b7280)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 0.8 };

export function SettingsView() {
  const navigate  = useNavigate();
  const { signOut }                                                            = useAuth();
  const { categories, fmt, addCategory, updateCategory, deleteCategory, can } = useBudgetCentreContext();

  const [addCatOpen,      setAddCatOpen]      = useState(false);

  if (!can('settings')) return <AccessBlocked message="Settings are only available to hub owners and full-access members." />;

  return (
    <div style={{ padding: 16, paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button onClick={() => navigate(-1)} aria-label="Go back"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-text, #1c1917)', padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <p style={{ fontSize: 20, fontWeight: 900, color: 'var(--c-text, #1c1917)', margin: 0 }}>Settings</p>
      </div>

      {/* Centre */}
      <CentreSettingsSection />

      {/* Income Sources */}
      <IncomeSourcesSection />

      {/* Budget Categories */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={{ ...sectionLabel, margin: 0 }}>Budget Categories</p>
          <button onClick={() => setAddCatOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--c-primary, #064e3b)', fontSize: 13, fontWeight: 800, padding: 0, fontFamily: "'Nunito', sans-serif" }}>
            + Add
          </button>
        </div>
        {categories.length === 0
          ? <p style={{ fontSize: 13, color: 'var(--c-muted, #6b7280)', margin: 0 }}>No categories this month</p>
          : categories.map((cat, i) => (
              <CategorySettingsRow key={cat.id} cat={cat} fmt={fmt}
                onUpdate={updateCategory} onDelete={deleteCategory}
                isLast={i === categories.length - 1} />
            ))
        }
      </div>

      {/* Members */}
      <MembersSection />

      {/* Guest Access */}
      <GuestSettingsSection />

      {/* Security (PIN) */}
      <SecuritySection />

      {/* Theme */}
      <ThemeSection />

      {/* Install App */}
      <InstallAppSection />

      {/* Sign Out */}
      <div style={card}>
        <button onClick={signOut}
          style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1.5px solid var(--c-border, #e5e7eb)', background: 'var(--c-card, #ffffff)', fontSize: 14, fontWeight: 800, cursor: 'pointer', color: 'var(--c-text, #1c1917)', fontFamily: "'Nunito', sans-serif" }}>
          Sign Out
        </button>
      </div>

      <AddCategorySheet isOpen={addCatOpen} onClose={() => setAddCatOpen(false)} onAdd={addCategory} />
    </div>
  );
}
