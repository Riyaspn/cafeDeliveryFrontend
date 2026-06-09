/**
 * pages/api/delivery/settings.js
 * GET /api/delivery/settings?orgId=<uuid>
 *
 * Returns delivery_settings row for the given branch (org_id).
 * Used by the order page on load to know:
 *   - Whether delivery is open/closed
 *   - Delivery radius, minimum order, delivery fee
 *   - Estimated delivery time
 *   - Service areas list
 *
 * Auth: public (anon) — read-only branch settings.
 * DB:   PostgreSQL (Docker) via lib/db.js
 */
import { query } from '@/lib/db';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orgId } = req.query;

  if (!orgId) {
    return res.status(400).json({ error: 'orgId is required' });
  }

  // Basic UUID format validation
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(orgId)) {
    return res.status(400).json({ error: 'Invalid orgId format' });
  }

  try {
    const { rows } = await query(
      `SELECT
         id,
         org_id,
         client_id,
         is_delivery_enabled,
         is_takeaway_enabled,
         delivery_radius_km,
         min_order_amount,
         delivery_fee,
         free_delivery_above,
         estimated_delivery_minutes,
         service_areas,
         opening_time,
         closing_time,
         is_open_now,
         updated_at
       FROM public.delivery_settings
       WHERE org_id = $1
       LIMIT 1`,
      [orgId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Settings not found for this branch' });
    }

    return res.status(200).json({ settings: rows[0] });
  } catch (err) {
    console.error('[api/delivery/settings] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
