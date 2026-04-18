/**
 * creator-apps.ts — /api/creator-apps
 * Third-party builder app marketplace. 85/15 rev split via Stripe Connect.
 *
 * POST /submit           — builder submits app for review
 * GET  /                 — browse approved creator apps
 * GET  /mine             — builder's own submissions + earnings
 * POST /:id/subscribe    — user subscribes (Stripe Checkout)
 * POST /:id/unsubscribe  — cancel subscription
 * GET  /me/subscriptions — user's active subscriptions
 * PATCH /:id/approve     — admin approve/reject submission
 */
import { Hono } from 'hono';
import { query } from '../services/neon';
import { getUser } from '../middleware/auth';

export const creatorAppsRouter = new Hono();

// ── Schema bootstrap ───────────────────────────────────────────────────────────
let ready = false;
async function ensureSchema() {
  if (ready) return; ready = true;
  await query(`
    CREATE TABLE IF NOT EXISTS creator_apps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      creator_id TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      tags TEXT[] DEFAULT '{}',
      docker_image TEXT,
      github_url TEXT,
      logo_url TEXT,
      screenshots TEXT[] DEFAULT '{}',
      price_cents INT NOT NULL DEFAULT 0,
      price_type TEXT DEFAULT 'subscription',
      min_ram_mb INT DEFAULT 512,
      env_required TEXT[] DEFAULT '{}',
      status TEXT DEFAULT 'pending',
      featured BOOLEAN DEFAULT false,
      subscriber_count INT DEFAULT 0,
      stripe_product_id TEXT,
      stripe_price_id TEXT,
      platform_fee_pct INT DEFAULT 15,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `).catch(() => {});
  await query(`
    CREATE TABLE IF NOT EXISTS creator_app_subscriptions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id TEXT NOT NULL,
      app_id UUID NOT NULL REFERENCES creator_apps(id),
      status TEXT DEFAULT 'active',
      stripe_subscription_id TEXT,
      stripe_customer_id TEXT,
      subdomain TEXT,
      container_name TEXT,
      port INT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, app_id)
    )
  `).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_creator_apps_status ON creator_apps(status)`).catch(() => {});
  await query(`CREATE INDEX IF NOT EXISTS idx_creator_subs_user ON creator_app_subscriptions(user_id)`).catch(() => {});
}
ensureSchema();

// ── GET / — browse approved apps ───────────────────────────────────────────────
creatorAppsRouter.get('/', async (c) => {
  const { category, q, sort = 'subscriber_count', limit = '24', offset = '0' } = c.req.query();
  const params: any[] = ['approved'];
  const where = [`status = $1`];
  if (category) { params.push(category); where.push(`category = $${params.length}`); }
  if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(LOWER(name) LIKE $${params.length} OR LOWER(tagline) LIKE $${params.length})`); }
  const col = ['subscriber_count','price_cents','created_at','name'].includes(sort) ? sort : 'subscriber_count';
  params.push(parseInt(limit), parseInt(offset));
  try {
    const { rows } = await query(
      `SELECT id, slug, name, tagline, category, logo_url, price_cents, price_type,
              tags, featured, subscriber_count, github_url, min_ram_mb, creator_id
       FROM creator_apps WHERE ${where.join(' AND ')}
       ORDER BY featured DESC, ${col} DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*) FROM creator_apps WHERE ${where.join(' AND ')}`,
      params.slice(0, -2)
    );
    return c.json({ apps: rows, total: parseInt(count) });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ── POST /submit — builder submits an app ─────────────────────────────────────
creatorAppsRouter.post('/submit', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const { name, tagline, description, category, docker_image, github_url,
          price_cents, logo_url, tags, min_ram_mb, env_required } = body;
  if (!name || !tagline || !category || !docker_image || price_cents === undefined)
    return c.json({ error: 'name, tagline, category, docker_image, price_cents required' }, 400);
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  try {
    const { rows: [app] } = await query(
      `INSERT INTO creator_apps
         (creator_id, slug, name, tagline, description, category, docker_image,
          github_url, price_cents, logo_url, tags, min_ram_mb, env_required, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'pending')
       RETURNING *`,
      [user.id, slug, name, tagline, description ?? null, category,
       docker_image, github_url ?? null, price_cents, logo_url ?? null,
       tags ?? [], min_ram_mb ?? 512, env_required ?? []]
    );
    return c.json({ app, message: 'Submitted for review. We\'ll notify you within 1-3 days.' }, 201);
  } catch (err: any) {
    if (err.message?.includes('unique')) return c.json({ error: 'An app with this name already exists' }, 409);
    return c.json({ error: err.message }, 500);
  }
});

