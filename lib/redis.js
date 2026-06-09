/**
 * lib/redis.js
 * Redis client (Docker container) via ioredis.
 * Server-side only — import only in API routes and workers.
 *
 * Used for:
 *   - OTP storage with TTL
 *   - Rate limiting (login attempts, OTP resend)
 *   - Session token cache
 *   - Order status pub/sub (optional)
 */
import Redis from 'ioredis';

if (!process.env.REDIS_URL) {
  throw new Error('[redis] Missing REDIS_URL environment variable');
}

const globalForRedis = globalThis;

if (!globalForRedis._redisClient) {
  globalForRedis._redisClient = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 100, 3000),
    lazyConnect: false,
    enableReadyCheck: true,
  });

  globalForRedis._redisClient.on('connect', () => console.log('[redis] Connected'));
  globalForRedis._redisClient.on('error', (err) => console.error('[redis] Error:', err));
}

export const redis = globalForRedis._redisClient;

// ----------------------------------------------------------------
// OTP helpers
// ----------------------------------------------------------------

const OTP_TTL = parseInt(process.env.REDIS_OTP_TTL_SECONDS || '300', 10);

/**
 * Store an OTP for a given identifier (phone or email).
 * OTP is hashed before storage.
 */
export async function setOTP(identifier, otp) {
  const key = `otp:${identifier}`;
  await redis.set(key, String(otp), 'EX', OTP_TTL);
}

/**
 * Verify an OTP. Returns true if valid, false otherwise.
 * Does NOT delete on success — call deleteOTP() after successful verification.
 */
export async function verifyOTP(identifier, otp) {
  const key = `otp:${identifier}`;
  const stored = await redis.get(key);
  return stored !== null && stored === String(otp);
}

export async function deleteOTP(identifier) {
  await redis.del(`otp:${identifier}`);
}

/**
 * Returns remaining TTL in seconds for an OTP key.
 * Returns -2 if key does not exist, -1 if no TTL.
 */
export async function getOTPTTL(identifier) {
  return redis.ttl(`otp:${identifier}`);
}

// ----------------------------------------------------------------
// Rate limiting helpers
// ----------------------------------------------------------------

/**
 * Increment a rate-limit counter. Returns current count.
 * Sets TTL on first call within the window.
 */
export async function rateLimit(key, windowSeconds = 60) {
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count;
}

// ----------------------------------------------------------------
// Generic cache helpers
// ----------------------------------------------------------------

export async function setCache(key, value, ttlSeconds = 300) {
  await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function getCache(key) {
  const data = await redis.get(key);
  return data ? JSON.parse(data) : null;
}

export async function deleteCache(key) {
  await redis.del(key);
}
