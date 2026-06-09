/**
 * apiClient.js
 * Centralised Axios instance for all calls to the CafeQR Backend API.
 *
 * Architecture note:
 *   The frontend NEVER queries PostgreSQL directly.
 *   All data operations go through the backend REST API
 *   (Spring Boot / Node.js) running in Docker.
 *
 * Branch-level design:
 *   The `r` URL param on the delivery website carries `orgId`
 *   (organizations.id — the branch UUID), NOT the top-level clientId.
 *   The backend API accepts orgId and resolves clientId internally
 *   from the organizations table (organizations.clientid).
 *
 * Usage:
 *   import api from '@/lib/apiClient';
 *   const { data } = await api.get(`/delivery/restaurant/${orgId}/menu`);
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

// ── Request interceptor ─────────────────────────────────────────────
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

// ── Response interceptor ───────────────────────────────────────────────
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

// ── Typed helper wrappers ─────────────────────────────────────────────────

/**
 * GET /delivery/restaurant/:orgId/menu
 * Fetch the branch-level menu. orgId = organizations.id.
 * Backend resolves clientId internally from the org record.
 */
export const fetchMenu = (orgId) =>
  api.get(`/delivery/restaurant/${orgId}/menu`);

/**
 * GET /delivery/restaurant/:orgId/settings
 * Fetch branch-level delivery settings (fee, radius, hours, toggles).
 * Backend resolves clientId internally from the org record.
 */
export const fetchDeliverySettings = (orgId) =>
  api.get(`/delivery/restaurant/${orgId}/settings`);

/** POST /delivery/orders — place a new delivery/takeaway order */
export const placeOrder = (payload) =>
  api.post('/delivery/orders', payload);

/** GET /delivery/orders/:orderId — get order status (for tracking page) */
export const getOrderStatus = (orderId) =>
  api.get(`/delivery/orders/${orderId}`);

/**
 * GET /delivery/orders?phone=:phone&orgId=:orgId
 * Order history for a customer at a specific branch.
 */
export const getOrderHistory = (phone, orgId) =>
  api.get('/delivery/orders', { params: { phone, orgId } });

/** POST /delivery/fcm-tokens — register device FCM token */
export const registerFCMToken = (payload) =>
  api.post('/delivery/fcm-tokens', payload);

/**
 * GET /delivery/addresses?phone=:phone&orgId=:orgId
 * Saved addresses for a customer at a specific branch.
 */
export const getSavedAddresses = (phone, orgId) =>
  api.get('/delivery/addresses', { params: { phone, orgId } });

/** POST /delivery/addresses — save a new address */
export const saveAddress = (payload) =>
  api.post('/delivery/addresses', payload);
