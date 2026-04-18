import { Hono } from 'hono';
import { createAvatarTrainingCheckout } from '../services/stripe';
import { getUser } from '../middleware/auth';

const app = new Hono();

// POST /api/creator/avatar/:id/checkout
app.post('/:id/checkout', async (c) => {
  try {
    const avatarId = c.req.param('id');
    const user = await getUser(c);

    if (!user || !user.id) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const { url, sessionId } = await createAvatarTrainingCheckout(user.id, avatarId);

    return c.json({ url, sessionId });
  } catch (error: any) {
    console.error('[Avatar Checkout]', error.message);
    return c.json({ error: 'Failed to create training checkout session' }, 500);
  }
});

export default app;