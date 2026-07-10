/**
 * scripts/vercel-ignore-build.mjs
 *
 * Vercel "Ignored Build Step" gate: makes a PRODUCTION deploy wait for CI and
 * proceed only if CI is green for the exact commit being deployed. Previews
 * (any ref other than `main`) build freely.
 *
 * Vercel runs this BEFORE install/build, from the repo root, in the build image.
 * That image has `node` and `git` but NOT the project's npm deps and NOT `jq`,
 * so this uses only Node stdlib + global fetch. Requires Node 18+.
 *
 * ── EXIT CODE CONVENTION (Vercel's, and it is the opposite of intuition) ──
 *   exit 1  → PROCEED with the build / deploy
 *   exit 0  → CANCEL the build / skip the deploy
 *   Mnemonic: same as `git diff --quiet HEAD^ HEAD` — "exit 1 = there's
 *   something to deploy". Do not flip these.
 *
 * Behaviour on `main`:
 *   CI all-success  → exit 1 (deploy)
 *   CI any-failure  → exit 0 (skip)
 *   still running at timeout → exit 0 (skip — FAIL CLOSED)
 *   no checks by timeout     → exit 0 (skip — FAIL CLOSED)
 *   missing token / SHA      → exit 0 (skip — FAIL CLOSED, loud)
 *
 * Fail-closed rationale: an unverified commit must never reach production. The
 * cost of a false skip is a manual Vercel "Redeploy" once CI is green; the cost
 * of a false deploy is shipping red code. Those are not symmetric.
 *
 * Env (provided by Vercel, except the token which you add in Vercel settings):
 *   VERCEL_GIT_COMMIT_REF  — branch name
 *   VERCEL_GIT_COMMIT_SHA  — commit being deployed
 *   GH_CHECKS_TOKEN        — GitHub fine-grained PAT, Checks:read on this repo
 */

const REPO             = 'Johannanadjei/family-finance';
const POLL_INTERVAL_MS = 15_000;
const TIMEOUT_MS       = 5 * 60_000;

const PROCEED = 1; // Vercel: build
const SKIP    = 0; // Vercel: cancel

const ref   = process.env.VERCEL_GIT_COMMIT_REF;
const sha   = process.env.VERCEL_GIT_COMMIT_SHA;
const token = process.env.GH_CHECKS_TOKEN;

const log = (msg) => console.log(`[deploy-gate] ${msg}`);

// Non-production refs deploy without gating (previews build freely).
if (ref !== 'main') {
  log(`ref '${ref ?? '(unset)'}' is not production — building without CI gate.`);
  process.exit(PROCEED);
}

if (!sha) {
  log('FAIL-CLOSED: VERCEL_GIT_COMMIT_SHA unset — cannot identify the commit. Skipping deploy.');
  process.exit(SKIP);
}
if (!token) {
  log('FAIL-CLOSED: GH_CHECKS_TOKEN unset — cannot query GitHub checks. Skipping deploy.');
  log('  → If production deploys have stopped, this is the most likely cause: check the Vercel env var.');
  process.exit(SKIP);
}

const url = `https://api.github.com/repos/${REPO}/commits/${sha}/check-runs`;
const headers = {
  Authorization:         `Bearer ${token}`,
  Accept:                'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent':          'vercel-ignore-build-gate',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Only OUR CI runs — GitHub Actions posts one check run per job. Filtering by
// app slug ignores the job's exact name (rename-proof) and any non-Actions
// check (e.g. one Vercel itself might post).
async function ghActionsChecks() {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`GitHub API ${res.status} ${res.statusText}`);
  const body = await res.json();
  return (body.check_runs || []).filter((c) => c.app?.slug === 'github-actions');
}

const started = Date.now();
const expired = () => Date.now() - started > TIMEOUT_MS;
log(`Production deploy for ${sha.slice(0, 7)} — waiting for CI to conclude…`);

while (true) {
  let checks;
  try {
    checks = await ghActionsChecks();
  } catch (err) {
    if (expired()) { log(`FAIL-CLOSED: GitHub API still erroring at timeout (${err.message}) — skipping deploy.`); process.exit(SKIP); }
    log(`GitHub API error: ${err.message} — retrying.`);
    await sleep(POLL_INTERVAL_MS);
    continue;
  }

  if (checks.length === 0) {
    if (expired()) { log('FAIL-CLOSED: no CI checks registered within timeout — skipping deploy.'); process.exit(SKIP); }
    log('No CI checks registered for this commit yet — waiting…');
    await sleep(POLL_INTERVAL_MS);
    continue;
  }

  const pending = checks.filter((c) => c.status !== 'completed');
  if (pending.length > 0) {
    if (expired()) { log(`FAIL-CLOSED: CI still running at timeout (${pending.map((c) => c.name).join(', ')}) — skipping deploy.`); process.exit(SKIP); }
    log(`CI in progress — ${pending.length} check(s) pending — waiting…`);
    await sleep(POLL_INTERVAL_MS);
    continue;
  }

  const failed = checks.filter((c) => c.conclusion !== 'success');
  if (failed.length > 0) {
    log(`CI did not pass: ${failed.map((c) => `${c.name}=${c.conclusion}`).join(', ')} — skipping deploy.`);
    process.exit(SKIP);
  }

  log(`CI green (${checks.map((c) => c.name).join(', ')}) — proceeding with deploy.`);
  process.exit(PROCEED);
}
