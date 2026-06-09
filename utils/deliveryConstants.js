/**
 * deliveryConstants.js
 * Shared constants for CafeQR Delivery.
 */

export const ORDER_TYPES = {
  DELIVERY: 'DELIVERY',
  TAKEAWAY: 'TAKEAWAY',
};

export const ORDER_STATUS = {
  PENDING:    'PENDING',
  CONFIRMED:  'CONFIRMED',
  PREPARING:  'PREPARING',
  READY:      'READY',
  ASSIGNED:   'ASSIGNED',
  PICKED_UP:  'PICKED_UP',
  DELIVERED:  'DELIVERED',
  CANCELLED:  'CANCELLED',
};

export const PAYMENT_METHODS = {
  COD:   'CASH',
  CARD:  'CARD',
  UPI:   'UPI',
  RAZORPAY: 'RAZORPAY',
};

export const FCM_ROLES = {
  CUSTOMER:   'customer',
  RESTAURANT: 'restaurant',
  AGENT:      'agent',
};

export const NOTIFICATION_EVENTS = {
  NEW_ORDER:        'NEW_ORDER',
  ORDER_CONFIRMED:  'ORDER_CONFIRMED',
  AGENT_ASSIGNED:   'AGENT_ASSIGNED',
  ORDER_PICKED_UP:  'ORDER_PICKED_UP',
  ORDER_DELIVERED:  'ORDER_DELIVERED',
  ORDER_CANCELLED:  'ORDER_CANCELLED',
};

/** Default delivery fee tiers (restaurants can override via DB) */
export const DEFAULT_DELIVERY_FEE = 40;
export const FREE_DELIVERY_ABOVE  = 299;
