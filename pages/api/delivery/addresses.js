/**
 * pages/api/delivery/addresses.js
 *
 * GET  /api/delivery/addresses?orgId=<uuid>&phone=<phone>
 *   Returns saved addresses for a customer at a specific branch.
 *
 * POST /api/delivery/addresses
 *   Saves a new address for a customer at a specific branch.
 *   Body: { orgId, clientId, customerPhone, label, line1, area, city, pincode, lat, lng }
 *
 * Auth: public (anon) — identified by phone number.
 * DB:   PostgreSQL (Docker) via lib/db.js
 */
import { query } from '@/lib/db';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method === 'GET')  return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

// ----------------------------------------------------------------
// GET — fetch saved addresses
// ----------------------------------------------------------------
async function handleGet(req, res) {
  const { orgId, phone } = req.query;

  if (!orgId || !phone) {
    return res.status(400).json({ error: 'orgId and phone are required' });
  }
  if (!UUID_RE.test(orgId)) {
    return res.status(400).json({ error: 'Invalid orgId format' });
  }

  try {
    const { rows } = await query(
      `SELECT id, label, line1, area, city, pincode, lat, lng, created_at
       FROM public.delivery_addresses
       WHERE org_id = $1
         AND customer_phone = $2
       ORDER BY created_at DESC
       LIMIT 5`,
      [orgId, phone]
    );
    return res.status(200).json({ addresses: rows });
  } catch (err) {
    console.error('[api/addresses GET] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ----------------------------------------------------------------
// POST — save a new address
// ----------------------------------------------------------------
async function handlePost(req, res) {
  const {
    orgId,
    clientId,
    customerPhone,
    label,
    line1,
    area,
    city,
    pincode,
    lat,
    lng,
  } = req.body;

  if (!orgId || !UUID_RE.test(orgId)) {
    return res.status(400).json({ error: 'Valid orgId is required' });
  }
  if (!customerPhone || !line1) {
    return res.status(400).json({ error: 'customerPhone and line1 are required' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO public.delivery_addresses
         (org_id, client_id, customer_phone, label, line1, area, city, pincode, lat, lng)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, label, line1, area, city, pincode, lat, lng, created_at`,
      [
        orgId,
        clientId || null,
        customerPhone,
        label   || 'Home',
        line1,
        area    || null,
        city    || null,
        pincode || null,
        lat     || null,
        lng     || null,
      ]
    );
    return res.status(201).json({ address: rows[0] });
  } catch (err) {
    console.error('[api/addresses POST] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
