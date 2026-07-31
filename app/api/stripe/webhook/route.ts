import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { createAdminSupabase } from '@/lib/supabaseServer';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-06-20' });

// Stripe calls this URL directly (not the browser), so it needs the raw
// request body to verify the signature — that's why we read req.text().
export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook signature invalid: ${err.message}` }, { status: 400 });
  }

  const supabase = createAdminSupabase();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.client_reference_id;
    if (userId) {
      let currentPeriodEnd: string | null = null;
      if (session.subscription) {
        const stripeSub = await stripe.subscriptions.retrieve(session.subscription as string);
        currentPeriodEnd = new Date(stripeSub.current_period_end * 1000).toISOString();
      }
      await supabase.from('subscriptions').upsert({
        user_id: userId,
        stripe_customer_id: session.customer as string,
        status: 'active',
        current_period_end: currentPeriodEnd,
      });
    }
  }

  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    const sub = event.data.object as Stripe.Subscription;
    await supabase
      .from('subscriptions')
      .update({
        status: sub.status === 'active' ? 'active' : sub.status,
        current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
      })
      .eq('stripe_customer_id', sub.customer as string);
  }

  return NextResponse.json({ received: true });
}
