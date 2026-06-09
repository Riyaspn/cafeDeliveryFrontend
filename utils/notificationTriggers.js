/**
 * utils/notificationTriggers.js
 * Push notification flows — server-side only.
 * Reads FCM tokens from PostgreSQL (Docker), NOT Supabase.
 *
 * Data flow:
 *   API route → publishNotification() → RabbitMQ queue
 *     → workers/notificationWorker.js → these trigger functions
 *
 * All 6 flows:
 *   1. NEW_ORDER       → Restaurant staff
 *   2. ORDER_CONFIRMED → Customer
 *   3. AGENT_ASSIGNED  → Delivery agent
 *   4. ORDER_PICKED_UP → Customer
 *   5. ORDER_DELIVERED → Customer + Restaurant
 *   6. ORDER_CANCELLED → Customer + Restaurant
 */
import { sendPushToTokens, sendPushToTopic } from '@/lib/fcmAdmin';
import { query }                             from '@/lib/db';

// ----------------------------------------------------------------
// Token fetcher from PostgreSQL
// ----------------------------------------------------------------

async function getTokensForRole({
  clientId, orgId, customerId, agentId, role,
}) {
  let sql    = `SELECT token FROM delivery_fcm_tokens WHERE is_active = true AND role = $1`;
  const params = [role];

  if (role === 'restaurant') {
    sql += ` AND client_id = $${params.push(clientId)} AND org_id = $${params.push(orgId)}`;
  } else if (role === 'customer' && customerId) {
    sql += ` AND entity_id = $${params.push(customerId)}`;
  } else if (role === 'agent' && agentId) {
    sql += ` AND entity_id = $${params.push(agentId)}`;
  }

  const { rows } = await query(sql, params);
  return rows.map((r) => r.token).filter(Boolean);
}

