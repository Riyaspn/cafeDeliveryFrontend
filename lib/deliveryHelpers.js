/**
 * deliveryHelpers.js
 * Shared utility functions for the delivery ordering flow.
 */

/**
 * Parse URL params for the delivery page:
 * /order?r=<restaurant_uuid>&t=DELIVERY
 */
export function parseOrderParams(query) {
  const restaurantId = query?.r || null;
  const orderType    = query?.t || 'DELIVERY'; // DELIVERY | TAKEAWAY
  return { restaurantId, orderType };
}

/**
 * Format INR price display.
 */
export function formatPrice(amount) {
  if (amount === null || amount === undefined) return '₹0.00';
  return `₹${Number(amount).toFixed(2)}`;
}

/**
 * Calculate cart totals.
 * Returns { subtotal, tax, deliveryFee, grandTotal }
 */
export function calcCartTotals(cartItems, deliveryFee = 0, taxRate = 0) {
  const subtotal = cartItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const tax      = subtotal * (taxRate / 100);
  const grandTotal = subtotal + tax + deliveryFee;
  return {
    subtotal: +subtotal.toFixed(2),
    tax:      +tax.toFixed(2),
    deliveryFee: +deliveryFee.toFixed(2),
    grandTotal: +grandTotal.toFixed(2),
  };
}

/**
 * Build delivery order payload for the Supabase insert.
 */
export function buildDeliveryOrderPayload({
  clientId, orgId, cartItems, customer, address,
  paymentMethod, orderType, deliveryFee, taxRate,
}) {
  const { subtotal, tax, grandTotal } = calcCartTotals(cartItems, deliveryFee, taxRate);
  return {
    client_id:       clientId,
    org_id:          orgId,
    order_type:      orderType,          // DELIVERY | TAKEAWAY
    order_status:    'PENDING',
    payment_status:  'PENDING',
    order_source:    'ONLINE',
    fulfillment_type: orderType,
    customer_name:   customer.name,
    customer_phone:  customer.phone,
    delivery_address: address,
    payment_method:  paymentMethod,
    total_amount:    subtotal,
    total_tax_amount: tax,
    delivery_fee:    deliveryFee,
    grand_total:     grandTotal,
    order_lines:     cartItems,
  };
}

/**
 * Human-readable order status labels.
 */
export const ORDER_STATUS_LABELS = {
  PENDING:    'Order Received',
  CONFIRMED:  'Confirmed by Restaurant',
  PREPARING:  'Being Prepared',
  READY:      'Ready for Pickup',
  ASSIGNED:   'Delivery Agent Assigned',
  PICKED_UP:  'Order Picked Up',
  DELIVERED:  'Delivered',
  CANCELLED:  'Cancelled',
};

export const ORDER_STATUS_STEPS = [
  'PENDING', 'CONFIRMED', 'PREPARING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED',
];
