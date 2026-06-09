/**
 * lib/db.js
 * PostgreSQL connection pool (Docker container).
 * Uses the `pg` package — NOT Supabase.
 * Import in API routes (server-side only).
 *
 * Usage:
 *   import { query, getClient } from '@/lib/db';
 *   const { rows } = await query('SELECT * FROM delivery_orders WHERE id = $1', [id]);
 */
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('[db] Missing DATABASE_URL environment variable');
}

// Singleton pool — reused across hot reloads in dev
const globalForPg = globalThis;

if (!globalForPg._pgPool) {
  globalForPg._pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 20,                   // max connections in pool
    idleTimeoutMillis: 30000,  // close idle connections after 30s
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  globalForPg._pgPool.on('error', (err) => {
    console.error('[db] Unexpected pool error:', err);
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log('[db] PostgreSQL pool created → ', process.env.DATABASE_URL.replace(/:[^:@]*@/, ':***@'));
  }
}

export const pool = globalForPg._pgPool;

/**
 * Run a parameterized query using a pool connection.
 * @param {string} text   SQL string with $1, $2, ... placeholders
 * @param {any[]}  params Array of parameter values
 */
export async function query(text, params = []) {
  const start = Date.now();
  const result = await pool.query(text, params);
  if (process.env.NODE_ENV === 'development') {
    console.log(`[db] query (${Date.now() - start}ms)`, text.slice(0, 80));
  }
  return result;
}

/**
 * Get a dedicated client for transactions.
 * Always release() the client in a finally block.
 *
 * Example:
 *   const client = await getClient();
 *   try {
 *     await client.query('BEGIN');
 *     await client.query('INSERT ...');
 *     await client.query('COMMIT');
 *   } catch (e) {
 *     await client.query('ROLLBACK');
 *     throw e;
 *   } finally {
 *     client.release();
 *   }
 */
export async function getClient() {
  return pool.connect();
}

/**
 * Test the connection — call on app boot to fail fast.
 */
export async function testConnection() {
  const { rows } = await query('SELECT current_database() AS db, current_user AS usr, now() AS ts');
  console.log('[db] Connected to PostgreSQL:', rows[0]);
  return rows[0];
}
