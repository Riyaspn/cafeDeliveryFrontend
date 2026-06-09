/**
 * workers/notificationWorker.js
 * Standalone RabbitMQ consumer for notification jobs.
 * Run separately: node workers/notificationWorker.js
 * In production: managed by PM2 or a Docker service.
 *
 * This worker consumes from the delivery_notifications queue
 * and calls the appropriate notification trigger function.
 */

// Load env vars (dotenv for standalone script)
import 'dotenv/config';

import { consume, Q_NOTIFY }          from '../lib/rabbitmq.js';
import {
  notifyNewOrder,
  notifyOrderConfirmed,
  notifyAgentAssigned,
  notifyOrderPickedUp,
  notifyOrderDelivered,
  notifyOrderCancelled,
} from '../utils/notificationTriggers.js';

const HANDLERS = {
  NEW_ORDER:       notifyNewOrder,
  ORDER_CONFIRMED: notifyOrderConfirmed,
  AGENT_ASSIGNED:  notifyAgentAssigned,
  ORDER_PICKED_UP: notifyOrderPickedUp,
  ORDER_DELIVERED: notifyOrderDelivered,
  ORDER_CANCELLED: notifyOrderCancelled,
};

async function main() {
  console.log('[notificationWorker] Starting...');

  await consume(Q_NOTIFY, async (message) => {
    const { event, ...rest } = message;
    const handler = HANDLERS[event];

    if (!handler) {
      console.warn(`[notificationWorker] Unknown event: ${event}`);
      return;
    }

    console.log(`[notificationWorker] Handling: ${event}`);
    await handler(rest);
  });

  console.log('[notificationWorker] Listening for notification jobs...');
}

main().catch((err) => {
  console.error('[notificationWorker] Fatal error:', err);
  process.exit(1);
});
