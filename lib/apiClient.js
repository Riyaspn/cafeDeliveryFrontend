/**
 * apiClient.js
 * Centralised Axios instance for all calls to the CafeQR Backend API.
 *
 * Architecture note:
 *   The frontend NEVER queries PostgreSQL directly.
 *   All data operations go through the backend REST API
 *   (Spring Boot / Node.js) running in Docker.
 *
 * Usage:
 *   import api from '@/lib/apiClient';
 *   const { data } = await api.get('/delivery/menu', { params: { clientId } });
 */
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE) {
  console.warn(
    '[apiClient] NEXT_PUBLIC_API_BASE_URL is not set. ' +
    'Check your .env.local file. Defaulting to http://localhost:8080/api'
  );
}

const api = axios.create({
  baseURL: API_BASE || 'http://localhost:8080/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// ── Request interceptor ──────────────────────────────────────
// Attach auth token from cookie/localStorage if present
api.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('cafeqr_delivery_token');
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor ─────────────────────────────────────
// Normalise errors so callers always get { message, status, data }
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status  = error.response?.status;
    const message = error.response?.data?.message
      || error.response?.data?.error
      || error.message
      || 'Unexpected error';

    if (status === 401) {
      // Token expired — clear local storage and redirect to login
      if (typeof window !== 'undefined') {
        localStorage.removeItem('cafeqr_delivery_token');
        window.location.href = '/login';
      }
    }

    return Promise.reject({ message, status, raw: error });
  }
);

export default api;

// ── Typed helper wrappers ─────────────────────────────────────

/** GET /delivery/restaurant/:clientId/menu */
export const fetchMenu = (clientId, orgId) =>
  api.get(`/delivery/restaurant/${clientId}/menu`, { params: { orgId } });

/** GET /delivery/restaurant/:clientId/settings */
export const fetchDeliverySettings = (clientId, orgId) =>
  api.get(`/delivery/restaurant/${clientId}/settings`, { params: { orgId } });

/** POST /delivery/orders — place a new delivery/takeaway order */
export const placeOrder = (payload) =>
  api.post('/delivery/orders', payload);

/** GET /delivery/orders/:orderId — get order status (for tracking page) */
export const getOrderStatus = (orderId) =>
  api.get(`/delivery/orders/${orderId}`);

/** GET /delivery/orders?phone=:phone&clientId=:id — order history by phone */
export const getOrderHistory = (phone, clientId) =>
  api.get('/delivery/orders', { params: { phone, clientId } });

/** POST /delivery/fcm-tokens — register device FCM token */
export const registerFCMToken = (payload) =>
  api.post('/delivery/fcm-tokens', payload);

/** GET /delivery/addresses?phone=:phone&clientId=:id — saved addresses */
export const getSavedAddresses = (phone, clientId) =>
  api.get('/delivery/addresses', { params: { phone, clientId } });

/** POST /delivery/addresses — save a new address */
export const saveAddress = (payload) =>
  api.post('/delivery/addresses', payload);
