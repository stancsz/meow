import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2024-11-20.acacia' as any
});

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_mock';

export async function createCheckoutSession(userId: string, credits: number, originUrl: string): Promise<string | null> {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'SimpleClaw Swarm Gas Credits',
              description: `${credits} execution credits for your autonomous agents.`,
            },
            // Assuming $10 for 1000 credits -> 1 cent per credit. Let's make unit amount credits * 1 for $0.01/each
            unit_amount: Math.round(1000 * 1), // $10.00
          },
          quantity: 1, // Or we could use variable credits, but simplest is 1 package
        },
      ],
      mode: 'payment',
      success_url: `${originUrl}?session_id={CHECKOUT_SESSION_ID}&gas_purchase=success`,
      cancel_url: `${originUrl}?gas_purchase=cancelled`,
      client_reference_id: userId,
      metadata: {
        userId: userId,
        credits: credits.toString()
      }
    });

    return session.url;
  } catch (error) {
    console.error("Error creating Stripe checkout session:", error);
    return null;
  }
}
