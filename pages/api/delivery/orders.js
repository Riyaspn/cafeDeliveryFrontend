/**
 * pages/api/delivery/orders.js
 *
 * POST /api/delivery/orders          — place a new delivery order
 * GET  /api/delivery/orders?id=<uuid> — get a single order by ID
 * GET  /api/delivery/orders?orgId=<uuid>&phone=<phone> — order history for customer
 *
 * Auth: public (anon) — customers interact without login.
 *   Ownership verified by matching customer_phone on GET.
 *
 * DB:   PostgreSQL (Docker) via lib/db.js
 * Queue: RabbitMQ — publishes NEW_ORDER event after insert
 */
import { query, getClient }           from '@/lib/db';
import { publish, Q_NOTIFY }          from '@/lib/rabbitmq';
import { notifyNewOrder }             from '@/utils/notificationTriggers';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method === 'GET')  return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ error: 'Method not allowed' });
}

// ----------------------------------------------------------------
// GET — fetch single order OR order history
// ----------------------------------------------------------------
async function handleGet(req, res) {
  const { id, orgId, phone } = req.query;

  // Single order lookup (for tracking page)
  if (id) {
    if (!UUID_RE.test(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    try {
      const { rows } = await query(
        `SELECT
           id, order_no, org_id, client_id,
           customer_name, customer_phone, customer_email,
           delivery_address, order_lines_snapshot,
           subtotal, delivery_fee, grand_total,
           status, payment_method, payment_status,
           estimated_time_minutes, assigned_agent_id,
           notes, created_at, updated_at
         FROM public.delivery_orders
         WHERE id = $1
         LIMIT 1`,
        [id]
      );
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      return res.status(200).json({ order: rows[0] });
    } catch (err) {
      console.error('[api/orders GET id] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Order history for a customer at a branch
  if (orgId && phone) {
    if (!UUID_RE.test(orgId)) {
      return res.status(400).json({ error: 'Invalid orgId' });
    }
    try {
      const { rows } = await query(
        `SELECT
           id, order_no, status, grand_total,
           payment_method, payment_status,
           created_at, updated_at
         FROM public.delivery_orders
         WHERE org_id = $1
           AND customer_phone = $2
         ORDER BY created_at DESC
         LIMIT 20`,
        [orgId, phone]
      );
      return res.status(200).json({ orders: rows });
    } catch (err) {
      console.error('[api/orders GET history] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(400).json({ error: 'Provide id OR (orgId + phone)' });
}

// ----------------------------------------------------------------
// POST — place new order
// ----------------------------------------------------------------
async function handlePost(req, res) {
  const {
    orgId,
    clientId,
    customerName,
    customerPhone,
    customerEmail,
    deliveryAddress,   // { line1, area, city, pincode, lat, lng }
    orderLines,        // [{ menu_item_id, name, quantity, unit_price, line_total }]
    subtotal,
    deliveryFee,
    grandTotal,
    paymentMethod,     // 'COD' | 'ONLINE'
    notes,
  } = req.body;

  // ── Validate required fields ──────────────────────────────────
  if (!orgId || !UUID_RE.test(orgId)) {
    return res.status(400).json({ error: 'Valid orgId is required' });
  }
  if (!clientId) {
    return res.status(400).json({ error: 'clientId is required' });
  }
  if (!customerName || !customerPhone) {
    return res.status(400).json({ error: 'customerName and customerPhone are required' });
  }
  if (!deliveryAddress || !deliveryAddress.line1) {
    return res.status(400).json({ error: 'deliveryAddress.line1 is required' });
  }
  if (!orderLines || !Array.isArray(orderLines) || orderLines.length === 0) {
    return res.status(400).json({ error: 'orderLines must be a non-empty array' });
  }
  if (grandTotal === undefined || grandTotal === null) {
    return res.status(400).json({ error: 'grandTotal is required' });
  }

  // ── Insert order in a transaction ────────────────────────────
  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Generate order_no: ORD-<YYYYMMDD>-<random 4 digits>
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand    = Math.floor(1000 + Math.random() * 9000);
    const orderNo = `ORD-${dateStr}-${rand}`;

    const insertResult = await client.query(
      `INSERT INTO public.delivery_orders
         (org_id, client_id,
          customer_name, customer_phone, customer_email,
          delivery_address, order_lines_snapshot,
          subtotal, delivery_fee, grand_total,
          payment_method, notes, order_no, status)
       VALUES
         ($1, $2,
          $3, $4, $5,
          $6::jsonb, $7::jsonb,
          $8, $9, $10,
          $11, $12, $13, 'PENDING')
       RETURNING *`,
      [
        orgId,
        clientId,
        customerName,
        customerPhone,
        customerEmail || null,
        JSON.stringify(deliveryAddress),
        JSON.stringify(orderLines),
        subtotal,
        deliveryFee || 0,
        grandTotal,
        paymentMethod || 'COD',
        notes || null,
        orderNo,
      ]
    );

    const order = insertResult.rows[0];

    await client.query('COMMIT');

    // ── Fire NEW_ORDER notification (non-blocking) ────────────
    // Try async via RabbitMQ, fall back to direct call
    try {
      await publish(Q_NOTIFY, { event: 'NEW_ORDER', order });
    } catch (mqErr) {
      console.warn('[api/orders POST] RabbitMQ unavailable, direct notify:', mqErr.message);
      notifyNewOrder({ order }).catch(console.error);
    }

    return res.status(201).json({ order });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[api/orders POST] Error:', err.message);
    return res.status(500).json({ error: 'Failed to place order' });
  } finally {
    client.release();
  }
}
