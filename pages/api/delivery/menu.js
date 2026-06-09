/**
 * pages/api/delivery/menu.js
 * GET /api/delivery/menu?orgId=<uuid>
 *
 * Returns the menu (categories + items) for a specific branch.
 * Reads from the main POS schema — categories and menu_items
 * are shared across the platform, scoped by org_id.
 *
 * Response shape:
 *   { categories: [ { id, name, items: [ { id, name, price, ... } ] } ] }
 *
 * Auth: public (anon) — menu is public.
 * DB:   PostgreSQL (Docker) via lib/db.js
 *
 * Caching: responses are cached in Redis for 60s per org
 * to avoid hammering the DB on every page load.
 */
import { query }              from '@/lib/db';
import { getCache, setCache } from '@/lib/redis';

const MENU_CACHE_TTL = 60; // seconds

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { orgId } = req.query;

  if (!orgId) {
    return res.status(400).json({ error: 'orgId is required' });
  }

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_RE.test(orgId)) {
    return res.status(400).json({ error: 'Invalid orgId format' });
  }

  const cacheKey = `menu:${orgId}`;

  try {
    // 1. Try Redis cache first
    const cached = await getCache(cacheKey);
    if (cached) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached);
    }

    // 2. Fetch categories for this branch
    const { rows: categoryRows } = await query(
      `SELECT id, name, display_order, is_active
       FROM public.categories
       WHERE org_id = $1
         AND is_active = true
       ORDER BY display_order ASC, name ASC`,
      [orgId]
    );

    if (categoryRows.length === 0) {
      const empty = { categories: [] };
      await setCache(cacheKey, empty, MENU_CACHE_TTL);
      return res.status(200).json(empty);
    }

    const categoryIds = categoryRows.map((c) => c.id);

    // 3. Fetch all active menu items for these categories in one query
    const { rows: itemRows } = await query(
      `SELECT
         id,
         category_id,
         name,
         description,
         price,
         image_url,
         is_available,
         is_veg,
         spice_level,
         display_order
       FROM public.menu_items
       WHERE category_id = ANY($1::uuid[])
         AND is_available = true
       ORDER BY display_order ASC, name ASC`,
      [categoryIds]
    );

    // 4. Group items under their category
    const itemsByCategory = {};
    for (const item of itemRows) {
      if (!itemsByCategory[item.category_id]) {
        itemsByCategory[item.category_id] = [];
      }
      itemsByCategory[item.category_id].push(item);
    }

    const categories = categoryRows.map((cat) => ({
      ...cat,
      items: itemsByCategory[cat.id] || [],
    }));

    const payload = { categories };

    // 5. Cache result
    await setCache(cacheKey, payload, MENU_CACHE_TTL);

    res.setHeader('X-Cache', 'MISS');
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/delivery/menu] Error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
