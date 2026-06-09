/**
 * notificationTriggers.js
 * Push notification trigger helpers — SERVER-SIDE ONLY.
 * Import only in pages/api/ routes.
 *
 * Architecture:
 *   These functions are called by Next.js API routes.
 *   They fetch FCM tokens from the backend (not DB directly),
 *   then use fcmAdmin.js to send via Firebase Admin SDK.
 *
 *   For async flows (e.g. order status change):
 *   Backend service → RabbitMQ → Consumer → POST /api/internal/notify
 *   → this file
 *
 *   For synchronous flows (e.g. order placed):
 *   pages/api/delivery/orders.js → this file directly
 *
 * All 6 notification events:
 *   1. NEW_ORDER       → Restaurant (FCM topic + fallback tokens)
 *   2. ORDER_CONFIRMED → Customer (FCM token + email)
 *   3. AGENT_ASSIGNED  → Delivery agent (FCM token)
 *   4. ORDER_PICKED_UP → Customer (FCM token)
 *   5. ORDER_DELIVERED → Customer (FCM + email) + Restaurant (FCM)
 *   6. ORDER_CANCELLED → Customer (FCM + email) + Restaurant (FCM)
 */

import { sendPushToTokens, sendPushToTopic } from '@/lib/fcmAdmin';
import {
  sendOrderConfirmationEmail,
  sendOrderDeliveredEmail,
  sendOrderCancelledEmail,
} from '@/lib/gmailMailer';

const INTERNAL_API   = process.env.NEXT_PUBLIC_API_BASE_URL;
const INTERNAL_TOKEN = process.env.INTERNAL_API_SECRET;

/**
 * Fetch FCM tokens for a role from the backend API.
 * Backend reads from delivery_fcm_tokens table (PostgreSQL via Docker).
 *
 * @param {{ clientId, orgId, customerId, agentId, role }} params
 * @returns {Promise<string[]>}
 */
async function getTokensForRole({ clientId, orgId, customerId, agentId, role }) {
  try {
    const params = new URLSearchParams({ role });
    if (clientId)   params.set('clientId',   clientId);
    if (orgId)      params.set('orgId',       orgId);
    if (customerId) params.set('entityId',    customerId);
    if (agentId)    params.set('entityId',    agentId);

    const res = await fetch(
      `${INTERNAL_API}/delivery/fcm-tokens?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${INTERNAL_TOKEN}`,
          'Content-Type':  'application/json',
        },
      }
    );
    if (!res.ok) throw new Error(`FCM token fetch failed: ${res.status}`);
    const data = await res.json();
    return (data?.tokens || []).filter(Boolean);
  } catch (err) {
    console.error('[notificationTriggers] getTokensForRole error:', err.message);
    return [];
  }
}

/**
 * Log the notification to backend audit log.
 * Backend writes to delivery_notifications_log (PostgreSQL).
 *
 * @param {{ orderId, clientId, orgId, role, event, channel, title, body, success, errorMessage }} params
 * orgId is required since V8 migration — filters logs per branch in admin panel.
 */
async function logNotification({ orderId, clientId, orgId, role, event, channel = 'PUSH', title, body, success = true, errorMessage }) {
  try {
    await fetch(`${INTERNAL_API}/delivery/notifications-log`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${INTERNAL_TOKEN}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        orderId,
        clientId,
        orgId,          // branch-level — added in V8 migration
        targetRole:   role,
        eventType:    event,
        channel,
        title,
        body,
        success,
        errorMessage,
      }),
    });
  } catch (err) {
    // Non-fatal — logging failure shouldn't break the order flow
    console.error('[notificationTriggers] logNotification error:', err.message);
  }
}


