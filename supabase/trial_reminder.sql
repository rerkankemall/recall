-- Run this once in the Supabase SQL editor.
-- Tracks whether the "your trial is ending soon" email has already been sent
-- for a user's current trial, so the hourly cron doesn't resend it every hour.

alter table subscriptions add column if not exists trial_reminder_sent boolean not null default false;
