-- Run this once in the Supabase SQL editor, after schema.sql, to add
-- daily-digest email preferences per user.

create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  digest_enabled boolean not null default true,
  digest_hour smallint not null default 8,        -- 0-23, in the user's local timezone
  timezone text not null default 'UTC',            -- IANA name, e.g. 'Europe/Istanbul'
  last_digest_sent_at timestamptz
);

alter table user_settings enable row level security;

create policy "user_settings: owner read" on user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings: owner insert" on user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings: owner update" on user_settings
  for update using (auth.uid() = user_id);
