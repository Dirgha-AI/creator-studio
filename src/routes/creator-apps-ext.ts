/**
 * creator-apps-ext.ts — Creator profile + single-app endpoints
 *
 * GET  /api/creator-apps/:slug           — public app detail with creator profile
 * GET  /api/creator-apps/me/profile      — get own creator profile
 * PATCH /api/creator-apps/me/profile     — update creator profile
 * POST /api/creator-apps/me/profile/badge — auto-upgrade badge if eligible
 */
import { Hono } from 'hono';
import { query } from '../services/neon';
import { getUser } from '../middleware/auth';

export const creatorAppsExtRouter = new Hono();

// ── Schema bootstrap ───────────────────────────────────────────────────────────
let ready = false;
async function ensureSchema() {
  if (ready) return; ready = true;
  // creator_profiles may exist from Sprint 19 with different columns — just add missing ones
  await query(`ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS github_handle TEXT`).catch(() => {});
  await query(`ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS twitter_handle TEXT`).catch(() => {});
  await query(`ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS badge_level TEXT DEFAULT 'community'`).catch(() => {});
  await query(`ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ`).catch(() => {});
  await query(`ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS github_stars_total INT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS total_subscribers INT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE creator_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`).catch(() => {});
  // creator_apps column additions
  await query(`ALTER TABLE creator_apps ADD COLUMN IF NOT EXISTS github_stars INT DEFAULT 0`).catch(() => {});
  await query(`ALTER TABLE creator_apps ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0.0'`).catch(() => {});
}
ensureSchema();

// ── GET /me/profile — get own creator profile ─────────────────────────────────
creatorAppsExtRouter.get('/me/profile', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const { rows: [profile] } = await query(
      `SELECT * FROM creator_profiles WHERE user_id = $1`, [user.id]
    );
    if (!profile) {
      // Auto-create on first access
      const { rows: [created] } = await query(
        `INSERT INTO creator_profiles (user_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING *`,
        [user.id]
      );
      return c.json({ profile: created ?? null });
    }
    return c.json({ profile });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ── PATCH /me/profile — update creator profile ────────────────────────────────
creatorAppsExtRouter.patch('/me/profile', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const { display_name, bio, avatar_url, github_handle, twitter_handle, website_url } = body;
  try {
    // Upsert creator profile
    const { rows: [profile] } = await query(
      `INSERT INTO creator_profiles (user_id, display_name, bio, avatar_url, github_handle, twitter_handle, website_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (user_id) DO UPDATE SET
         display_name = COALESCE(EXCLUDED.display_name, creator_profiles.display_name),
         bio = COALESCE(EXCLUDED.bio, creator_profiles.bio),
         avatar_url = COALESCE(EXCLUDED.avatar_url, creator_profiles.avatar_url),
         github_handle = COALESCE(EXCLUDED.github_handle, creator_profiles.github_handle),
         twitter_handle = COALESCE(EXCLUDED.twitter_handle, creator_profiles.twitter_handle),
         website_url = COALESCE(EXCLUDED.website_url, creator_profiles.website_url),
         updated_at = NOW()
       RETURNING *`,
      [user.id, display_name ?? null, bio ?? null, avatar_url ?? null,
       github_handle ?? null, twitter_handle ?? null, website_url ?? null]
    );

    // Auto-upgrade to 'verified' if github_handle set + has approved app
    if (github_handle && profile.badge_level === 'community') {
      const { rows: [{ count }] } = await query(
        `SELECT COUNT(*) FROM creator_apps WHERE creator_id=$1 AND status='approved'`, [user.id]
      );
      if (parseInt(count) >= 1) {
        await query(
          `UPDATE creator_profiles SET badge_level='verified', verified_at=NOW() WHERE user_id=$1`,
          [user.id]
        );
        profile.badge_level = 'verified';
        profile.verified_at = new Date().toISOString();
      }
    }
    return c.json({ profile });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ── GET /:slug — public single app with creator profile ───────────────────────
creatorAppsExtRouter.get('/:slug', async (c) => {
  const { slug } = c.req.param();
  try {
    const { rows: [app] } = await query(
      `SELECT a.*,
              p.display_name as creator_name, p.bio as creator_bio,
              p.avatar_url as creator_avatar, p.github_handle, p.twitter_handle,
              p.website_url as creator_website, p.badge_level, p.total_subscribers as creator_total_subs
       FROM creator_apps a
       LEFT JOIN creator_profiles p ON p.user_id::TEXT = a.creator_id
       WHERE a.slug = $1 AND a.status = 'approved'`,
      [slug]
    );
    if (!app) return c.json({ error: 'Not found' }, 404);

    // Reshape creator into nested object
    const creator = {
      display_name: app.creator_name,
      bio: app.creator_bio,
      avatar_url: app.creator_avatar,
      github_handle: app.github_handle,
      twitter_handle: app.twitter_handle,
      website_url: app.creator_website,
      badge_level: app.badge_level ?? 'community',
    };
    const { creator_name, creator_bio, creator_avatar, creator_website,
            creator_total_subs, ...appData } = app;
    return c.json({ app: { ...appData, creator } });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});

// ── Also extend browse GET / to join creator profile ─────────────────────────
// Re-export a browse router that includes creator join
export const creatorAppsBrowseRouter = new Hono();
creatorAppsBrowseRouter.get('/', async (c) => {
  const { category, q, sort = 'subscriber_count', limit = '24', offset = '0' } = c.req.query();
  const params: any[] = ['approved'];
  const where = [`a.status = $1`];
  if (category) { params.push(category); where.push(`a.category = $${params.length}`); }
  if (q) { params.push(`%${q.toLowerCase()}%`); where.push(`(LOWER(a.name) LIKE $${params.length} OR LOWER(a.tagline) LIKE $${params.length})`); }
  const col = ['subscriber_count','price_cents','created_at','name'].includes(sort) ? `a.${sort}` : 'a.subscriber_count';
  params.push(parseInt(limit), parseInt(offset));
  try {
    const { rows } = await query(
      `SELECT a.id, a.slug, a.name, a.tagline, a.category, a.logo_url, a.price_cents,
              a.tags, a.featured, a.subscriber_count, a.github_url, a.github_stars,
              a.min_ram_mb, a.creator_id,
              json_build_object(
                'display_name', p.display_name,
                'avatar_url', p.avatar_url,
                'github_handle', p.github_handle,
                'twitter_handle', p.twitter_handle,
                'badge_level', COALESCE(p.badge_level, 'community')
              ) AS creator
       FROM creator_apps a
       LEFT JOIN creator_profiles p ON p.user_id::TEXT = a.creator_id
       WHERE ${where.join(' AND ')}
       ORDER BY a.featured DESC, ${col} DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*) FROM creator_apps a WHERE ${where.join(' AND ')}`,
      params.slice(0, -2)
    );
    return c.json({ apps: rows, total: parseInt(count) });
  } catch (err: any) { return c.json({ error: err.message }, 500); }
});
