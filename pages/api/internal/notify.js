/**
 * pages/api/internal/notify.js
 * POST /api/internal/notify
 *
 * Internal endpoint called by the RabbitMQ notification worker.
 * Receives a notification job and dispatches to the correct
 * trigger function in notificationTriggers.js.
 *
 * Protected by INTERNAL_API_SECRET bearer token.
 * Never exposed publicly — only called from notificationWorker.js
 * or the backend order service.
 *
 * Body: { event: 'NEW_ORDER' | 'ORDER_CONFIRMED' | ... , order, agent }
 */
import {
  notifyNewOrder,
  notifyOrderConfirmed,
  notifyAgentAssigned,
  notifyOrderPickedUp,
  notifyOrderDelivered,
  notifyOrderCancelled,
} from '@/utils/notificationTriggers';

const HANDLERS = {
  NEW_ORDER:       notifyNewOrder,
  ORDER_CONFIRMED: notifyOrderConfirmed,
  AGENT_ASSIGNED:  notifyAgentAssigned,
  ORDER_PICKED_UP: notifyOrderPickedUp,
  ORDER_DELIVERED: notifyOrderDelivered,
  ORDER_CANCELLED: notifyOrderCancelled,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth check ───────────────────────────────────────────────
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.replace('Bearer ', '').trim();
  if (!bearerToken || bearerToken !== process.env.INTERNAL_API_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, order, agent, cancelledBy, reason } = req.body;

  if (!event) {
    return res.status(400).json({ error: 'event is required' });
  }

  const handler = HANDLERS[event];
  if (!handler) {
    return res.status(400).json({ error: `Unknown event: ${event}` });
  }

  if (!order) {
    return res.status(400).json({ error: 'order is required' });
  }

  try {
    // Pass all possible params — each handler picks what it needs
    await handler({ order, agent, cancelledBy, reason });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(`[api/internal/notify] Handler ${event} threw:`, err.message);
    return res.status(500).json({ error: 'Notification dispatch failed' });
  }
}
