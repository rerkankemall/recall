import { createAdminSupabase } from './supabaseServer';

const TRIAL_DAYS = 14;
export const TRIAL_WORD_LIMIT = 10000;

export type Subscription = {
  user_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  trial_words_used: number;
};

// Fetches the user's subscription row, creating a fresh 14-day trial the
// first time they're seen. Uses the admin client since subscriptions has
// no user-facing insert policy (it's meant to be managed by the Stripe
// webhook and this trial bootstrap only).
export async function getOrCreateSubscription(userId: string): Promise<Subscription> {
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) return existing;

  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: created, error } = await admin
    .from('subscriptions')
    .insert({ user_id: userId, status: 'trialing', trial_ends_at: trialEndsAt })
    .select()
    .single();

  if (error) throw error;
  return created;
}

export function isEntitled(sub: Subscription): boolean {
  if (sub.status === 'active') return true;
  if (sub.status === 'trialing' && sub.trial_ends_at) {
    return new Date(sub.trial_ends_at) > new Date();
  }
  return false;
}

// Returns an error message if this word count would exceed the trial budget,
// or null if it's fine to proceed (always fine for non-trialing users).
export function checkTrialWordLimit(sub: Subscription, wordCount: number): string | null {
  if (sub.status !== 'trialing') return null;
  const remaining = TRIAL_WORD_LIMIT - sub.trial_words_used;
  if (wordCount > remaining) {
    return `This would use ${wordCount} words, but you only have ${Math.max(0, remaining)} words left in your trial's ${TRIAL_WORD_LIMIT}-word limit. Subscribe for unlimited use.`;
  }
  return null;
}

export async function recordWordUsage(userId: string, sub: Subscription, wordCount: number) {
  if (sub.status !== 'trialing') return;
  await createAdminSupabase()
    .from('subscriptions')
    .update({ trial_words_used: sub.trial_words_used + wordCount })
    .eq('user_id', userId);
}
