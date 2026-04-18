/**
 * Digital products API — Sprint 19
 * POST /api/creator/products              → create
 * GET  /api/creator/products              → list creator's products
 * GET  /api/products/digital/:slug        → public product page
 * POST /api/products/digital/:id/purchase → Stripe PI → download record
 * GET  /api/downloads/:token              → verify + return signed URL
 */
import { Hono } from 'hono';
import { query } from '../services/neon';
import { getUser } from '../middleware/auth';
import crypto from 'crypto';

const router = new Hono();

function slugify(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// POST /api/creator/products
router.post('/products', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = user.id;
  try {
    const { rows: [cp] } = await query(
      `SELECT id FROM creator_profiles WHERE user_id=$1 LIMIT 1`, [userId]
    );
    if (!cp) return c.json({ error: 'Creator profile required' }, 403);

    const body = await c.req.json<{
      title: string; slug?: string; description?: string; category?: string;
      file_url?: string; file_type?: string; file_size_bytes?: number;
      price_cents: number; min_price_cents?: number; preview_url?: string;
      is_published?: boolean;
    }>();
    const slug = body.slug ?? `${slugify(body.title)}-${Date.now()}`;
    const { rows: [product] } = await query(
      `INSERT INTO digital_products
         (creator_id, title, slug, description, category, file_url, file_type, file_size_bytes,
          price_cents, min_price_cents, preview_url, is_published, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,
         CASE WHEN $12 THEN NOW() ELSE NULL END)
       RETURNING *`,
      [cp.id, body.title, slug, body.description, body.category,
       body.file_url, body.file_type, body.file_size_bytes,
       body.price_cents, body.min_price_cents ?? 0, body.preview_url, body.is_published ?? false]
    );
    return c.json(product, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/creator/products
router.get('/products', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = user.id;
  try {
    const { rows } = await query(
      `SELECT dp.* FROM digital_products dp
       JOIN creator_profiles cp ON cp.id = dp.creator_id
       WHERE cp.user_id=$1 ORDER BY dp.created_at DESC`,
      [userId]
    );
    return c.json({ products: rows });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/products/digital/:slug (public)
router.get('/digital/:slug', async (c) => {
  try {
    const { rows: [product] } = await query(
      `SELECT dp.*, cp.handle, cp.display_name, cp.avatar_url
       FROM digital_products dp
       JOIN creator_profiles cp ON cp.id = dp.creator_id
       WHERE dp.slug=$1 AND dp.is_published=TRUE`,
      [c.req.param('slug')]
    );
    if (!product) return c.json({ error: 'Not found' }, 404);
    return c.json(product);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// POST /api/products/digital/:id/purchase
router.post('/digital/:id/purchase', async (c) => {
  try {
    const { rows: [product] } = await query(
      `SELECT * FROM digital_products WHERE id=$1 AND is_published=TRUE`, [c.req.param('id')]
    );
    if (!product) return c.json({ error: 'Not found' }, 404);

    const { buyer_email, amount_cents } = await c.req.json<{ buyer_email: string; amount_cents?: number }>();
    const finalAmount = Math.max(amount_cents ?? product.price_cents, product.min_price_cents ?? 0);

    const stripe = (await import('stripe')).default;
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-01-28.clover' as any });
    const pi = await stripeClient.paymentIntents.create({
      amount: finalAmount,
      currency: 'usd',
      metadata: { digital_product_id: product.id, buyer_email },
    });

    return c.json({ stripe_client_secret: pi.client_secret, product_id: product.id });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/downloads/:token
router.get('/download/:token', async (c) => {
  try {
    const { rows: [dl] } = await query(
      `SELECT * FROM digital_downloads WHERE download_token=$1 AND expires_at > NOW()`,
      [c.req.param('token')]
    );
    if (!dl) return c.json({ error: 'Invalid or expired token' }, 404);
    if (dl.download_count >= dl.max_downloads) return c.json({ error: 'Download limit reached' }, 403);

    const { rows: [product] } = await query(
      `SELECT file_url FROM digital_products WHERE id=$1`, [dl.product_id]
    );
    if (!product?.file_url) return c.json({ error: 'File not found' }, 404);

    await query(
      `UPDATE digital_downloads SET download_count=download_count+1 WHERE id=$1`, [dl.id]
    );
    await query(
      `UPDATE digital_products SET download_count=download_count+1 WHERE id=$1`, [dl.product_id]
    );

    // Return signed URL (R2 signing would be done here — returning raw URL for now)
    return c.json({ download_url: product.file_url, expires_at: dl.expires_at });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export { router as digitalProductsRouter };
