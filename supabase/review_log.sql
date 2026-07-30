-- Run this once in the Supabase SQL editor, after digest_frequency.sql,
-- to log each review event so we can compute streaks and activity stats.

create table if not exists review_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references ideas(id) on delete cascade,
  grade text not null,
  reviewed_at timestamptz not null default now()
);

create index if not exists review_log_user_idx on review_log (user_id, reviewed_at desc);

alter table review_log enable row level security;

create policy "review_log: owner read" on review_log
  for select using (auth.uid() = user_id);
create policy "review_log: owner write" on review_log
  for insert with check (auth.uid() = user_id);
