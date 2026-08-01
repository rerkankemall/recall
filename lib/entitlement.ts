import { createAdminSupabase } from './supabaseServer';

const TRIAL_DAYS = 14;
export const TRIAL_WORD_LIMIT = 10000;
export const SUBSCRIBER_WORD_LIMIT = 500000;
export const TRIAL_YOUTUBE_LIMIT = 5;

export type Subscription = {
  user_id: string;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  trial_words_used: number;
  sub_words_used: number;
  sub_words_period_end: string | null;
  trial_youtube_used: number;
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

// Returns an error message if this word count would exceed the caller's budget
// (the trial's total cap, or a subscriber's per-billing-period cap), or null if
// it's fine to proceed. A manually-activated subscription with no Stripe-driven
// current_period_end (e.g. the owner's own account) has no period cap either.
export function checkWordLimit(sub: Subscription, wordCount: number): string | null {
  if (sub.status === 'trialing') {
    const remaining = TRIAL_WORD_LIMIT - sub.trial_words_used;
    if (wordCount > remaining) {
      return `This would use ${wordCount} words, but you only have ${Math.max(0, remaining)} words left in your trial's ${TRIAL_WORD_LIMIT}-word limit. Subscribe for unlimited use.`;
    }
    return null;
  }

  if (sub.status === 'active' && sub.current_period_end) {
    const periodRolled = sub.sub_words_period_end !== sub.current_period_end;
    const used = periodRolled ? 0 : sub.sub_words_used;
    const remaining = SUBSCRIBER_WORD_LIMIT - used;
    if (wordCount > remaining) {
      return `This would use ${wordCount} words, but you only have ${Math.max(0, remaining)} words left in this billing period's ${SUBSCRIBER_WORD_LIMIT}-word limit. It resets when your subscription renews.`;
    }
  }

  return null;
}

// Returns an error message if a trialing user has used up their YouTube video
// allowance, or null if it's fine to proceed. Only trialing users are capped —
// this protects the shared Supadata transcript quota from one trial account
// burning through it before subscribing.
export function checkYoutubeLimit(sub: Subscription): string | null {
  if (sub.status !== 'trialing') return null;
  if (sub.trial_youtube_used >= TRIAL_YOUTUBE_LIMIT) {
    return `You've used all ${TRIAL_YOUTUBE_LIMIT} YouTube videos included in your trial. Subscribe for unlimited video support.`;
  }
  return null;
}

export async function recordYoutubeUsage(userId: string, sub: Subscription) {
  if (sub.status !== 'trialing') return;
  await createAdminSupabase()
    .from('subscriptions')
    .update({ trial_youtube_used: sub.trial_youtube_used + 1 })
    .eq('user_id', userId);
}

export async function recordWordUsage(userId: string, sub: Subscription, wordCount: number) {
  if (sub.status === 'trialing') {
    await createAdminSupabase()
      .from('subscriptions')
      .update({ trial_words_used: sub.trial_words_used + wordCount })
      .eq('user_id', userId);
    return;
  }

  if (sub.status === 'active' && sub.current_period_end) {
    const periodRolled = sub.sub_words_period_end !== sub.current_period_end;
    const used = periodRolled ? 0 : sub.sub_words_used;
    await createAdminSupabase()
      .from('subscriptions')
      .update({ sub_words_used: used + wordCount, sub_words_period_end: sub.current_period_end })
      .eq('user_id', userId);
  }
}
