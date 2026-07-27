-- Run this once in the Supabase SQL editor for your project.

create table if not exists entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  type text not null default 'Note',
  created_at timestamptz not null default now()
);

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  interval_days real not null default 1,
  ease real not null default 2.5,
  reps integer not null default 0,
  due_date timestamptz not null default now() + interval '1 day',
  created_at timestamptz not null default now()
);

create index if not exists ideas_due_idx on ideas (user_id, due_date);
create index if not exists entries_user_idx on entries (user_id, created_at desc);

-- Row Level Security: every user can only ever read/write their own rows.
alter table entries enable row level security;
alter table ideas enable row level security;

create policy "entries: owner read" on entries
  for select using (auth.uid() = user_id);
create policy "entries: owner write" on entries
  for insert with check (auth.uid() = user_id);
create policy "entries: owner delete" on entries
  for delete using (auth.uid() = user_id);

create policy "ideas: owner read" on ideas
  for select using (auth.uid() = user_id);
create policy "ideas: owner write" on ideas
  for insert with check (auth.uid() = user_id);
create policy "ideas: owner update" on ideas
  for update using (auth.uid() = user_id);
create policy "ideas: owner delete" on ideas
  for delete using (auth.uid() = user_id);

-- Subscription status, filled in once Stripe is wired up (see stripe webhook route).
create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text,
  status text not null default 'free', -- 'free' | 'active' | 'canceled' | 'past_due'
  current_period_end timestamptz
);
alter table subscriptions enable row level security;
create policy "subscriptions: owner read" on subscriptions
  for select using (auth.uid() = user_id);
