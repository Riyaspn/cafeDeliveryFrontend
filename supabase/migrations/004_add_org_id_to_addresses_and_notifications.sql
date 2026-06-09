-- ============================================================
-- 004_add_org_id_to_addresses_and_notifications.sql
-- CafeQR Delivery (Supabase) — Add org_id to delivery_addresses
-- and delivery_notifications_log for proper branch-level scoping.
--
-- Why:
--   The delivery website now uses orgId (organizations.id /
--   branch UUID) as the primary identifier, not clientId.
--   Saved addresses must be scoped per branch so a customer
--   ordering from Kollam only sees their Kollam-saved addresses,
--   not addresses saved at Thrissur or any other branch.
--   Notification logs must be filterable per branch for the
--   admin panel.
--
-- Safe to re-run: uses ADD COLUMN IF NOT EXISTS throughout.
-- Does NOT alter any other column or constraint.
-- ============================================================

-- -----------------------------------------------------------
-- 1. delivery_addresses — add org_id
-- -----------------------------------------------------------
ALTER TABLE public.delivery_addresses
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- Index for fast per-branch address lookups
CREATE INDEX IF NOT EXISTS idx_del_addresses_org_id
    ON public.delivery_addresses (org_id);

-- Composite index: the most common query is
-- WHERE customer_phone = $1 AND org_id = $2
CREATE INDEX IF NOT EXISTS idx_del_addresses_phone_org
    ON public.delivery_addresses (customer_phone, org_id);

COMMENT ON COLUMN public.delivery_addresses.org_id
    IS 'Branch (organizations.id) this address was saved for. NULL = legacy rows before migration 004.';


-- -----------------------------------------------------------
-- 2. delivery_notifications_log — add org_id
-- -----------------------------------------------------------
ALTER TABLE public.delivery_notifications_log
    ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id);

-- Index for per-branch notification audit log queries
CREATE INDEX IF NOT EXISTS idx_notif_log_org_id
    ON public.delivery_notifications_log (org_id);

COMMENT ON COLUMN public.delivery_notifications_log.org_id
    IS 'Branch (organizations.id) the notification was sent for. NULL = legacy rows before migration 004.';
