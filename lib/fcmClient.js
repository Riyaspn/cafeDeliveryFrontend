/**
 * fcmClient.js  —  Firebase CLIENT-SIDE setup
 * Used in the browser to request notification permission & get FCM token.
 * Import only in client components (no SSR).
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

let app;
let messaging;

export function initFirebase() {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
  }
  return { app, messaging };
}

/**
 * Request notification permission and return the FCM device token.
 * Returns null if permission denied or browser unsupported.
 */
export async function requestFCMToken() {
  try {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
    const { messaging } = initFirebase();
    if (!messaging) return null;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('[FCM] Notification permission denied');
      return null;
    }

    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });

    return token || null;
  } catch (err) {
    console.error('[FCM] Failed to get token:', err);
    return null;
  }
}

/**
 * Listen for foreground messages.
 * callback receives { notification: { title, body }, data }
 */
export function onForegroundMessage(callback) {
  if (typeof window === 'undefined') return () => {};
  const { messaging } = initFirebase();
  if (!messaging) return () => {};
  return onMessage(messaging, callback);
}
