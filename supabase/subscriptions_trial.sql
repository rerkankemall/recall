-- Run this once in the Supabase SQL editor, after schema.sql, to support
-- a 14-day free trial before Capture/Review require a paid subscription.

alter table subscriptions add column if not exists trial_ends_at timestamptz;
