import { Plus } from 'lucide-react';

export function FAB({ onClick }) {
  return (
    <button
      onClick={onClick}
      aria-label="Add payment"
      style={{
        position: 'fixed', bottom: 78, right: 'calc(50% - 220px + 16px)',
        width: 54, height: 54, borderRadius: '50%',
        background: 'linear-gradient(135deg,#f59e0b,#d97706)',
        border: 'none', cursor: 'pointer', zIndex: 30,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 4px 16px rgba(245,158,11,.5)',
      }}
    >
      <Plus size={24} color="#fff" strokeWidth={3} />
    </button>
  );
}
