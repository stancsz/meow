import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { addCredits } from '../../../../../../src/core/gas';
import { getDbClient } from '../../../../../../src/db/client';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock', {
  apiVersion: '2025-02-24.acacia' as any,
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock';

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    const signature = req.headers.get('stripe-signature') as string;

    let event: Stripe.Event;

    try {
      if (process.env.NODE_ENV === 'test' || !process.env.STRIPE_WEBHOOK_SECRET) {
        // Bypass validation for testing if no secret
        event = JSON.parse(body);
      } else {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      }
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const metadata = session.metadata;

      if (metadata && metadata.userId && metadata.credits) {
        const userId = metadata.userId;
        const amount = parseInt(metadata.credits, 10);

        // Optional idempotency check could go here if using a real DB
        // with the event.id

        const db = getDbClient();
        if (db.checkIdempotency(event.id)) {
             console.log(`Webhook already processed for event ${event.id}`);
             return NextResponse.json({ received: true });
        }

        addCredits(userId, amount);
        db.createTransactionLogEntry(event.id, 'completed', { action: 'addGasCredits', userId, amount });

        console.log(`Successfully added ${amount} credits to user ${userId}`);
      } else {
        console.warn('Missing metadata in checkout.session.completed event');
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error(`Webhook handler failed: ${err.message}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