// ── GET /mine — builder's submissions + stats ──────────────────────────────────
creatorAppsRouter.get('/mine', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const { rows } = await query(
      `SELECT a.*, COUNT(s.id) AS active_subs,
              COALESCE(SUM(a.price_cents * 0.85 / 100.0), 0) AS est_monthly_revenue
       FROM creator_apps a
       LEFT JOIN creator_app_subscriptions s ON s.app_id = a.id AND s.status='active'
       WHERE a.creator_id = $1
       GROUP BY a.id ORDER BY a.created_at DESC`,
      [user.id]
    );
    return c.json({ apps: rows });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ── GET /me/subscriptions — user's active subscriptions ───────────────────────
creatorAppsRouter.get('/me/subscriptions', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const { rows } = await query(
      `SELECT s.*, a.name, a.tagline, a.logo_url, a.category, a.price_cents, a.slug
       FROM creator_app_subscriptions s JOIN creator_apps a ON a.id = s.app_id
       WHERE s.user_id = $1 AND s.status = 'active'`,
      [user.id]
    );
    return c.json({ subscriptions: rows });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ── POST /:id/subscribe — subscribe via Stripe Checkout ───────────────────────
creatorAppsRouter.post('/:id/subscribe', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { rows: [profile] } = await query(`SELECT plan FROM profiles WHERE id=$1`, [user.id]).catch(() => ({ rows: [null] }));
  if (!['computer','pro','team','admin'].includes(profile?.plan ?? ''))
    return c.json({ error: 'upgrade_required', plan_required: 'computer' }, 403);

  const { rows: [app] } = await query(`SELECT * FROM creator_apps WHERE id=$1 AND status='approved'`, [c.req.param('id')]);
  if (!app) return c.json({ error: 'App not found or not yet approved' }, 404);

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return c.json({ error: 'Stripe not configured' }, 503);
  const appUrl = process.env.FRONTEND_URL || 'https://dirgha.ai';

  // STRIPE CHECKOUT ENABLED
  try {
    const { default: Stripe } = await import('stripe');
    const stripe = new Stripe(stripeKey, { apiVersion: '2025-01-27.acacia' as any });
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [{ price_data: {
        currency: 'usd',
        product_data: { name: app.name, description: app.tagline },
        unit_amount: app.price_cents,
        recurring: { interval: 'month' },
      }, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { type: 'creator_app_sub', app_id: app.id, user_id: user.id },
      success_url: `${appUrl}/computer/apps?subscribed=${app.slug}`,
      cancel_url: `${appUrl}/computer/apps`,
    });
    return c.json({ url: session.url });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ── PATCH /:id/approve — admin review ─────────────────────────────────────────
creatorAppsRouter.patch('/:id/approve', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const { rows: [profile] } = await query(`SELECT plan FROM profiles WHERE id=$1`, [user.id]).catch(() => ({ rows: [null] }));
  if (profile?.plan !== 'admin') return c.json({ error: 'Admin only' }, 403);

  const { status, featured } = await c.req.json().catch(() => ({}));
  const { rows: [app] } = await query(
    `UPDATE creator_apps SET status=COALESCE($1,status), featured=COALESCE($2,featured), updated_at=NOW()
     WHERE id=$3 RETURNING *`,
    [status ?? null, featured ?? null, c.req.param('id')]
  );
  return c.json({ app });
});
