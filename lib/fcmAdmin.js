/**
 * fcmAdmin.js — Firebase Admin SDK (SERVER-SIDE ONLY)
 *
 * Import ONLY inside pages/api/ routes.
 * NEVER import in client components or pages — this contains
 * a private service account key.
 *
 * How push notifications are triggered:
 *   Browser → Backend API (Docker) → RabbitMQ queue
 *   → Consumer picks up → calls pages/api/internal/send-push
 *   → this file sends via FCM
 *
 * OR for synchronous flows:
 *   pages/api route → this file directly → FCM
 */
import admin from 'firebase-admin';

let adminApp = null;

export function getAdminApp() {
  if (adminApp) return adminApp;
  if (admin.apps.length > 0) { adminApp = admin.apps[0]; return adminApp; }

  let credential;
  if (process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON) {
    const sa = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(sa);
  } else {
    // Fallback: individual env vars (useful in Docker Compose .env)
    credential = admin.credential.cert({
      projectId:   process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey:  process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    });
  }

  adminApp = admin.initializeApp({ credential });
  return adminApp;
}

/**
 * Send push to a single FCM device token.
 * @param {string} token
 * @param {{ title: string, body: string, data?: object }} payload
 */
export async function sendPushToToken(token, { title, body, data = {} }) {
  const app = getAdminApp();
  const message = {
    token,
    notification: { title, body },
    // data values must all be strings
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: {
      priority: 'high',
      notification: { sound: 'default', channelId: 'cafeqr_orders' },
    },
    apns: {
      payload: { aps: { sound: 'default', badge: 1 } },
    },
    webpush: {
      notification: {
        icon:  '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
      },
    },
  };
  return admin.messaging(app).send(message);
}

/**
 * Send push to multiple tokens (batched, max 500 per FCM call).
 */
export async function sendPushToTokens(tokens, payload) {
  if (!tokens?.length) return;
  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));
  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map((t) => sendPushToToken(t, payload)));
  }
}

/**
 * Send push to an FCM topic.
 * Restaurant devices subscribe to topic: restaurant_{clientId}_{orgId}
 * via the backend on login.
 * @param {string} topic
 */
export async function sendPushToTopic(topic, { title, body, data = {} }) {
  const app = getAdminApp();
  return admin.messaging(app).send({
    topic,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: { priority: 'high', notification: { sound: 'default', channelId: 'cafeqr_orders' } },
  });
}
