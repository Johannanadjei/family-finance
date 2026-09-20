/**
 * api/paystack/_guards.js — fail-closed configuration guards for the Paystack routes.
 *
 * Not a route. The leading underscore is what keeps Vercel from serving this file as a
 * serverless function; it is imported by checkout.js and webhook.js.
 *
 * ── WHY THESE EXIST ─────────────────────────────────────────────────────────
 * The go-live review (docs/paystack-golive-review-2026-09-20.md §5) found that NOTHING
 * in this codebase decides test vs live. The mode is implicit in the value of
 * PAYSTACK_SECRET_KEY in whichever Vercel environment the function happens to be
 * running in: no prefix check, no env flag, no log line. The separation of Preview
 * (test key) from Production (live key) was a dashboard convention with no code behind
 * it, and a single "apply to all environments" click could undo it silently — a preview
 * deploy would then charge real cards, and nothing would say so.
 *
 * These two assertions put the convention in code. They are deliberately fail-closed:
 * a route that cannot prove its configuration is safe refuses to run rather than
 * guessing, on the same reasoning as scripts/vercel-ignore-build.mjs (the cost of a
 * false refusal is a config fix; the cost of a false accept is real money moving
 * through the wrong environment, and those are not symmetric).
 *
 * They read process.env by default but take an explicit `env` so tests do not have to
 * mutate global state.
 */

/** Thrown by both guards. `code` is stable and safe to log; `message` explains the fix. */
export class PaystackConfigError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PaystackConfigError';
    this.code = code;
  }
}

const LIVE_KEY_PREFIX = 'sk_live_';
const PLAN_CODE_SHAPE = /^PLN_/;

/**
 * Refuse to run a live secret key anywhere but production.
 *
 * VERCEL_ENV is injected by Vercel as 'production' | 'preview' | 'development'. It is
 * ABSENT in local dev and in CI — which is intentional here: an absent value is not
 * 'production', so a live key on a laptop or in a test runner is refused too. The check
 * is one-directional by design: a TEST key in production is not blocked, because that
 * is the safe failure (nothing charges) and blocking it would take the whole product
 * down over a reversible mistake. Only live-key-outside-production can move real money
 * from the wrong place, so only that is fatal.
 *
 * @param {Record<string,string|undefined>} [env] — defaults to process.env
 * @throws {PaystackConfigError} code 'live_key_outside_production'
 */
export function assertLiveKeyOnlyInProduction(env = process.env) {
  const secret    = env.PAYSTACK_SECRET_KEY || '';
  const vercelEnv = env.VERCEL_ENV;

  if (!secret.startsWith(LIVE_KEY_PREFIX)) return;   // test key, or unset — not our concern
  if (vercelEnv === 'production') return;            // live key, production — correct

  throw new PaystackConfigError(
    'live_key_outside_production',
    `Refusing to run: PAYSTACK_SECRET_KEY is a LIVE key (${LIVE_KEY_PREFIX}…) but VERCEL_ENV is ` +
    `"${vercelEnv ?? '(unset)'}", not "production". A live key outside production can charge real ` +
    `cards from a preview or local deploy. Fix the Vercel environment variable scoping: the live ` +
    `key belongs to Production ONLY, and Preview/Development must each hold their own sk_test_ value. ` +
    `See docs/go-live-runbook.md §4.`,
  );
}

/**
 * Refuse to run with plan codes that cannot both be right.
 *
 * Catches the failure the runbook calls out as invisible at purchase time (§6.10): if
 * the monthly and annual env vars hold the SAME code, checkout still succeeds and the
 * first charge still reads the correct amount, because checkout.js sends `amount` from
 * PRICING alongside `plan`. The mismatch only surfaces at RENEWAL, on a paying
 * customer's card — an annual buyer renewing at ₵40/month, or a monthly buyer at
 * ₵400/year. Nothing else in the system can detect that, so it is asserted here.
 *
 * Also checks the PLN_ shape, which catches the commoner slip of pasting a plan NAME,
 * a subscription code (SUB_…) or a truncated value into the variable.
 *
 * Missing codes are treated as a configuration error rather than a bad request: an
 * unset plan code is a server-side omission, not something the caller did wrong.
 *
 * Only checkout.js needs this — the webhook never reads plan codes; it records whatever
 * plan_code Paystack echoes back on the event.
 *
 * @param {Record<string,string|undefined>} [env] — defaults to process.env
 * @throws {PaystackConfigError} codes 'plan_code_missing' | 'plan_code_malformed' | 'plan_codes_identical'
 */
export function assertPlanCodesDistinct(env = process.env) {
  const monthly = env.PAYSTACK_PLAN_CODE_MONTHLY;
  const annual  = env.PAYSTACK_PLAN_CODE_ANNUAL;

  const missing = [
    !monthly && 'PAYSTACK_PLAN_CODE_MONTHLY',
    !annual  && 'PAYSTACK_PLAN_CODE_ANNUAL',
  ].filter(Boolean);
  if (missing.length) {
    throw new PaystackConfigError(
      'plan_code_missing',
      `Refusing to run: ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} unset. ` +
      `Both plan codes must be configured for this environment. See docs/go-live-runbook.md §4.`,
    );
  }

  const malformed = [
    !PLAN_CODE_SHAPE.test(monthly) && 'PAYSTACK_PLAN_CODE_MONTHLY',
    !PLAN_CODE_SHAPE.test(annual)  && 'PAYSTACK_PLAN_CODE_ANNUAL',
  ].filter(Boolean);
  if (malformed.length) {
    throw new PaystackConfigError(
      'plan_code_malformed',
      `Refusing to run: ${malformed.join(' and ')} ${malformed.length > 1 ? 'do' : 'does'} not look ` +
      `like a Paystack plan code (expected to start with "PLN_"). Check for a pasted plan name, a ` +
      `SUB_ subscription code, or a truncated value.`,
    );
  }

  if (monthly === annual) {
    throw new PaystackConfigError(
      'plan_codes_identical',
      `Refusing to run: PAYSTACK_PLAN_CODE_MONTHLY and PAYSTACK_PLAN_CODE_ANNUAL hold the same value. ` +
      `One of them is wrong. This is invisible at purchase — the first charge reads the correct amount ` +
      `either way — and only surfaces at renewal, on a real customer's card. See docs/go-live-runbook.md §6.10.`,
    );
  }
}
