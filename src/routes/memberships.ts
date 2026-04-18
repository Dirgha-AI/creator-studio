/**
 * Creator memberships API — Sprint 19
 * POST /api/creator/memberships           → create tier (Stripe Product+Price)
 * GET  /api/creator/:handle/memberships   → public tiers
 * POST /api/subscriptions/:tier_id/join   → Stripe Subscription
 */
import { Hono } from 'hono';
import { query } from '../services/neon';
import { getUser } from '../middleware/auth';

const router = new Hono();

// POST /api/creator/memberships
router.post('/memberships', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = user.id;
  try {
    const { rows: [cp] } = await query(
      `SELECT id FROM creator_profiles WHERE user_id=$1 LIMIT 1`, [userId]
    );
    if (!cp) return c.json({ error: 'Creator profile required' }, 403);

    const body = await c.req.json<{
      tier_name: string; tier_description?: string;
      price_cents: number; billing_interval?: 'month' | 'year';
    }>();

    const stripe = (await import('stripe')).default;
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-01-28.clover' as any });

    const stripeProduct = await stripeClient.products.create({
      name: body.tier_name,
      description: body.tier_description,
    });
    const stripePrice = await stripeClient.prices.create({
      product: stripeProduct.id,
      unit_amount: body.price_cents,
      currency: 'usd',
      recurring: { interval: body.billing_interval ?? 'month' },
    });

    const { rows: [tier] } = await query(
      `INSERT INTO creator_memberships
         (creator_id, tier_name, tier_description, price_cents, billing_interval, stripe_price_id, stripe_product_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [cp.id, body.tier_name, body.tier_description, body.price_cents,
       body.billing_interval ?? 'month', stripePrice.id, stripeProduct.id]
    );
    return c.json(tier, 201);
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/creator/:handle/memberships
router.get('/:handle/memberships', async (c) => {
  try {
    const { rows } = await query(
      `SELECT cm.* FROM creator_memberships cm
       JOIN creator_profiles cp ON cp.id = cm.creator_id
       WHERE cp.handle=$1 AND cm.is_active=TRUE
       ORDER BY cm.price_cents ASC`,
      [c.req.param('handle')]
    );
    return c.json({ tiers: rows });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

// GET /api/creator/me/memberships — authenticated creator's own tiers
router.get('/me/memberships', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = user.id;
  try {
    const { rows } = await query(
      `SELECT cm.*, COUNT(cs.id) FILTER (WHERE cs.status='active') AS subscriber_count
       FROM creator_memberships cm
       JOIN creator_profiles cp ON cp.id = cm.creator_id
       LEFT JOIN creator_subscribers cs ON cs.membership_id = cm.id
       WHERE cp.user_id=$1
       GROUP BY cm.id ORDER BY cm.price_cents ASC`,
      [userId]
    );
    return c.json({ tiers: rows });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// GET /api/creator/me/stats — MRR + subscribers
router.get('/me/stats', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = user.id;
  try {
    const { rows: [cp] } = await query(
      `SELECT id FROM creator_profiles WHERE user_id=$1 LIMIT 1`, [userId]
    );
    if (!cp) return c.json({ mrr_cents: 0, active_subscribers: 0, total_revenue_cents: 0 });

    const { rows: [stats] } = await query(
      `SELECT
         COALESCE(SUM(cm.price_cents) FILTER (WHERE cs.status='active'), 0) AS mrr_cents,
         COUNT(cs.id) FILTER (WHERE cs.status='active') AS active_subscribers,
         COALESCE(SUM(cm.price_cents), 0) AS total_revenue_cents
       FROM creator_subscribers cs
       JOIN creator_memberships cm ON cm.id = cs.membership_id
       WHERE cm.creator_id=$1`,
      [cp.id]
    );
    return c.json(stats ?? { mrr_cents: 0, active_subscribers: 0, total_revenue_cents: 0 });
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// PATCH /api/creator/memberships/:id — toggle active or update description
router.patch('/memberships/:id', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const userId = user.id;
  try {
    const body = await c.req.json<{ is_active?: boolean; tier_description?: string }>();
    const { rows: [updated] } = await query(
      `UPDATE creator_memberships cm SET
         is_active = COALESCE($1, cm.is_active),
         tier_description = COALESCE($2, cm.tier_description)
       FROM creator_profiles cp
       WHERE cm.id=$3 AND cm.creator_id=cp.id AND cp.user_id=$4
       RETURNING cm.*`,
      [body.is_active ?? null, body.tier_description ?? null, c.req.param('id'), userId]
    );
    if (!updated) return c.json({ error: 'Not found' }, 404);
    return c.json(updated);
  } catch (e: any) { return c.json({ error: e.message }, 500); }
});

// POST /api/subscriptions/:tier_id/join
router.post('/subscriptions/:tier_id/join', async (c) => {
  try {
    const { rows: [tier] } = await query(
      `SELECT * FROM creator_memberships WHERE id=$1 AND is_active=TRUE`, [c.req.param('tier_id')]
    );
    if (!tier) return c.json({ error: 'Tier not found' }, 404);
    if (!tier.stripe_price_id) return c.json({ error: 'Stripe price not configured' }, 400);

    const { email, user_id } = await c.req.json<{ email: string; user_id?: string }>();
    const stripe = (await import('stripe')).default;
    const stripeClient = new stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-01-28.clover' as any });

    const customer = await stripeClient.customers.create({ email });
    const session = await stripeClient.checkout.sessions.create({
      customer: customer.id,
      mode: 'subscription',
      line_items: [{ price: tier.stripe_price_id, quantity: 1 }],
      success_url: `${process.env.APP_URL}/creator/subscribe/success?tier=${tier.id}`,
      cancel_url: `${process.env.APP_URL}/creator`,
      metadata: { tier_id: tier.id, user_id: user_id ?? '' },
    });

    return c.json({ checkout_url: session.url });
  } catch (e: any) {
    return c.json({ error: e.message }, 500);
  }
});

export { router as membershipsRouter };