// ----------------------------------------------------------------
// 1. NEW ORDER → Restaurant
// ----------------------------------------------------------------
export async function notifyNewOrder({ order }) {
  const { id: orderId, client_id, org_id, order_no, customer_name } = order;
  const title = `\uD83D\uDED2 New Order #${order_no}`;
  const body  = `${customer_name} placed a delivery order. Tap to view.`;
  const data  = { orderId, event: 'NEW_ORDER', screen: 'OrderDetails' };

  try {
    // Topic-based push: all restaurant devices subscribed to this topic get it
    await sendPushToTopic(`restaurant_${client_id}_${org_id}`, { title, body, data });
    await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'restaurant', event: 'NEW_ORDER', title, body });
  } catch (topicErr) {
    // Fallback: individual token push if topic fails
    const tokens = await getTokensForRole({ clientId: client_id, orgId: org_id, role: 'restaurant' });
    await sendPushToTokens(tokens, { title, body, data });
    await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'restaurant', event: 'NEW_ORDER', title, body });
  }
}


// ----------------------------------------------------------------
// 2. ORDER CONFIRMED → Customer (push + email)
// ----------------------------------------------------------------
export async function notifyOrderConfirmed({ order }) {
  const { id: orderId, client_id, org_id, order_no, customer_id, customer_email,
          customer_name, estimated_time_minutes, order_lines_snapshot, grand_total } = order;

  const title = `\u2705 Order #${order_no} Confirmed!`;
  const body  = `Your order is confirmed. Estimated delivery: ${estimated_time_minutes || '30'} mins.`;
  const data  = { orderId, event: 'ORDER_CONFIRMED', screen: 'OrderTracking' };

  // Push
  const tokens = await getTokensForRole({ clientId: client_id, orgId: org_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(tokens, { title, body, data });
  await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_CONFIRMED', channel: 'PUSH', title, body });

  // Email via Gmail API
  if (customer_email) {
    try {
      await sendOrderConfirmationEmail({
        to:            customer_email,
        customerName:  customer_name,
        orderNo:       order_no,
        items:         order_lines_snapshot || [],
        grandTotal:    grand_total,
        estimatedTime: estimated_time_minutes,
      });
      await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_CONFIRMED', channel: 'EMAIL', title, body });
    } catch (emailErr) {
      console.error('[notifyOrderConfirmed] Email failed:', emailErr.message);
      await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_CONFIRMED', channel: 'EMAIL', title, body, success: false, errorMessage: emailErr.message });
    }
  }
}


// ----------------------------------------------------------------
// 3. AGENT ASSIGNED → Delivery agent
// ----------------------------------------------------------------
export async function notifyAgentAssigned({ order, agent }) {
  const { id: orderId, client_id, org_id, order_no, delivery_address } = order;
  const { id: agentId } = agent;

  const title = `\uD83D\uDEB4 New Delivery Assigned`;
  const body  = `Order #${order_no}. Deliver to: ${delivery_address?.area || 'see app'}.`;
  const data  = { orderId, event: 'AGENT_ASSIGNED', screen: 'AgentDelivery' };

  const tokens = await getTokensForRole({ clientId: client_id, orgId: org_id, agentId, role: 'agent' });
  await sendPushToTokens(tokens, { title, body, data });
  await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'agent', event: 'AGENT_ASSIGNED', title, body });
}


