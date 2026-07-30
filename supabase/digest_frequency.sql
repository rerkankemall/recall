-- Run this once in the Supabase SQL editor, after trial_word_limit.sql,
-- to let users pick how often the digest email fires (every N days).

alter table user_settings add column if not exists digest_frequency_days smallint not null default 1;
