# CI Setup

`.github/workflows/ci.yml` — one job, `Test, Audit & E2E`, on `ubuntu-latest`.

---

## What runs, and in what order

Steps in a GitHub Actions job are sequential and abort on the first failure. The order is
deliberate: the cheap gates run before the expensive ones, so a broken unit test costs ~2
minutes instead of ~4.

1. `npm ci`
2. `npm test` — the vitest suite
3. `bash scripts/audit.sh` — the pattern audit
4. Resolve the Playwright version, restore the browser cache
5. Install Chromium system libraries, then the binary (binary only on a cache miss)
6. `npm run test:e2e` — Playwright, against the real Supabase project
7. On failure only: upload `playwright-report/` + `test-results/` as an artifact (7 days)

## Triggers

| Event | Branches | Notes |
|---|---|---|
| `push` | `main`, `staging`, `dev` | Skipped for commits touching only `docs/**` or `**/*.md` |
| `pull_request` | `main`, `staging` | **No** path filter — see below |

`paths-ignore` is deliberately absent from `pull_request`. A job skipped by a path filter never
reports a status, so if this check is ever made **required** in branch protection, a docs-only PR
would sit forever on *"Expected — Waiting for status to be reported."* PRs are rare; running them
unconditionally costs little and avoids the deadlock.

`concurrency` cancels an in-flight run when a newer commit lands on the same ref.

---

## Required repository secrets

Set at **Settings → Secrets and variables → Actions**:

| Secret | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | The dev server's Supabase origin, and the origin the §0 write-rail matches against. `test-base.js` refuses to run if unset. |
| `VITE_SUPABASE_ANON_KEY` | The dev server's Supabase key. |
| `E2E_FIXTURE_PASSWORD` | The shared fixture password — see `fixture-accounts.md`. |

**Paste `E2E_FIXTURE_PASSWORD` raw, with no surrounding quotes.** The single quotes required in a
local `.env` exist only because dotenv treats an unquoted `#` as an inline comment. GitHub Actions
secrets are literal values; quoting one embeds the quote characters and the fixture sign-in fails
with `Incorrect email or password`.

`VITE_SUPABASE_ANON_KEY` is not meaningfully secret — it ships inside the client bundle on every
deploy. Storing it as a repository secret keeps the workflow uniform; its exposure is not an incident.

---

## The cache, and why `install-deps` is unconditional

`actions/cache` restores `~/.cache/ms-playwright`, which holds the **browser binary only**.

The system libraries Chromium dynamically links against — `libatk-1.0.so.0`, `libnss3`, `libgbm1`,
and roughly forty others — are apt packages installed into `/usr/lib`. They are **not** in that
directory and are **never** restored by the cache.

So `npx playwright install-deps chromium` runs on every job, and only the binary download is gated
on a cache miss. Gating the system libraries on a cache miss produces a cached binary that dies at
launch:

```
chrome-headless-shell: error while loading shared libraries:
libatk-1.0.so.0: cannot open shared object file
<process did exit: exitCode=127>
```

The cache key includes the resolved Playwright version, because a browser build is bound to the
`@playwright/test` that downloaded it. The `restore-keys` fallback is safe: on a partial restore
`cache-hit` is `'false'`, so the binary install re-runs and repairs the mismatch.

---

## When CI fails

**Unit tests or audit** — reproduce locally with `npm test` and `bash scripts/audit.sh`. No secrets
needed.

**E2E** — download the `playwright-report` artifact from the run summary. It contains the html
report, plus a trace for any retried test (`trace: 'on-first-retry'`, and CI retries twice).
The failure screenshot and the DOM snapshot at the moment of failure are usually enough.

Common causes, in the order they've actually occurred:

- **`E2E_FIXTURE_PASSWORD` wrong or quoted** → the app renders `Incorrect email or password` and the
  `pin-screen` wait times out. Check the snapshot: the password field will show a truncated value.
- **A fixture lost its PIN** → the app routes to `PinSetupFlow` instead of `PinScreen`; the
  `pin-screen` wait times out. Re-seed per `fixture-accounts.md`.
