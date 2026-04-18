/**
 * Creator Dashboard API - Slice 2/3
 * Agent management, earnings, and Stripe Connect payouts
 */
import { Hono } from 'hono';
import { getUser } from '../middleware/auth';
import { query as neonQuery } from '../services/neon';
// Stripe Connect endpoints are in creator-stripe.ts

const creatorRouter = new Hono();

const MAX_SYSTEM_PROMPT = 4000
function sanitizeSystemPrompt(raw: unknown): string | null {
  if (raw == null) return null
  if (typeof raw !== 'string') return null
  return raw
    .slice(0, MAX_SYSTEM_PROMPT)
    .replace(/<\|.*?\|>/g, '')
    .replace(/\[INST\]|\[\/INST\]/g, '')
    .replace(/###\s*(System|Instruction|Human|Assistant):/gi, '')
    .trim() || null
}

// GET /api/creator/agents - List creator's agents
// GET /api/creator/agents - List creator's agents
creatorRouter.get('/agents', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  
  try {
    const r = await neonQuery('SELECT * FROM published_agents WHERE creator_id = $1 ORDER BY created_at DESC', [user.id]);
    const data = r.rows;
    return c.json({ agents: data });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// POST /api/creator/agents - Publish new agent
creatorRouter.post('/agents', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json();
  if (!body.name) return c.json({ error: 'name required' }, 400);
  const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Allowlist only safe fields — never spread raw body to prevent field injection
  // (creator_id, status, stripe_product_id, etc. must not be client-controllable)
  try {
    const r = await neonQuery(
      `INSERT INTO published_agents (creator_id, slug, status, name, description, category, tags, price_cents, avatar_url, system_prompt) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [
        user.id,
        `${slug}-${Date.now().toString(36)}`,
        'draft',
        body.name,
        body.description ?? null,
        body.category ?? null,
        body.tags ?? [],
        typeof body.price_cents === 'number' ? body.price_cents : 0,
        body.avatar_url ?? null,
        sanitizeSystemPrompt(body.system_prompt),
      ]
    );
    const data = r.rows[0];
    return c.json({ success: true, agent: data }, 201);
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// PATCH /api/creator/agents/:id - Update agent
creatorRouter.patch('/agents/:id', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  const id = c.req.param('id');
  const body = await c.req.json();

  // Allowlist only mutable fields — never spread raw body to prevent field injection
  const safeUpdates: Record<string, any> = {};
  if (body.name !== undefined)          safeUpdates.name          = body.name;
  if (body.description !== undefined)   safeUpdates.description   = body.description;
  if (body.category !== undefined)      safeUpdates.category      = body.category;
  if (body.tags !== undefined)          safeUpdates.tags          = body.tags;
  if (body.price_cents !== undefined)   safeUpdates.price_cents   = body.price_cents;
  if (body.avatar_url !== undefined)    safeUpdates.avatar_url    = body.avatar_url;
  if (body.system_prompt !== undefined) safeUpdates.system_prompt = sanitizeSystemPrompt(body.system_prompt);

  try {
    const fields = Object.keys(safeUpdates);
    let r;
    if (fields.length === 0) {
      r = await neonQuery('SELECT * FROM published_agents WHERE id = $1 AND creator_id = $2 LIMIT 1', [id, user.id]);
    } else {
      const setClause = fields.map((key, i) => `${key} = $${i + 1}`).join(', ');
      const values = fields.map(key => safeUpdates[key]);
      values.push(id, user.id);
      r = await neonQuery(
        `UPDATE published_agents SET ${setClause} WHERE id = $${fields.length + 1} AND creator_id = $${fields.length + 2} RETURNING *`,
        values
      );
    }
    const data = r.rows[0];
    if (!data) throw new Error('JSON object requested, multiple (or no) rows returned');
    return c.json({ success: true, agent: data });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// POST /api/creator/agents/:id/publish - Submit for review
creatorRouter.post('/agents/:id/publish', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  
  const id = c.req.param('id');
  
  try {
    const r = await neonQuery(
      'UPDATE published_agents SET status = $1 WHERE id = $2 AND creator_id = $3 RETURNING *',
      ['pending_review', id, user.id]
    );
    const data = r.rows[0];
    if (!data) throw new Error('JSON object requested, multiple (or no) rows returned');
    return c.json({ success: true, agent: data });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
});

// GET /api/creator/earnings - Get earnings dashboard
creatorRouter.get('/earnings', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  
  // Total stats
  const r1 = await neonQuery('SELECT creator_share_cents, gross_cents FROM agent_revenue WHERE creator_id = $1', [user.id]).catch(() => ({ rows: null as any }));
  const stats = r1.rows;
  
  const totalEarnings = stats?.reduce((sum: number, r: any) => sum + r.creator_share_cents, 0) || 0;
  const totalGross = stats?.reduce((sum: number, r: any) => sum + r.gross_cents, 0) || 0;
  const totalInstalls = stats?.length || 0;
  
  // Per-agent breakdown
  const r2 = await neonQuery('SELECT id, name, install_count, rating FROM published_agents WHERE creator_id = $1 AND status = $2', [user.id, 'published']).catch(() => ({ rows: null as any }));
  const agentStats = r2.rows;
  
  // Payout history
  const r3 = await neonQuery('SELECT * FROM creator_payouts WHERE creator_id = $1 ORDER BY created_at DESC', [user.id]).catch(() => ({ rows: [] as any[] }));
  const payouts = r3.rows;
  
  return c.json({
    summary: {
      total_earnings_cents: totalEarnings,
      total_gross_cents: totalGross,
      platform_fees_cents: totalGross - totalEarnings,
      total_installs: totalInstalls,
    },
    agents: agentStats,
    payouts: payouts || [],
  });
});

// GET /api/creator-dashboard/neon-earnings - Real-time earnings from Neon (70/30 split)
creatorRouter.get('/neon-earnings', async (c) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);

  // Get all user's custom agent IDs
  const agentRes = await neonQuery(
    `SELECT id, name, run_count FROM user_agents WHERE user_id=$1 AND status='active'`,
    [user.id]
  ).catch(() => ({ rows: [] as any[] }))

  const agentIds = agentRes.rows.map((r: any) => r.id)

  if (!agentIds.length) {
    return c.json({ agents: [], total_creator_credits: 0, total_gross_credits: 0, unpaid_credits: 0 })
  }

  const placeholders = agentIds.map((_: any, i: number) => `$${i + 1}`).join(',')
  const earningsRes = await neonQuery(
    `SELECT agent_id,
            SUM(creator_credits) as creator_credits,
            SUM(gross_credits) as gross_credits,
            SUM(CASE WHEN paid_out=false THEN creator_credits ELSE 0 END) as unpaid_credits
     FROM creator_earnings WHERE agent_id IN (${placeholders})
     GROUP BY agent_id`,
    agentIds
  ).catch(() => ({ rows: [] as any[] }))

  const byAgent: Record<string, any> = {}
  for (const row of earningsRes.rows) {
    byAgent[row.agent_id] = row
  }

  const agents = agentRes.rows.map((a: any) => ({
    id: a.id, name: a.name, run_count: a.run_count,
    creator_credits: Number(byAgent[a.id]?.creator_credits || 0),
    gross_credits: Number(byAgent[a.id]?.gross_credits || 0),
    unpaid_credits: Number(byAgent[a.id]?.unpaid_credits || 0),
  }))

  const total_creator_credits = agents.reduce((s: number, a: any) => s + a.creator_credits, 0)
  const total_gross_credits = agents.reduce((s: number, a: any) => s + a.gross_credits, 0)
  const unpaid_credits = agents.reduce((s: number, a: any) => s + a.unpaid_credits, 0)

  return c.json({ agents, total_creator_credits, total_gross_credits, unpaid_credits })
});

export default creatorRouter;