// ----------------------------------------------------------------
// 4. ORDER PICKED UP → Customer
// ----------------------------------------------------------------
export async function notifyOrderPickedUp({ order }) {
  const { id: orderId, client_id, org_id, order_no, customer_id } = order;

  const title = `\uD83D\uDCE6 Order #${order_no} Picked Up`;
  const body  = `Your order is on the way! You can track it live.`;
  const data  = { orderId, event: 'ORDER_PICKED_UP', screen: 'OrderTracking' };

  const tokens = await getTokensForRole({ clientId: client_id, orgId: org_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(tokens, { title, body, data });
  await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_PICKED_UP', title, body });
}


// ----------------------------------------------------------------
// 5. ORDER DELIVERED → Customer (push + email) + Restaurant (push)
// ----------------------------------------------------------------
export async function notifyOrderDelivered({ order }) {
  const { id: orderId, client_id, org_id, order_no, customer_id,
          customer_email, customer_name, grand_total } = order;

  // Customer push
  const custTitle = `\uD83C\uDF89 Order #${order_no} Delivered!`;
  const custBody  = `Enjoy your meal! \u20B9${grand_total} paid. Please rate your experience.`;
  const custData  = { orderId, event: 'ORDER_DELIVERED', screen: 'OrderReview' };
  const custTokens = await getTokensForRole({ clientId: client_id, orgId: org_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(custTokens, { title: custTitle, body: custBody, data: custData });
  await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_DELIVERED', channel: 'PUSH', title: custTitle, body: custBody });

  // Customer email via Gmail API
  if (customer_email) {
    try {
      await sendOrderDeliveredEmail({ to: customer_email, customerName: customer_name, orderNo: order_no, grandTotal: grand_total });
      await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_DELIVERED', channel: 'EMAIL', title: custTitle, body: custBody });
    } catch (emailErr) {
      console.error('[notifyOrderDelivered] Email failed:', emailErr.message);
      await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_DELIVERED', channel: 'EMAIL', title: custTitle, body: custBody, success: false, errorMessage: emailErr.message });
    }
  }

  // Restaurant push
  const restTitle = `\u2705 Order #${order_no} Delivered`;
  const restBody  = `Delivered. Amount: \u20B9${grand_total}.`;
  try {
    await sendPushToTopic(`restaurant_${client_id}_${org_id}`, { title: restTitle, body: restBody, data: { orderId, event: 'ORDER_DELIVERED' } });
  } catch {
    const restTokens = await getTokensForRole({ clientId: client_id, orgId: org_id, role: 'restaurant' });
    await sendPushToTokens(restTokens, { title: restTitle, body: restBody, data: { orderId, event: 'ORDER_DELIVERED' } });
  }
  await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'restaurant', event: 'ORDER_DELIVERED', title: restTitle, body: restBody });
}


// ----------------------------------------------------------------
// 6. ORDER CANCELLED → Customer (push + email) + Restaurant (push)
// ----------------------------------------------------------------
export async function notifyOrderCancelled({ order, cancelledBy = 'system', reason = '' }) {
  const { id: orderId, client_id, org_id, order_no, customer_id,
          customer_email, customer_name } = order;

  // Customer push
  const custTitle = `\u274C Order #${order_no} Cancelled`;
  const custBody  = reason ? `Cancelled: ${reason}` : `Your order has been cancelled.`;
  const custTokens = await getTokensForRole({ clientId: client_id, orgId: org_id, customerId: customer_id, role: 'customer' });
  await sendPushToTokens(custTokens, { title: custTitle, body: custBody, data: { orderId, event: 'ORDER_CANCELLED' } });
  await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_CANCELLED', channel: 'PUSH', title: custTitle, body: custBody });

  // Customer email via Gmail API
  if (customer_email) {
    try {
      await sendOrderCancelledEmail({ to: customer_email, customerName: customer_name, orderNo: order_no, reason });
      await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_CANCELLED', channel: 'EMAIL', title: custTitle, body: custBody });
    } catch (emailErr) {
      console.error('[notifyOrderCancelled] Email failed:', emailErr.message);
      await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'customer', event: 'ORDER_CANCELLED', channel: 'EMAIL', title: custTitle, body: custBody, success: false, errorMessage: emailErr.message });
    }
  }

  // Restaurant push
  const restTitle = `\u274C Order #${order_no} Cancelled`;
  const restBody  = `Cancelled by ${cancelledBy}${reason ? ': ' + reason : ''}.`;
  try {
    await sendPushToTopic(`restaurant_${client_id}_${org_id}`, { title: restTitle, body: restBody, data: { orderId, event: 'ORDER_CANCELLED' } });
  } catch {
    const restTokens = await getTokensForRole({ clientId: client_id, orgId: org_id, role: 'restaurant' });
    await sendPushToTokens(restTokens, { title: restTitle, body: restBody, data: { orderId, event: 'ORDER_CANCELLED' } });
  }
  await logNotification({ orderId, clientId: client_id, orgId: org_id, role: 'restaurant', event: 'ORDER_CANCELLED', title: restTitle, body: restBody });
}
