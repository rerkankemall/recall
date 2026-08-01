-- Run this once in the Supabase SQL editor.
-- Tracks the last time each user got the weekly recap email, so the job
-- doesn't double-send if it's ever accidentally triggered twice in a week.

alter table user_settings add column if not exists last_weekly_recap_sent_at timestamptz;
