-- Run this once in the Supabase SQL editor.
-- Tracks the last time each kind of system-level alert email was sent, so we
-- don't spam the owner's inbox every time a shared quota (e.g. Supadata) is hit.
-- Only ever accessed via the server's admin/service-role client — no end user
-- should be able to read or write this, hence RLS enabled with zero policies.

create table if not exists system_alerts (
  key text primary key,
  last_sent_at timestamptz not null
);
alter table system_alerts enable row level security;
