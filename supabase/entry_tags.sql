-- Run this once in the Supabase SQL editor, after review_log.sql,
-- to let users tag saved files by topic (e.g. "productivity", "psychology"),
-- separate from the existing Book/Article/etc. type field.

alter table entries add column if not exists tags text[] not null default '{}';

create index if not exists entries_tags_idx on entries using gin (tags);

-- entries had no update policy before (only read/insert/delete) — needed so
-- users can edit their own entry's tags.
drop policy if exists "entries: owner update" on entries;
create policy "entries: owner update" on entries
  for update using (auth.uid() = user_id);
