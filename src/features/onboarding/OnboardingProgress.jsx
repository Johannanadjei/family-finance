/**
 * features/onboarding/OnboardingProgress.jsx
 *
 * Step progress indicator for the onboarding flow.
 * Pure display component — no state, no side effects.
 *
 * @param {number} currentStep — 0-indexed current step
 * @param {number} totalSteps  — total number of steps
 * @param {string[]} steps     — step labels array
 */

export function OnboardingProgress({ currentStep, totalSteps, steps }) {
  return (
    <div
      role="progressbar"
      aria-valuenow={currentStep + 1}
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-label={`Step ${currentStep + 1} of ${totalSteps}: ${steps[currentStep]}`}
      style={{ marginBottom: 28 }}
    >
      {/* Step dots */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
        {steps.map((step, i) => (
          <div
            key={step}
            title={step}
            style={{
              width:        i === currentStep ? 24 : 8,
              height:       8,
              borderRadius: 4,
              background:   i < currentStep  ? '#059669'
                          : i === currentStep ? '#064e3b'
                          : '#e5e7eb',
              transition:   'all .3s ease',
            }}
          />
        ))}
      </div>

      {/* Step label */}
      <p style={{
        textAlign:   'center',
        fontSize:    12,
        fontWeight:  700,
        color:       '#6b7280',
        margin:      0,
        letterSpacing: 1,
        textTransform: 'uppercase',
      }}>
        Step {currentStep + 1} of {totalSteps} — {steps[currentStep]}
      </p>
    </div>
  );
}
