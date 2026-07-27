/**
 * views/auth/ResetPasswordForm.jsx
 *
 * Pure display half of ResetPasswordScreen: masked identity, the two password
 * fields, the error slot and the submit button. Owns no state and performs no
 * validation — the screen holds all of it and passes results down (CLAUDE.md §4).
 */

const inputStyle = {
  width: '100%', padding: '14px 16px', borderRadius: 12, fontSize: 15, fontWeight: 600, outline: 'none',
  border: '1.5px solid var(--c-input-border, #e5e7eb)', background: 'var(--c-input-bg, #f9fafb)',
  boxSizing: 'border-box', fontFamily: "'Nunito', sans-serif", color: 'var(--c-text, #1c1917)',
};

export function ResetPasswordForm({
  maskedEmail, password, confirm, error, submitting,
  onPasswordChange, onConfirmChange, onSubmit,
}) {
  return (
    <>
      <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-muted, #6b7280)', margin: '0 0 20px', textAlign: 'center', lineHeight: 1.5 }}>
        Resetting password for{' '}
        <strong data-testid="reset-masked-email" style={{ color: 'var(--c-text, #1c1917)' }}>{maskedEmail}</strong>
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          data-testid="reset-password-input" type="password"
          placeholder="New password"
          value={password}
          onChange={e => onPasswordChange(e.target.value)}
          style={inputStyle}
          autoComplete="new-password"
        />
        <input
          data-testid="reset-confirm-input" type="password"
          placeholder="Confirm new password"
          value={confirm}
          onChange={e => onConfirmChange(e.target.value)}
          style={inputStyle}
          autoComplete="new-password"
        />

        {error && (
          <div style={{ background: 'var(--c-danger-bg, #fef2f2)', borderRadius: 10, padding: '12px 14px' }}>
            <p data-testid="reset-error" style={{ fontSize: 13, fontWeight: 700, color: 'var(--c-danger, #dc2626)', margin: 0 }}>{error}</p>
          </div>
        )}

        <button
          data-testid="reset-submit-btn"
          onClick={onSubmit}
          disabled={submitting}
          style={{
            width: '100%', padding: '15px', borderRadius: 12, border: 'none', fontSize: 15, fontWeight: 800,
            cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
            background: 'var(--c-primary, #064e3b)', color: 'var(--c-btn-text, #ffffff)',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </div>
    </>
  );
}
