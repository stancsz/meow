import { NextRequest, NextResponse } from 'next/server';
import { handleStripeWebhook } from '../../../../../../src/core/payments';
import { getDbClient } from '../../../../../../src/db/client';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.text();
    const signature = req.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
    }

    const db = getDbClient();

    // We pass the raw text payload to constructEvent
    // This handler explicitly processes checkout.session.completed and payment_intent.succeeded
    // to credit the user's gas_ledger in the Motherboard schema.
    const success = handleStripeWebhook(payload, signature, db);

    if (success) {
      return NextResponse.json({ received: true });
    } else {
      // Return 200 OK even if event type is unhandled to prevent Stripe from retrying
      return NextResponse.json({ received: true, note: 'unhandled event type or processing skipped' });
    }
  } catch (err: any) {
    console.error('Stripe webhook error:', err);
    // Real signature errors or other critical failures should return 400 to signal error
    return NextResponse.json({ error: 'Webhook Error' }, { status: 400 });
  }
}
