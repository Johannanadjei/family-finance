-- =============================================================================
-- schema_base.sql
--
-- SOURCE-OF-TRUTH ONLY — DO NOT RE-RUN unless rebuilding the database.
-- The 8 core tables below ALREADY EXIST in production. Their CREATE TABLE was
-- never committed (created via the Supabase SQL Editor in early development).
-- Extracted from production via `pg_dump --schema-only` on 2026-06-05 so the repo
-- holds the authoritative base schema for the new eu-west-1 project.
--
-- THIS IS THE END-STATE STRUCTURE. A pg_dump reflects the fully-evolved schema,
-- so every column the incremental migrate_*.sql files added (cycle_id,
-- is_archived, pin_hash, from_spare, month, income_source_id, timezone, skin_id,
-- …) is ALREADY present here. On a fresh rebuild this file IS the base; the
-- schema-altering migrate_* files become historical record — re-running them is a
-- harmless no-op (their ADD COLUMN IF NOT EXISTS / backfills do nothing). See
-- REPLAY.md.
--
-- SCOPE — this file contains ONLY table structure:
--   • 8 CREATE TABLE (IF NOT EXISTS), columns + inline CHECK constraints
--   • PK + UNIQUE + FK constraints (12 of 15 FKs — see DEFERRED below)
--   • 6 non-cycle indexes
-- It deliberately OMITS (owned elsewhere, do not duplicate):
--   • RLS enable + all policies → rls_*.sql + members_rbac.sql
--   • updated_at / cycle_id triggers → handle_updated_at.sql,
--     migrate_cycle_id_trigger.sql, migrate_move_cycle_trigger.sql
--   • the 3 cycle_id FKs + 3 cycle_id indexes → migrate_cycles_fk_columns.sql
--     (they reference public.budget_cycles, which is NOT a base table — it is
--      created later in migrate_cycles_schema.sql, so they cannot live here)
--
-- ORDERING: run AFTER the Supabase-managed `auth` schema exists (public.users
-- has an FK to auth.users) — always true on a fresh Supabase project. Tables are
-- ordered by FK dependency below.
-- =============================================================================
BEGIN;

-- ── users ─────────────────────────────────────────────────────────────────────
-- FK id → auth.users(id) ON DELETE CASCADE (cross-schema; auth must exist first).
CREATE TABLE IF NOT EXISTS public.users (
    id uuid NOT NULL,
    email text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    avatar_url text,
    plan text DEFAULT 'free'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pin_hash text,
    CONSTRAINT users_plan_check CHECK ((plan = ANY (ARRAY['free'::text, 'pro'::text])))
);

-- ── user_preferences ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    theme_skin text DEFAULT 'family_warmth'::text NOT NULL,
    theme_accent text DEFAULT 'emerald'::text NOT NULL,
    notifications jsonb DEFAULT '{"newPayment": true, "weeklySummary": true, "monthlySummary": true, "categoryOverspent": true}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- ── budget_centres ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budget_centres (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    currency text DEFAULT 'GHS'::text NOT NULL,
    surplus_target numeric DEFAULT 0 NOT NULL,
    icon text DEFAULT '🏠'::text NOT NULL,
    owner_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    type text DEFAULT 'family'::text NOT NULL,
    description text,
    country text,
    is_archived boolean DEFAULT false NOT NULL,
    skin_id text DEFAULT 'family_warmth'::text NOT NULL,
    timezone text DEFAULT 'UTC'::text NOT NULL
);

-- ── budget_centre_members ──────────────────────────────────────────────────────
-- DRIFT: production's role CHECK allows only 3 roles (owner, full_access,
-- standard) — reproduced verbatim below. members_rbac.sql declares a 4th role
-- (view_only) which is NOT yet applied to production. Whether view_only is
-- canonical is deferred to a future session; this file is faithful to prod.
CREATE TABLE IF NOT EXISTS public.budget_centre_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_centre_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'full_access'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    CONSTRAINT budget_centre_members_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'full_access'::text, 'standard'::text])))
);

-- ── guest_users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.guest_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_centre_id uuid NOT NULL,
    name text NOT NULL,
    pin_hash text NOT NULL,
    allowed_categories text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    attempt_count integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone
);

