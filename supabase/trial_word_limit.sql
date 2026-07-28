-- Run this once in the Supabase SQL editor, after subscriptions_trial.sql,
-- to track cumulative words processed by /api/extract during a user's trial.

alter table subscriptions add column if not exists trial_words_used integer not null default 0;
