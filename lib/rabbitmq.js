/**
 * lib/rabbitmq.js
 * RabbitMQ connection + channel helpers (Docker container) via amqplib.
 * Server-side only — import only in API routes and workers.
 *
 * Queues:
 *   delivery_orders        → new orders placed by customers
 *   delivery_notifications → push/email notification jobs
 *
 * Exchange: cafeqr_delivery (direct)
 */
import amqplib from 'amqplib';

if (!process.env.RABBITMQ_URL) {
  throw new Error('[rabbitmq] Missing RABBITMQ_URL environment variable');
}

const EXCHANGE  = process.env.RABBITMQ_EXCHANGE         || 'cafeqr_delivery';
const Q_ORDERS  = process.env.RABBITMQ_ORDER_QUEUE      || 'delivery_orders';
const Q_NOTIFY  = process.env.RABBITMQ_NOTIFICATION_QUEUE || 'delivery_notifications';

let _connection = null;
let _channel    = null;

/**
 * Returns a shared, persistent channel.
 * Reconnects automatically if connection dropped.
 */
export async function getChannel() {
  if (_channel) return _channel;

  _connection = await amqplib.connect(process.env.RABBITMQ_URL);
  _connection.on('error', (err) => {
    console.error('[rabbitmq] Connection error:', err.message);
    _connection = null;
    _channel    = null;
  });
  _connection.on('close', () => {
    console.warn('[rabbitmq] Connection closed');
    _connection = null;
    _channel    = null;
  });

  _channel = await _connection.createChannel();

  // Declare exchange
  await _channel.assertExchange(EXCHANGE, 'direct', { durable: true });

  // Declare queues and bind to exchange
  await _channel.assertQueue(Q_ORDERS,  { durable: true });
  await _channel.assertQueue(Q_NOTIFY,  { durable: true });
  await _channel.bindQueue(Q_ORDERS, EXCHANGE, 'order.new');
  await _channel.bindQueue(Q_NOTIFY, EXCHANGE, 'notification.send');

  console.log('[rabbitmq] Channel ready');
  return _channel;
}

/**
 * Publish a new order event to the order queue.
 * @param {object} orderPayload  The delivery_orders row just inserted
 */
export async function publishNewOrder(orderPayload) {
  const ch = await getChannel();
  const msg = Buffer.from(JSON.stringify({ event: 'ORDER_PLACED', data: orderPayload }));
  ch.publish(EXCHANGE, 'order.new', msg, { persistent: true });
  console.log(`[rabbitmq] Published ORDER_PLACED → order #${orderPayload.order_no}`);
}

/**
 * Publish a notification job.
 * @param {object} payload  { event, order, agent? }
 */
export async function publishNotification(payload) {
  const ch = await getChannel();
  const msg = Buffer.from(JSON.stringify(payload));
  ch.publish(EXCHANGE, 'notification.send', msg, { persistent: true });
  console.log(`[rabbitmq] Published notification → ${payload.event}`);
}

/**
 * Start consuming from a queue.
 * @param {string}   queueName  Q_ORDERS or Q_NOTIFY constant
 * @param {Function} handler    async (parsedMessage) => void
 */
export async function consume(queueName, handler) {
  const ch = await getChannel();
  await ch.prefetch(1); // process one message at a time per worker
  ch.consume(queueName, async (msg) => {
    if (!msg) return;
    try {
      const payload = JSON.parse(msg.content.toString());
      await handler(payload);
      ch.ack(msg);
    } catch (err) {
      console.error('[rabbitmq] Handler error:', err);
      ch.nack(msg, false, false); // dead-letter, don't requeue
    }
  });
  console.log(`[rabbitmq] Consuming from: ${queueName}`);
}

export { Q_ORDERS, Q_NOTIFY, EXCHANGE };
