-- Run this once in the Supabase SQL editor.
-- Holds imported bookmarks/reading-list links waiting to be manually
-- captured one at a time — separate from entries/ideas since a bookmark is
-- just a URL + title, not actual highlighted content yet.

create table if not exists queued_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create index if not exists queued_links_user_idx on queued_links (user_id, created_at asc);

alter table queued_links enable row level security;

create policy "queued_links: owner read" on queued_links
  for select using (auth.uid() = user_id);
create policy "queued_links: owner write" on queued_links
  for insert with check (auth.uid() = user_id);
create policy "queued_links: owner delete" on queued_links
  for delete using (auth.uid() = user_id);
