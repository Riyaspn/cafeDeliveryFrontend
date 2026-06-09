/**
 * notificationTriggers.js
 * All 6 push notification flows for CafeQR Delivery.
 * Import in API routes (server-side only).
 *
 * Flow map:
 *   1. NEW_ORDER         → Restaurant staff + kitchen
 *   2. ORDER_CONFIRMED   → Customer
 *   3. ORDER_ASSIGNED    → Delivery agent
 *   4. ORDER_PICKED_UP   → Customer
 *   5. ORDER_DELIVERED   → Customer + Restaurant
 *   6. ORDER_CANCELLED   → Customer + Restaurant
 */

import { sendPushToTokens, sendPushToTopic } from '@/lib/fcmAdmin';
import { createAdminClient } from '@/lib/supabaseClient';

/**
 * Fetch FCM tokens from the delivery_fcm_tokens table.
 * role: 'customer' | 'restaurant' | 'agent'
 */
async function getTokensForRole(supabase, { clientId, orgId, customerId, agentId, role }) {
  let query = supabase
    .from('delivery_fcm_tokens')
    .select('token')
    .eq('is_active', true)
    .eq('role', role);

  if (role === 'restaurant') query = query.eq('client_id', clientId).eq('org_id', orgId);
  if (role === 'customer' && customerId) query = query.eq('entity_id', customerId);
  if (role === 'agent' && agentId) query = query.eq('entity_id', agentId);

  const { data, error } = await query;
  if (error) { console.error('[FCM] getTokens error:', error); return []; }
  return (data || []).map((r) => r.token).filter(Boolean);
}

/** Log notification to delivery_notifications_log for audit trail */
async function logNotification(supabase, { orderId, clientId, role, event, title, body }) {
  await supabase.from('delivery_notifications_log').insert({
    order_id: orderId, client_id: clientId,
    target_role: role, event_type: event,
    title, body, sent_at: new Date().toISOString(),
  });
}

// ----------------------------------------------------------------
// 1. NEW ORDER → Restaurant
// ----------------------------------------------------------------
export async function notifyNewOrder({ order }) {
  const supabase = createAdminClient();
  const { id: orderId, client_id, org_id, order_no, customer_name } = order;

  const title = `🛒 New Order #${order_no}`;
  const body  = `${customer_name} placed a delivery order. Tap to view.`;
  const data  = { orderId, event: 'NEW_ORDER', screen: 'OrderDetails' };

  // Try topic first (restaurant devices subscribed to topic)
  try {
    await sendPushToTopic(`restaurant_${client_id}_${org_id}`, { title, body, data });
  } catch {
    // Fallback to individual tokens
    const tokens = await getTokensForRole(supabase, { clientId: client_id, orgId: org_id, role: 'restaurant' });
    await sendPushToTokens(tokens, { title, body, data });
  }
  await logNotification(supabase, { orderId, clientId: client_id, role: 'restaurant', event: 'NEW_ORDER', title, body });
}

