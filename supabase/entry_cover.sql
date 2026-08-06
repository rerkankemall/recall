-- Run this once in the Supabase SQL editor.
-- Stores a cover image URL for an entry — a YouTube video's own thumbnail,
-- or a book cover looked up from Open Library. Null when neither applies
-- (articles, papers, notes) or nothing was found.

alter table entries add column if not exists cover_url text;