-- ── budget_categories ──────────────────────────────────────────────────────────
-- cycle_id column present (nullable); its FK + index are deferred (see end).
CREATE TABLE IF NOT EXISTS public.budget_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_centre_id uuid NOT NULL,
    name text NOT NULL,
    icon text DEFAULT '💸'::text NOT NULL,
    budget_amount numeric DEFAULT 0 NOT NULL,
    month text NOT NULL,
    is_fixed boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    cycle_id uuid
);

-- ── income_sources ─────────────────────────────────────────────────────────────
-- cycle_id column present (nullable); its FK + index are deferred (see end).
CREATE TABLE IF NOT EXISTS public.income_sources (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_centre_id uuid NOT NULL,
    label text NOT NULL,
    icon text DEFAULT '💰'::text NOT NULL,
    expected_amount numeric DEFAULT 0 NOT NULL,
    currency text DEFAULT 'GHS'::text NOT NULL,
    pay_day integer,
    pay_day_type text DEFAULT 'flexible'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    received boolean DEFAULT false NOT NULL,
    received_amount numeric DEFAULT 0 NOT NULL,
    actual_pay_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    month text NOT NULL,
    cycle_id uuid,
    CONSTRAINT income_sources_month_format CHECK ((month ~ '^\d{4}-\d{2}$'::text)),
    CONSTRAINT income_sources_pay_day_check CHECK (((pay_day >= 1) AND (pay_day <= 31))),
    CONSTRAINT income_sources_pay_day_type_check CHECK ((pay_day_type = ANY (ARRAY['fixed_date'::text, 'last_working_day'::text, 'flexible'::text])))
);

-- ── transactions ─────────────────────────────────────────────────────────────────
-- cycle_id column present (nullable); its FK + index are deferred (see end).
-- NOTE: submitted_by_guest_id is a plain uuid (no FK to guest_users) — as in prod.
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    budget_centre_id uuid NOT NULL,
    date date NOT NULL,
    week text NOT NULL,
    type text NOT NULL,
    category_id uuid,
    category_name text NOT NULL,
    amount numeric NOT NULL,
    currency text DEFAULT 'GHS'::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    logged_by_user_id uuid,
    logged_by_name text DEFAULT ''::text NOT NULL,
    source text DEFAULT 'main_app'::text NOT NULL,
    submitted_by_guest_id uuid,
    submitted_by_name text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    from_spare boolean DEFAULT false NOT NULL,
    income_source_id uuid,
    cycle_id uuid,
    CONSTRAINT transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT transactions_source_check CHECK ((source = ANY (ARRAY['main_app'::text, 'guest_portal'::text]))),
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['income'::text, 'expense'::text]))),
    CONSTRAINT transactions_week_check CHECK ((week = ANY (ARRAY['Week 1'::text, 'Week 2'::text, 'Week 3'::text, 'Week 4'::text, 'Week 5'::text])))
);


-- ── Primary keys + unique constraints ────────────────────────────────────────
-- (idempotent: guarded by NOT EXISTS lookups so re-running never errors)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_pkey')                                   THEN ALTER TABLE public.users                 ADD CONSTRAINT users_pkey PRIMARY KEY (id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_preferences_pkey')                        THEN ALTER TABLE public.user_preferences      ADD CONSTRAINT user_preferences_pkey PRIMARY KEY (id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_preferences_user_id_key')                 THEN ALTER TABLE public.user_preferences      ADD CONSTRAINT user_preferences_user_id_key UNIQUE (user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_centres_pkey')                          THEN ALTER TABLE public.budget_centres        ADD CONSTRAINT budget_centres_pkey PRIMARY KEY (id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_centre_members_pkey')                   THEN ALTER TABLE public.budget_centre_members ADD CONSTRAINT budget_centre_members_pkey PRIMARY KEY (id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_centre_members_budget_centre_id_user_id_key') THEN ALTER TABLE public.budget_centre_members ADD CONSTRAINT budget_centre_members_budget_centre_id_user_id_key UNIQUE (budget_centre_id, user_id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='guest_users_pkey')                             THEN ALTER TABLE public.guest_users           ADD CONSTRAINT guest_users_pkey PRIMARY KEY (id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_categories_pkey')                       THEN ALTER TABLE public.budget_categories     ADD CONSTRAINT budget_categories_pkey PRIMARY KEY (id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='income_sources_pkey')                          THEN ALTER TABLE public.income_sources        ADD CONSTRAINT income_sources_pkey PRIMARY KEY (id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transactions_pkey')                            THEN ALTER TABLE public.transactions          ADD CONSTRAINT transactions_pkey PRIMARY KEY (id); END IF;
END $$;

