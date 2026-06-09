-- ============================================================
-- 005_rls_org_scoped.sql
-- CafeQR Delivery (Supabase) — Tighten RLS policies to
-- branch-level (org_id) scope.
--
-- Why:
--   002_rls_policies.sql used USING(true) everywhere, meaning
--   any anon user could read data from ALL branches of ALL
--   clients. This file replaces those permissive policies with
--   org_id-scoped ones.
--
-- How org_id is passed:
--   The backend sets a Postgres session variable at the start
--   of every request:
--     SET LOCAL app.current_org_id = '<uuid>';
--   RLS policies read it via:
--     current_setting('app.current_org_id', true)::uuid
--   The second argument (true) means return NULL instead of
--   throwing if the setting is not set — so service_role
--   bypass still works cleanly.
--
-- Safe to re-run: all policies use DROP IF EXISTS first.
-- Run AFTER 001, 002, 003, 004.
-- ============================================================


-- ============================================================
-- delivery_orders
-- ============================================================

-- DROP old permissive SELECT policy
DROP POLICY IF EXISTS "delivery_orders_select_by_phone" ON public.delivery_orders;

-- New: anon can only SELECT orders that belong to the current branch
CREATE POLICY "delivery_orders_select_org_scoped"
  ON public.delivery_orders FOR SELECT
  TO anon, authenticated
  USING (
    org_id = current_setting('app.current_org_id', true)::uuid
  );

-- DROP old permissive INSERT policy
DROP POLICY IF EXISTS "delivery_orders_insert_anon" ON public.delivery_orders;

-- New: anon can only INSERT an order for the current branch
-- (prevents a customer from submitting an order against a
--  different branch's org_id than the one they are on)
CREATE POLICY "delivery_orders_insert_org_scoped"
  ON public.delivery_orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    org_id = current_setting('app.current_org_id', true)::uuid
  );

-- Service role keeps full access (no change needed — already set in 002)
-- DROP POLICY IF EXISTS "delivery_orders_service_role" ON public.delivery_orders;


-- ============================================================
-- delivery_addresses
-- ============================================================

-- DROP old fully open policy
DROP POLICY IF EXISTS "del_addresses_anon_rw" ON public.delivery_addresses;

-- New: anon can only read/write addresses for the current branch
CREATE POLICY "del_addresses_org_scoped"
  ON public.delivery_addresses FOR ALL
  TO anon, authenticated
  USING (
    org_id = current_setting('app.current_org_id', true)::uuid
  )
  WITH CHECK (
    org_id = current_setting('app.current_org_id', true)::uuid
  );


-- ============================================================
-- delivery_settings
-- ============================================================

-- DROP old permissive SELECT
DROP POLICY IF EXISTS "delivery_settings_public_read" ON public.delivery_settings;

-- New: anon can only read settings for the current branch
CREATE POLICY "delivery_settings_org_scoped_read"
  ON public.delivery_settings FOR SELECT
  TO anon, authenticated
  USING (
    org_id = current_setting('app.current_org_id', true)::uuid
  );

-- Service role keeps full access (already set in 002)


-- ============================================================
-- delivery_agents
-- ============================================================

-- DROP old permissive SELECT
DROP POLICY IF EXISTS "delivery_agents_read" ON public.delivery_agents;

-- New: anon can only read agents for the current branch
CREATE POLICY "delivery_agents_org_scoped_read"
  ON public.delivery_agents FOR SELECT
  TO anon, authenticated
  USING (
    org_id = current_setting('app.current_org_id', true)::uuid
  );

-- Service role keeps full access (already set in 002)


-- ============================================================
-- delivery_fcm_tokens
-- ============================================================

-- DROP old permissive INSERT
DROP POLICY IF EXISTS "fcm_tokens_upsert_anon" ON public.delivery_fcm_tokens;

-- New: token can only be registered for the current branch
CREATE POLICY "fcm_tokens_org_scoped_insert"
  ON public.delivery_fcm_tokens FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    org_id = current_setting('app.current_org_id', true)::uuid
  );

-- Service role keeps full access (already set in 002)


-- ============================================================
-- delivery_notifications_log
-- ============================================================
-- Already service_role only in 002 — no change needed.
-- Keeping comment here for completeness.
