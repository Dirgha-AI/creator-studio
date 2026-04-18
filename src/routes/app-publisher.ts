/**
 * Creator App Publisher — APP-2A/2B
 * POST /api/creator/apps           — publish a new app (product_type=app/agent/template)
 * GET  /api/creator/apps           — list my published apps + stats
 * PUT  /api/creator/apps/:id       — update app listing
 * DELETE /api/creator/apps/:id     — unpublish app
 *
 * Apps are stored as products with product_type IN ('app','agent','template','tool')
 * 90/10 revenue split on install (creator keeps 90%)
 */
import { Hono } from 'hono';
import { getUser } from '../middleware/auth';
import { query } from '../services/neon';

export const appPublisherRouter = new Hono();

// Ensure creator_id + app columns exist on products table (same schema as app-store.ts)
query(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS creator_id TEXT`).catch(() => {});
query(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'physical'`).catch(() => {});
query(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS app_metadata JSONB DEFAULT '{}'`).catch(() => {});
query(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS install_count INT DEFAULT 0`).catch(() => {});
query(`ALTER TABLE IF EXISTS products ADD COLUMN IF NOT EXISTS featured BOOLEAN DEFAULT false`).catch(() => {});

const VALID_TYPES = ['app', 'agent', 'template', 'tool', 'digital'];
const VALID_CATEGORIES = ['productivity', 'ai', 'commerce', 'research', 'design', 'dev-tools', 'india-seller', 'other'];

// POST /api/creator/apps — create/publish a new app listing
appPublisherRouter.post('/apps', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const {
    name, tagline, description, icon_url, screenshots = [],
    product_type = 'app', category = 'other',
    price = 0, currency = 'USD',
    app_metadata = {},
    pricing_model = 'free', // 'free' | 'one_time' | 'subscription'
  } = await c.req.json();

  if (!name?.trim()) return c.json({ error: 'name required' }, 400);
  if (!VALID_TYPES.includes(product_type)) return c.json({ error: `product_type must be one of: ${VALID_TYPES.join(', ')}` }, 400);
  if (!VALID_CATEGORIES.includes(category)) return c.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, 400);

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

  const r = await query(
    `INSERT INTO products
       (name, description, slug, base_price_cents, status, product_type, category, images, app_metadata, creator_id)
     VALUES ($1,$2,$3,$4,'pending_review',$5,$6,$7,$8,$9)
     RETURNING id, name, slug, status, created_at`,
    [
      name.trim(),
      description || tagline || '',
      slug,
      Math.round((parseFloat(price) || 0) * 100),
      product_type,
      category,
      JSON.stringify([icon_url, ...screenshots].filter(Boolean)),
      JSON.stringify({ ...app_metadata, tagline, pricing_model, currency }),
      user.id,
    ]
  );

  return c.json({ app: r.rows[0], message: 'App submitted for review. We\'ll email you within 48 hours.' }, 201);
});

// GET /api/creator/apps — list my apps + install stats
appPublisherRouter.get('/apps', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const r = await query(
    `SELECT
       p.id, p.name, p.slug, ROUND(p.base_price_cents/100.0,2) AS price, p.status, p.product_type, p.category,
       p.install_count, p.featured, p.app_metadata, p.created_at,
       COALESCE(AVG(ar.rating),0) AS avg_rating,
       COUNT(ar.id) AS review_count
     FROM products p
     LEFT JOIN app_reviews ar ON ar.product_id=p.id
     WHERE p.creator_id=$1 AND p.product_type IN ('app','agent','template','tool','digital')
     GROUP BY p.id
     ORDER BY p.created_at DESC`,
    [user.id]
  );

  const apps = r.rows.map(a => ({
    ...a,
    avg_rating: parseFloat(a.avg_rating).toFixed(1),
    revenue_estimate_usd: parseFloat(a.price || 0) * (a.install_count || 0) * 0.9,
  }));

  return c.json({ apps });
});

// PUT /api/creator/apps/:id — update listing
appPublisherRouter.put('/apps/:id', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const id = c.req.param('id');

  const row = await query(`SELECT creator_id, status FROM products WHERE id=$1`, [id]);
  if (!row.rows.length) return c.json({ error: 'Not found' }, 404);
  if (row.rows[0].creator_id !== user.id) return c.json({ error: 'Forbidden' }, 403);

  const { name, description, price, app_metadata, category } = await c.req.json();
  await query(
    `UPDATE products SET
       name=COALESCE($1,name),
       description=COALESCE($2,description),
       base_price_cents=COALESCE($3,base_price_cents),
       app_metadata=COALESCE($4::jsonb,app_metadata),
       category=COALESCE($5,category),
       status='pending_review'
     WHERE id=$6`,
    [name||null, description||null, price!=null?Math.round(parseFloat(price)*100):null,
     app_metadata?JSON.stringify(app_metadata):null, category||null, id]
  );
  return c.json({ success: true, message: 'Updated. Re-submitted for review.' });
});

// DELETE /api/creator/apps/:id — unpublish
appPublisherRouter.delete('/apps/:id', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const id = c.req.param('id');

  const row = await query(`SELECT creator_id FROM products WHERE id=$1`, [id]);
  if (!row.rows.length) return c.json({ error: 'Not found' }, 404);
  if (row.rows[0].creator_id !== user.id && user.role !== 'admin') return c.json({ error: 'Forbidden' }, 403);

  await query(`UPDATE products SET status='archived' WHERE id=$1`, [id]);
  return c.json({ success: true });
});

// GET /api/creator/apps/featured — admin editorial: list featured apps by category
appPublisherRouter.get('/apps/featured', async (c) => {
  const r = await query(
    `SELECT p.id, p.name, p.slug, ROUND(p.base_price_cents/100.0,2) AS price, p.product_type, p.category,
            p.install_count, p.app_metadata, p.images,
            COALESCE(AVG(ar.rating),0) AS avg_rating
     FROM products p
     LEFT JOIN app_reviews ar ON ar.product_id=p.id
     WHERE p.status='active' AND p.featured=true AND p.product_type IN ('app','agent','template','tool')
     GROUP BY p.id ORDER BY p.install_count DESC LIMIT 12`
  );
  return c.json({ featured: r.rows });
});
