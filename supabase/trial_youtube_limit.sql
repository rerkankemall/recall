-- Run this once in the Supabase SQL editor, after trial_word_limit.sql,
-- to cap how many YouTube videos a trial user can process (protects the
-- shared Supadata transcript quota from one trial account exhausting it).

alter table subscriptions add column if not exists trial_youtube_used integer not null default 0;
