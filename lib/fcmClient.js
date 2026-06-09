/**
 * fcmClient.js — Firebase CLIENT-SIDE setup
 *
 * Used ONLY in the browser to:
 *  1. Request notification permission from the user
 *  2. Get the FCM device token
 *  3. Listen for foreground push messages
 *
 * The token is then sent to the backend via POST /delivery/fcm-tokens
 * (through apiClient.js) so the backend can send targeted pushes.
 *
 * Import only in client components (use dynamic import with ssr:false in Next.js)
 */
import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let messaging = null;

export function initFirebase() {
  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
  return { app, messaging };
}

/**
 * Request notification permission and return the FCM device token.
 * After getting the token, call registerFCMToken() from apiClient.js
 * to persist it on the backend.
 *
 * @returns {Promise<string|null>} FCM token or null if denied/unsupported
 */
export async function requestFCMToken() {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

    const { messaging } = initFirebase();
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Notification permission denied by user');
      return null;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    return token || null;
  } catch (err) {
    console.error('[FCM] Failed to get device token:', err);
    return null;
  }
}

/**
 * Listen for foreground push messages (app is open in browser tab).
 * For background messages, see public/firebase-messaging-sw.js.
 *
 * @param {Function} callback - receives { notification: { title, body }, data }
 * @returns {Function} unsubscribe function
 */
export function onForegroundMessage(callback) {
  if (typeof window === 'undefined') return () => {};
  const { messaging } = initFirebase();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
