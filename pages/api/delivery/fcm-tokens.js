/**
 * pages/api/delivery/fcm-tokens.js
 *
 * POST /api/delivery/fcm-tokens
 *   Register or refresh an FCM token for a device at a branch.
 *   Body: { orgId, clientId, token, role, entityId }
 *     role:     'customer' | 'restaurant' | 'agent'
 *     entityId: customer_id or agent_id (nullable for 'restaurant')
 *
 * GET /api/delivery/fcm-tokens?orgId=<uuid>&role=<role>[&entityId=<id>]
 *   Fetch tokens for a role at a branch.
 *   Used internally by notificationTriggers.js.
 *
 * Auth:
 *   POST — public (anon), called from browser/app
 *   GET  — internal only (Bearer INTERNAL_API_SECRET)
 *
 * DB: PostgreSQL (Docker) via lib/db.js
 */
import { query } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method === 'POST') return handlePost(req, res);
  if (req.method === 'GET')  return handleGet(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

// ----------------------------------------------------------------
// POST — register / refresh FCM token (public)
// ----------------------------------------------------------------
async function handlePost(req, res) {
  const { orgId, clientId, token, role, entityId } = req.body;

  if (!orgId || !UUID_RE.test(orgId)) {
    return res.status(400).json({ error: 'Valid orgId is required' });
  }
  if (!token || !role) {
    return res.status(400).json({ error: 'token and role are required' });
  }
  const validRoles = ['customer', 'restaurant', 'agent'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${validRoles.join(', ')}` });
  }

  try {
    // Upsert: if this token already exists for this org, update the role/entity
    await query(
      `INSERT INTO public.delivery_fcm_tokens
         (org_id, client_id, token, role, entity_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (token)
       DO UPDATE SET
         org_id    = EXCLUDED.org_id,
         client_id = EXCLUDED.client_id,
         role      = EXCLUDED.role,
         entity_id = EXCLUDED.entity_id,
         updated_at = NOW()`,
      [
        orgId,
        clientId || null,
        token,
        role,
        entityId || null,
      ]
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/fcm-tokens POST] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ----------------------------------------------------------------
// GET — fetch tokens for a role (internal only)
// ----------------------------------------------------------------
async function handleGet(req, res) {
  // Verify internal secret
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token || token !== process.env.INTERNAL_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { orgId, role, entityId } = req.query;

  if (!orgId || !role) {
    return res.status(400).json({ error: 'orgId and role are required' });
  }
  if (!UUID_RE.test(orgId)) {
    return res.status(400).json({ error: 'Invalid orgId format' });
  }

  try {
    const params = [orgId, role];
    let sql = `SELECT token FROM public.delivery_fcm_tokens
               WHERE org_id = $1 AND role = $2`;
    if (entityId) {
      sql += ` AND entity_id = $3`;
      params.push(entityId);
    }

    const { rows } = await query(sql, params);
    return res.status(200).json({ tokens: rows.map((r) => r.token) });
  } catch (err) {
    console.error('[api/fcm-tokens GET] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