-- ── Foreign keys (12 of 15 — the 3 cycle_id FKs are DEFERRED, see end) ────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_id_fkey')                          THEN ALTER TABLE public.users                 ADD CONSTRAINT users_id_fkey                          FOREIGN KEY (id)               REFERENCES auth.users(id) ON DELETE CASCADE; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='user_preferences_user_id_fkey')          THEN ALTER TABLE public.user_preferences      ADD CONSTRAINT user_preferences_user_id_fkey          FOREIGN KEY (user_id)          REFERENCES public.users(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_centres_owner_id_fkey')           THEN ALTER TABLE public.budget_centres        ADD CONSTRAINT budget_centres_owner_id_fkey           FOREIGN KEY (owner_id)         REFERENCES public.users(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_centre_members_budget_centre_id_fkey') THEN ALTER TABLE public.budget_centre_members ADD CONSTRAINT budget_centre_members_budget_centre_id_fkey FOREIGN KEY (budget_centre_id) REFERENCES public.budget_centres(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_centre_members_user_id_fkey')     THEN ALTER TABLE public.budget_centre_members ADD CONSTRAINT budget_centre_members_user_id_fkey     FOREIGN KEY (user_id)          REFERENCES public.users(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='guest_users_budget_centre_id_fkey')      THEN ALTER TABLE public.guest_users           ADD CONSTRAINT guest_users_budget_centre_id_fkey      FOREIGN KEY (budget_centre_id) REFERENCES public.budget_centres(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='budget_categories_budget_centre_id_fkey') THEN ALTER TABLE public.budget_categories     ADD CONSTRAINT budget_categories_budget_centre_id_fkey FOREIGN KEY (budget_centre_id) REFERENCES public.budget_centres(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='income_sources_budget_centre_id_fkey')   THEN ALTER TABLE public.income_sources        ADD CONSTRAINT income_sources_budget_centre_id_fkey   FOREIGN KEY (budget_centre_id) REFERENCES public.budget_centres(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transactions_budget_centre_id_fkey')     THEN ALTER TABLE public.transactions          ADD CONSTRAINT transactions_budget_centre_id_fkey     FOREIGN KEY (budget_centre_id) REFERENCES public.budget_centres(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transactions_category_id_fkey')          THEN ALTER TABLE public.transactions          ADD CONSTRAINT transactions_category_id_fkey          FOREIGN KEY (category_id)      REFERENCES public.budget_categories(id); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transactions_income_source_id_fkey')     THEN ALTER TABLE public.transactions          ADD CONSTRAINT transactions_income_source_id_fkey     FOREIGN KEY (income_source_id) REFERENCES public.income_sources(id) ON DELETE SET NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='transactions_logged_by_user_id_fkey')    THEN ALTER TABLE public.transactions          ADD CONSTRAINT transactions_logged_by_user_id_fkey    FOREIGN KEY (logged_by_user_id) REFERENCES public.users(id); END IF;
END $$;

-- ── Indexes (6 non-cycle; the 3 idx_*_cycle live in migrate_cycles_fk_columns) ─
CREATE INDEX IF NOT EXISTS budget_categories_centre_month   ON public.budget_categories USING btree (budget_centre_id, month) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_budget_centres_is_archived   ON public.budget_centres    USING btree (is_archived)             WHERE (is_archived = false);
CREATE INDEX IF NOT EXISTS idx_income_sources_centre_month  ON public.income_sources    USING btree (budget_centre_id, month);
CREATE INDEX IF NOT EXISTS transactions_centre_date         ON public.transactions      USING btree (budget_centre_id, date DESC) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS transactions_centre_type         ON public.transactions      USING btree (budget_centre_id, type)  WHERE (deleted_at IS NULL);

