-- Run this once in the Supabase SQL editor, after trial_word_limit.sql,
-- to track words processed by paying subscribers against a per-billing-period cap.

alter table subscriptions add column if not exists sub_words_used integer not null default 0;
alter table subscriptions add column if not exists sub_words_period_end timestamptz;
