import Stripe from 'stripe';
import { DBClient } from '../db/client';
import { stripe, STRIPE_WEBHOOK_SECRET } from './stripe';

export const CREDIT_PRICE_CENTS = 100; // 1 credit = $1.00 or $0.01 per execution, set whatever scale needed
export const MIN_CREDIT_PURCHASE = 1000;

export async function hasSufficientGas(userId: string, db: DBClient): Promise<boolean> {
  const balance = db.getGasBalance(userId);
  return balance > 0;
}

export async function consumeGas(userId: string, amount: number = 1, db: DBClient): Promise<boolean> {
  const balance = db.getGasBalance(userId);
  if (balance >= amount) {
    db.decrementGasBalance(userId, amount);
    return true;
  }
  return false;
}

export async function addGasCredits(userId: string, amount: number, db: DBClient): Promise<void> {
  db.incrementGasBalance(userId, amount);
}

export function handleStripeWebhook(payload: string | Buffer, signature: string, db: DBClient): boolean {
  try {
    const event = stripe.webhooks.constructEvent(
      payload,
      signature,
      STRIPE_WEBHOOK_SECRET
    );

    if (event.type === 'checkout.session.completed') {
      if (db.checkIdempotency(event.id)) {
        console.log(`Duplicate Stripe webhook event detected and skipped: ${event.id}`);
        return true;
      }

      const session = event.data.object as Stripe.Checkout.Session;

      const userId = session.client_reference_id || session.metadata?.userId;
      const creditsStr = session.metadata?.credits;

      if (userId && creditsStr) {
        const credits = parseInt(creditsStr, 10);
        if (!isNaN(credits)) {
           addGasCredits(userId, credits, db);
           db.logTransaction(event.id, 'completed', { amount: credits });
           console.log(`Successfully added ${credits} gas to user ${userId}`);
           return true;
        }
      }
      console.error("Missing userId or credits in session metadata for gas topup");
    }
    return false;
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    return false;
  }
}