-- ── DEFERRED (owned by migrate_cycles_fk_columns.sql — applied AFTER budget_cycles exists) ──
-- The following are intentionally NOT created here, because they reference
-- public.budget_cycles, which is not a base table:
--   FK    transactions_cycle_id_fkey       (cycle_id) REFERENCES budget_cycles(id) ON DELETE SET NULL
--   FK    income_sources_cycle_id_fkey     (cycle_id) REFERENCES budget_cycles(id) ON DELETE SET NULL
--   FK    budget_categories_cycle_id_fkey  (cycle_id) REFERENCES budget_cycles(id) ON DELETE SET NULL
--   INDEX idx_transactions_cycle, idx_income_sources_cycle, idx_budget_categories_cycle

-- ── Verification — self-asserting; any failure RAISES and rolls the whole TX back ──
DO $$
DECLARE
  v_n int;
  v_tbl text;
  v_tables text[] := ARRAY[
    'users','user_preferences','budget_centres','budget_centre_members',
    'guest_users','budget_categories','income_sources','transactions'
  ];
BEGIN
  -- (a) All 8 tables exist.
  FOREACH v_tbl IN ARRAY v_tables LOOP
    SELECT count(*) INTO v_n FROM information_schema.tables
      WHERE table_schema='public' AND table_name=v_tbl AND table_type='BASE TABLE';
    IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: table public.% missing', v_tbl; END IF;
  END LOOP;

  -- (b) Each table has a primary key.
  FOREACH v_tbl IN ARRAY v_tables LOOP
    SELECT count(*) INTO v_n FROM pg_constraint c
      JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace nsp ON nsp.oid=r.relnamespace
      WHERE nsp.nspname='public' AND r.relname=v_tbl AND c.contype='p';
    IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL: % has no primary key', v_tbl; END IF;
  END LOOP;

  -- (c) Representative columns present (drift guard — the mitigation for IF NOT EXISTS).
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema='public' AND table_name='users'                AND column_name IN ('id','email','name','plan','pin_hash');                                IF v_n <> 5 THEN RAISE EXCEPTION 'FAIL: users columns drifted (got %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema='public' AND table_name='user_preferences'     AND column_name IN ('id','user_id','theme_skin','notifications');                              IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: user_preferences columns drifted (got %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_centres'       AND column_name IN ('id','owner_id','currency','is_archived','skin_id','timezone');             IF v_n <> 6 THEN RAISE EXCEPTION 'FAIL: budget_centres columns drifted (got %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_centre_members' AND column_name IN ('id','budget_centre_id','user_id','role');                            IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: budget_centre_members columns drifted (got %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema='public' AND table_name='guest_users'          AND column_name IN ('id','budget_centre_id','pin_hash','allowed_categories','attempt_count'); IF v_n <> 5 THEN RAISE EXCEPTION 'FAIL: guest_users columns drifted (got %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema='public' AND table_name='budget_categories'    AND column_name IN ('id','budget_centre_id','month','cycle_id');                                IF v_n <> 4 THEN RAISE EXCEPTION 'FAIL: budget_categories columns drifted (got %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema='public' AND table_name='income_sources'       AND column_name IN ('id','budget_centre_id','month','cycle_id','received');                     IF v_n <> 5 THEN RAISE EXCEPTION 'FAIL: income_sources columns drifted (got %)', v_n; END IF;
  SELECT count(*) INTO v_n FROM information_schema.columns WHERE table_schema='public' AND table_name='transactions'         AND column_name IN ('id','budget_centre_id','date','income_source_id','cycle_id','from_spare'); IF v_n <> 6 THEN RAISE EXCEPTION 'FAIL: transactions columns drifted (got %)', v_n; END IF;

  -- (d) The 12 base FKs are present (the 3 cycle FKs are deferred, so NOT counted).
  SELECT count(*) INTO v_n FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace nsp ON nsp.oid=r.relnamespace
    WHERE nsp.nspname='public' AND c.contype='f' AND r.relname = ANY(v_tables)
      AND c.conname NOT LIKE '%cycle_id_fkey';
  IF v_n <> 12 THEN RAISE EXCEPTION 'FAIL: expected 12 base FKs, found %', v_n; END IF;

  RAISE NOTICE 'schema_base OK: 8 tables, PKs, 12 base FKs, 6 indexes installed (cycle FKs/indexes deferred to migrate_cycles_fk_columns.sql).';
END $$;

COMMIT;