- **The §0 write-rail fired** → the test fails with `§0 write-rail fired` and the offending
  `METHOD url`. Something in the flow now writes to `/rest/v1/**`. That is the rail working; find
  the write, don't exempt it.

---

## Rotating the fixture password

1. Change it in Supabase for all 7 fixture accounts.
2. Update `E2E_FIXTURE_PASSWORD` in the repository secrets.
3. Update the team password manager.
4. Every developer updates their local `.env` — **single-quoted**.

---

## Deploy gating

Production deploys are gated on CI via Vercel's **Ignored Build Step**, not branch protection.
Branch protection with a required check was rejected deliberately: promotions here are direct
pushes to `main` (no PRs), and a required check rejects the push of a fresh merge commit that has
no check run yet — it would force a PR flow. The Ignored Build Step keeps direct-push promotion
intact and instead makes Vercel *wait and verify* before building.

**How it works.** `scripts/vercel-ignore-build.mjs`, wired via `ignoreCommand` in `vercel.json`,
runs before every Vercel build:

- Non-`main` refs → exit 1 (build). Previews deploy freely, ungated.
- `main` → poll the GitHub check-runs API for the deploying commit's SHA, every 15s up to 5 min.
  Deploy only if **every** `github-actions` check run for that SHA concluded `success`.

Exit codes are Vercel's convention and are counter-intuitive: **exit 1 = build, exit 0 = cancel**
(mirrors `git diff --quiet`). The script header states this; do not flip it.

**Fail-closed.** Timeout, no checks registered, or a missing token/SHA all → skip the deploy
(exit 0) with a loud `[deploy-gate]` log line. An unverified commit must never reach production;
the recovery cost is a manual redeploy once CI is green, which is not symmetric with shipping red
code. CI runs in ~2 min, so the 5-min timeout only trips when something is genuinely wrong.

**What a red CI looks like.** The Vercel deployment shows as **Canceled**, with the
`[deploy-gate] CI did not pass: … — skipping deploy` line in its build log. Production stays on
the last good deployment.

### Vercel setup (one-time)

1. **Token.** Create a GitHub **fine-grained PAT**, scoped to **only** `Johannanadjei/family-finance`,
   with repository permission **Checks: Read-only** (Metadata:Read is added automatically). No other
   scope. This token can read CI status and nothing else.
2. **Store it** in Vercel → Project → Settings → Environment Variables as `GH_CHECKS_TOKEN`,
   available to the **Production** environment (and Preview if you ever gate previews). It is a
   secret — it lives only in Vercel, never in the repo.
3. **Ignored Build Step.** Leave Vercel → Settings → Git → *Ignored Build Step* **empty** — the
   command lives in `vercel.json` (`ignoreCommand`) so it is version-controlled and reviewable.
   Do not set it in both places.

### Emergency deploy despite red CI

The reliable lever is **Vercel → Deployments → the last good deployment → "Promote to Production"
(instant rollback / re-promote)** — promoting an existing build does not re-run the ignore step, so
it is unaffected by CI state.

To force-deploy *new* code past a red gate, temporarily clear `ignoreCommand` from `vercel.json`
(or set the dashboard field to `exit 1`), deploy, then revert. A plain **Redeploy** of the blocked
commit re-runs the gate, so it only succeeds once CI is actually green — which is the normal,
non-emergency recovery path. *(The exact Redeploy-vs-ignore-step interaction is worth confirming
in the dashboard the first time; treat the promote-previous-deployment lever as the guaranteed one.)*

## Known gaps

**CI does not gate deployment via branch protection** — by design; see Deploy gating above. The
Ignored Build Step is the gate. One consequence: it protects `main` (production) only. `staging`
and `dev` deploys, if any Vercel environments exist for them, are ungated.

**E2E runs against the production Supabase project.** There is no separate test database
(`oxpwgpugvucsqnzixafi` is shared across dev, staging, and main). The §0 write-rail keeps the run
read-only, and the fixtures are read-only by construction — but every CI run signs a fixture in,
which bumps its `last_sign_in_at` and adds noise to production auth logs. Acceptable while the suite
is auth-only. **Before any write-exercising test lands, this needs a scratch project.**
