export interface CheckoutSession {
  url: string;
  sessionId: string;
}

export async function createAvatarTrainingCheckout(
  userId: string,
  avatarId: string
): Promise<CheckoutSession> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY not set');
  }
  const Stripe = await import('stripe').then(m => m.default);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price_data: { currency: 'usd', product_data: { name: 'Avatar Training' }, unit_amount: 2500 }, quantity: 1 }],
    success_url: `${process.env.APP_URL || 'https://app.dirgha.ai'}/creator/avatar/${avatarId}?success=1`,
    cancel_url: `${process.env.APP_URL || 'https://app.dirgha.ai'}/creator/avatar/${avatarId}`,
    metadata: { userId, avatarId },
  });
  return { url: session.url!, sessionId: session.id };
}