// ----------------------------------------------------------------
// 2. ORDER CONFIRMED → Customer
// ----------------------------------------------------------------
export async function notifyOrderConfirmed({ order }) {
  const supabase = createAdminClient();
  const { id: orderId, client_id, order_no, customer_id, estimated_time_minutes } = order;

  const title = `✅ Order #${order_no} Confirmed!`;
  const body  = `Your order is confirmed. Estimated time: ${estimated_time_minutes || '20-30'} mins.`;
  const data  = { orderId, event: 'ORDER_CONFIRMED', screen: 'OrderTracking' };

  const tokens = await getTokensForRole(supabase, { clientId: client_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(tokens, { title, body, data });
  await logNotification(supabase, { orderId, clientId: client_id, role: 'customer', event: 'ORDER_CONFIRMED', title, body });
}

// ----------------------------------------------------------------
// 3. AGENT ASSIGNED → Delivery Agent
// ----------------------------------------------------------------
export async function notifyAgentAssigned({ order, agent }) {
  const supabase = createAdminClient();
  const { id: orderId, client_id, order_no, delivery_address } = order;
  const { id: agentId, name: agentName } = agent;

  const title = `🚴 New Delivery Assigned`;
  const body  = `Order #${order_no} is ready for pickup. Deliver to: ${delivery_address?.area || 'see app'}.`;
  const data  = { orderId, event: 'AGENT_ASSIGNED', screen: 'AgentDelivery' };

  const tokens = await getTokensForRole(supabase, { clientId: client_id, agentId, role: 'agent' });
  await sendPushToTokens(tokens, { title, body, data });
  await logNotification(supabase, { orderId, clientId: client_id, role: 'agent', event: 'AGENT_ASSIGNED', title, body });
}

// ----------------------------------------------------------------
// 4. ORDER PICKED UP → Customer
// ----------------------------------------------------------------
export async function notifyOrderPickedUp({ order }) {
  const supabase = createAdminClient();
  const { id: orderId, client_id, order_no, customer_id } = order;

  const title = `📦 Order #${order_no} Picked Up`;
  const body  = `Your order is on the way! Track it live.`;
  const data  = { orderId, event: 'ORDER_PICKED_UP', screen: 'OrderTracking' };

  const tokens = await getTokensForRole(supabase, { clientId: client_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(tokens, { title, body, data });
  await logNotification(supabase, { orderId, clientId: client_id, role: 'customer', event: 'ORDER_PICKED_UP', title, body });
}

// ----------------------------------------------------------------
// 5. ORDER DELIVERED → Customer + Restaurant
// ----------------------------------------------------------------
export async function notifyOrderDelivered({ order }) {
  const supabase = createAdminClient();
  const { id: orderId, client_id, org_id, order_no, customer_id, grand_total } = order;

  // Customer notification
  const custTitle = `🎉 Order #${order_no} Delivered!`;
  const custBody  = `Enjoy your meal! Total: ₹${grand_total}. Rate your experience.`;
  const custData  = { orderId, event: 'ORDER_DELIVERED', screen: 'OrderReview' };
  const custTokens = await getTokensForRole(supabase, { clientId: client_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(custTokens, { title: custTitle, body: custBody, data: custData });
  await logNotification(supabase, { orderId, clientId: client_id, role: 'customer', event: 'ORDER_DELIVERED', title: custTitle, body: custBody });

  // Restaurant notification
  const restTitle = `✅ Order #${order_no} Delivered`;
  const restBody  = `Order successfully delivered. Amount: ₹${grand_total}.`;
  const restData  = { orderId, event: 'ORDER_DELIVERED', screen: 'OrderDetails' };
  try {
    await sendPushToTopic(`restaurant_${client_id}_${org_id}`, { title: restTitle, body: restBody, data: restData });
  } catch {
    const restTokens = await getTokensForRole(supabase, { clientId: client_id, orgId: org_id, role: 'restaurant' });
    await sendPushToTokens(restTokens, { title: restTitle, body: restBody, data: restData });
  }
  await logNotification(supabase, { orderId, clientId: client_id, role: 'restaurant', event: 'ORDER_DELIVERED', title: restTitle, body: restBody });
}

// ----------------------------------------------------------------
// 6. ORDER CANCELLED → Customer + Restaurant
// ----------------------------------------------------------------
export async function notifyOrderCancelled({ order, cancelledBy = 'system', reason = '' }) {
  const supabase = createAdminClient();
  const { id: orderId, client_id, org_id, order_no, customer_id } = order;

  // Customer notification
  const custTitle = `❌ Order #${order_no} Cancelled`;
  const custBody  = reason ? `Your order was cancelled. Reason: ${reason}.` : `Your order has been cancelled.`;
  const custData  = { orderId, event: 'ORDER_CANCELLED', screen: 'OrderStatus' };
  const custTokens = await getTokensForRole(supabase, { clientId: client_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(custTokens, { title: custTitle, body: custBody, data: custData });
  await logNotification(supabase, { orderId, clientId: client_id, role: 'customer', event: 'ORDER_CANCELLED', title: custTitle, body: custBody });

  // Restaurant notification
  const restTitle = `❌ Order #${order_no} Cancelled`;
  const restBody  = `Order cancelled by ${cancelledBy}${reason ? ': ' + reason : ''}.`;
  const restData  = { orderId, event: 'ORDER_CANCELLED', screen: 'OrderDetails' };
  try {
    await sendPushToTopic(`restaurant_${client_id}_${org_id}`, { title: restTitle, body: restBody, data: restData });
  } catch {
    const restTokens = await getTokensForRole(supabase, { clientId: client_id, orgId: org_id, role: 'restaurant' });
    await sendPushToTokens(restTokens, { title: restTitle, body: restBody, data: restData });
  }
  await logNotification(supabase, { orderId, clientId: client_id, role: 'restaurant', event: 'ORDER_CANCELLED', title: restTitle, body: restBody });
}
