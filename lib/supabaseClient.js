/**
 * lib/supabaseClient.js
 * Supabase client — used ONLY for Realtime channel subscriptions.
 *
 * ⚠  Supabase is NOT the primary database.
 *    All data reads/writes go through lib/db.js (PostgreSQL via Docker).
 *
 * Supabase Realtime is used here to broadcast order status changes
 * to the customer order-tracking page without polling.
 *
 * How it works:
 *   1. API route updates delivery_orders in PostgreSQL (Docker)
 *   2. API route also broadcasts a Supabase Realtime message
 *      OR the pg_notify trigger forwards the event
 *   3. Customer browser subscribes to the Realtime channel
 *      and updates the tracking UI in real time
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Only warn in dev — Supabase Realtime is optional
  if (typeof window !== 'undefined') {
    console.warn('[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or ANON_KEY. Realtime will be disabled.');
  }
}

/**
 * Browser-only Supabase client for Realtime subscriptions.
 * Do NOT use for database queries — use lib/db.js instead.
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth:     { persistSession: false },
        realtime: { params: { eventsPerSecond: 10 } },
      })
    : null;

/**
 * Subscribe to live order status updates.
 * Used on the customer order-tracking page.
 *
 * @param {string}   orderId   UUID of the delivery order
 * @param {Function} onChange  Called with the updated row when status changes
 * @returns Supabase channel (call .unsubscribe() on cleanup)
 *
 * Example:
 *   const ch = subscribeToOrderStatus(orderId, (row) => setOrder(row));
 *   return () => ch.unsubscribe();
 */
export function subscribeToOrderStatus(orderId, onChange) {
  if (!supabase) {
    console.warn('[supabase] Realtime not available — Supabase not configured');
    return { unsubscribe: () => {} };
  }

  return supabase
    .channel(`order_tracking_${orderId}`)
    .on(
      'broadcast',
      { event: 'order_status_changed' },
      (payload) => {
        if (payload?.payload?.id === orderId) onChange(payload.payload);
      },
    )
    .subscribe();
}

/**
 * Broadcast an order status change to the Realtime channel.
 * Call from API routes after updating delivery_orders in PostgreSQL.
 * Server-side safe (uses service key if available, else anon).
 *
 * @param {object} orderRow  Updated delivery_orders row
 */
export async function broadcastOrderStatusChange(orderRow) {
  if (!supabase) return;
  await supabase.channel(`order_tracking_${orderRow.id}`).send({
    type:    'broadcast',
    event:   'order_status_changed',
    payload: orderRow,
  });
}
