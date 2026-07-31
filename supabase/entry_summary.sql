-- Run this once in the Supabase SQL editor, after entry_tags.sql,
-- to let entries optionally store a generated summary alongside their ideas.

alter table entries add column if not exists summary text;