async function logNotification({ orderId, clientId, role, event, title, body }) {
  await query(
    `INSERT INTO delivery_notifications_log
       (order_id, client_id, target_role, event_type, title, body, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
    [orderId, clientId, role, event, title, body],
  );
}

// ----------------------------------------------------------------
// 1. NEW ORDER → Restaurant
// ----------------------------------------------------------------
export async function notifyNewOrder({ order }) {
  const { id, client_id, org_id, order_no, customer_name } = order;
  const title = `🛒 New Order #${order_no}`;
  const body  = `${customer_name} placed a delivery order.`;
  const data  = { orderId: id, event: 'NEW_ORDER' };

  try {
    await sendPushToTopic(`restaurant_${client_id}_${org_id}`, { title, body, data });
  } catch {
    const tokens = await getTokensForRole({ clientId: client_id, orgId: org_id, role: 'restaurant' });
    await sendPushToTokens(tokens, { title, body, data });
  }
  await logNotification({ orderId: id, clientId: client_id, role: 'restaurant', event: 'NEW_ORDER', title, body });
}

// ----------------------------------------------------------------
// 2. ORDER CONFIRMED → Customer
// ----------------------------------------------------------------
export async function notifyOrderConfirmed({ order }) {
  const { id, client_id, order_no, customer_id, estimated_time_minutes } = order;
  const title = `✅ Order #${order_no} Confirmed!`;
  const body  = `Estimated delivery: ${estimated_time_minutes || 30} mins.`;
  const data  = { orderId: id, event: 'ORDER_CONFIRMED' };

  const tokens = await getTokensForRole({ clientId: client_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(tokens, { title, body, data });
  await logNotification({ orderId: id, clientId: client_id, role: 'customer', event: 'ORDER_CONFIRMED', title, body });
}

// ----------------------------------------------------------------
// 3. AGENT ASSIGNED → Delivery Agent
// ----------------------------------------------------------------
export async function notifyAgentAssigned({ order, agent }) {
  const { id, client_id, order_no, delivery_address } = order;
  const { id: agentId } = agent;
  const title = `🚴 New Delivery Assigned`;
  const body  = `Order #${order_no} → ${delivery_address?.area || 'see app'}`;
  const data  = { orderId: id, event: 'AGENT_ASSIGNED' };

  const tokens = await getTokensForRole({ clientId: client_id, agentId, role: 'agent' });
  await sendPushToTokens(tokens, { title, body, data });
  await logNotification({ orderId: id, clientId: client_id, role: 'agent', event: 'AGENT_ASSIGNED', title, body });
}

// ----------------------------------------------------------------
// 4. ORDER PICKED UP → Customer
// ----------------------------------------------------------------
export async function notifyOrderPickedUp({ order }) {
  const { id, client_id, order_no, customer_id } = order;
  const title = `📦 Order #${order_no} Picked Up`;
  const body  = `Your order is on the way!`;
  const data  = { orderId: id, event: 'ORDER_PICKED_UP' };

  const tokens = await getTokensForRole({ clientId: client_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(tokens, { title, body, data });
  await logNotification({ orderId: id, clientId: client_id, role: 'customer', event: 'ORDER_PICKED_UP', title, body });
}

// ----------------------------------------------------------------
// 5. ORDER DELIVERED → Customer + Restaurant
// ----------------------------------------------------------------
export async function notifyOrderDelivered({ order }) {
  const { id, client_id, org_id, order_no, customer_id, grand_total } = order;

  const custTitle = `🎉 Order #${order_no} Delivered!`;
  const custBody  = `Enjoy your meal! Total: ₹${grand_total}.`;
  const custTokens = await getTokensForRole({ clientId: client_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(custTokens, { title: custTitle, body: custBody, data: { orderId: id, event: 'ORDER_DELIVERED' } });
  await logNotification({ orderId: id, clientId: client_id, role: 'customer', event: 'ORDER_DELIVERED', title: custTitle, body: custBody });

  const restTitle = `✅ Order #${order_no} Delivered`;
  const restBody  = `Amount: ₹${grand_total}.`;
  try {
    await sendPushToTopic(`restaurant_${client_id}_${org_id}`, { title: restTitle, body: restBody, data: { orderId: id, event: 'ORDER_DELIVERED' } });
  } catch {
    const restTokens = await getTokensForRole({ clientId: client_id, orgId: org_id, role: 'restaurant' });
    await sendPushToTokens(restTokens, { title: restTitle, body: restBody, data: { orderId: id, event: 'ORDER_DELIVERED' } });
  }
  await logNotification({ orderId: id, clientId: client_id, role: 'restaurant', event: 'ORDER_DELIVERED', title: restTitle, body: restBody });
}

// ----------------------------------------------------------------
// 6. ORDER CANCELLED → Customer + Restaurant
// ----------------------------------------------------------------
export async function notifyOrderCancelled({ order, cancelledBy = 'system', reason = '' }) {
  const { id, client_id, org_id, order_no, customer_id } = order;

  const custTitle = `❌ Order #${order_no} Cancelled`;
  const custBody  = reason ? `Reason: ${reason}` : `Your order has been cancelled.`;
  const custTokens = await getTokensForRole({ clientId: client_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(custTokens, { title: custTitle, body: custBody, data: { orderId: id, event: 'ORDER_CANCELLED' } });
  await logNotification({ orderId: id, clientId: client_id, role: 'customer', event: 'ORDER_CANCELLED', title: custTitle, body: custBody });

  const restTitle = `❌ Order #${order_no} Cancelled`;
  const restBody  = `Cancelled by ${cancelledBy}${reason ? ': ' + reason : ''}.`;
  try {
    await sendPushToTopic(`restaurant_${client_id}_${org_id}`, { title: restTitle, body: restBody, data: { orderId: id, event: 'ORDER_CANCELLED' } });
  } catch {
    const restTokens = await getTokensForRole({ clientId: client_id, orgId: org_id, role: 'restaurant' });
    await sendPushToTokens(restTokens, { title: restTitle, body: restBody, data: { orderId: id, event: 'ORDER_CANCELLED' } });
  }
  await logNotification({ orderId: id, clientId: client_id, role: 'restaurant', event: 'ORDER_CANCELLED', title: restTitle, body: restBody });
}
