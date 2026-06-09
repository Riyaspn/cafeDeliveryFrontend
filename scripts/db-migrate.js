/**
 * scripts/db-migrate.js
 * Runs all SQL migration files in db/migrations/ in alphabetical order.
 * Usage: node scripts/db-migrate.js
 *
 * Requires DATABASE_URL in environment (load from .env.local or set explicitly).
 */
import 'dotenv/config';
import { readdir, readFile } from 'fs/promises';
import { join, dirname }     from 'path';
import { fileURLToPath }     from 'url';
import { Pool }              from 'pg';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(__dirname, '../db/migrations');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL not set. Copy .env.example to .env.local and configure it.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Create migrations tracking table if it doesn't exist
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         serial PRIMARY KEY,
      filename   varchar NOT NULL UNIQUE,
      applied_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const files = (await readdir(MIGRATIONS))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      'SELECT 1 FROM _migrations WHERE filename = $1', [file]
    );
    if (rows.length > 0) {
      console.log(`[migrate] Skipping (already applied): ${file}`);
      continue;
    }

    const sql = await readFile(join(MIGRATIONS, file), 'utf8');
    console.log(`[migrate] Applying: ${file}`);
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log(`[migrate] ✓ Done: ${file}`);
  }

  await pool.end();
  console.log('[migrate] All migrations complete.');
}

main().catch((err) => {
  console.error('[migrate] Fatal:', err.message);
  process.exit(1);
});
