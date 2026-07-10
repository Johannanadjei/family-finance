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

## Known gaps

**CI does not gate deployment.** Vercel deploys from its own Git integration, in parallel with this
workflow. A red CI run does not stop a deploy. Closing that requires either branch protection with
this check marked required, or wiring Vercel's Ignored Build Step to CI status. Neither is done.

**E2E runs against the production Supabase project.** There is no separate test database
(`oxpwgpugvucsqnzixafi` is shared across dev, staging, and main). The §0 write-rail keeps the run
read-only, and the fixtures are read-only by construction — but every CI run signs a fixture in,
which bumps its `last_sign_in_at` and adds noise to production auth logs. Acceptable while the suite
is auth-only. **Before any write-exercising test lands, this needs a scratch project.**
