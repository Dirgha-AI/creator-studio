import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  plan: string;
}

const OPEN_MODE = process.env.CREATOR_OPEN === 'true';
const API_KEYS = new Set((process.env.CREATOR_API_KEYS || '').split(',').filter(Boolean));

export async function getUser(c: Context): Promise<AuthUser | null> {
  if (OPEN_MODE) return { id: 'anonymous', email: 'anonymous@local', role: 'user', plan: 'free' };
  const userId = c.req.header('x-user-id');
  if (userId) return { id: userId, email: `${userId}@internal`, role: 'user', plan: 'pro' };
  const token = (c.req.header('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || (API_KEYS.size > 0 && !API_KEYS.has(token))) return null;
  return { id: token.slice(0, 16), email: 'api@dirgha.ai', role: 'api', plan: 'pro' };
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: 'Unauthorized' }, 401);
  (c as any).set('user', user);
  await next();
});
