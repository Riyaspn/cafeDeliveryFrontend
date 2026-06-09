/**
 * fcmAdmin.js  —  Firebase ADMIN SDK (server-side only)
 * Import ONLY in pages/api/ routes.
 * Never import in client components — contains private service account.
 */
import admin from 'firebase-admin';

let adminApp;

export function getAdminApp() {
  if (adminApp) return adminApp;

  if (admin.apps.length > 0) {
    adminApp = admin.apps[0];
    return adminApp;
  }

  let credential;

  // Option A: full JSON string in env
  if (process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON);
    credential = admin.credential.cert(serviceAccount);
  } else {
    // Option B: individual env vars
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
 * Send a push notification to a single FCM token.
 */
export async function sendPushToToken(token, { title, body, data = {} }) {
  const app = getAdminApp();
  const message = {
    token,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: { priority: 'high', notification: { sound: 'default', channelId: 'cafeqr_orders' } },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    webpush: { notification: { icon: '/icons/icon-192x192.png', badge: '/icons/badge-72x72.png' } },
  };
  return admin.messaging(app).send(message);
}

/**
 * Send push to multiple FCM tokens (batch, max 500 per call).
 */
export async function sendPushToTokens(tokens, payload) {
  if (!tokens || tokens.length === 0) return;
  const chunks = [];
  for (let i = 0; i < tokens.length; i += 500) chunks.push(tokens.slice(i, i + 500));
  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map((token) => sendPushToToken(token, payload)));
  }
}

/**
 * Send push to an FCM topic (e.g. 'restaurant_<client_id>').
 */
export async function sendPushToTopic(topic, { title, body, data = {} }) {
  const app = getAdminApp();
  const message = {
    topic,
    notification: { title, body },
    data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    android: { priority: 'high', notification: { sound: 'default', channelId: 'cafeqr_orders' } },
    apns: { payload: { aps: { sound: 'default', badge: 1 } } },
  };
  return admin.messaging(app).send(message);
}
