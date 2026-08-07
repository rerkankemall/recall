import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';
import { getOrCreateSubscription, isEntitled } from '@/lib/entitlement';
import { parseBookmarksHtml } from '@/lib/importParsers';

// POST /api/import-bookmarks  { content: string }
// Parses a browser bookmark/reading-list HTML export and queues each link
// for manual capture later — see /api/queue for consuming the queue.
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const sub = await getOrCreateSubscription(user.id);
  if (!isEntitled(sub)) {
    return NextResponse.json({ error: 'Your trial has ended. Subscribe to import bookmarks.' }, { status: 403 });
  }

  const { content } = await req.json();
  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'No file content provided' }, { status: 400 });
  }

  const bookmarks = parseBookmarksHtml(content);
  if (bookmarks.length === 0) {
    return NextResponse.json({ error: 'No bookmarks found in this file' }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from('queued_links')
    .select('url')
    .eq('user_id', user.id);
  const existingUrls = new Set((existing || []).map((r) => r.url));

  const toInsert = bookmarks
    .filter((b) => !existingUrls.has(b.url))
    .map((b) => ({ user_id: user.id, title: b.title, url: b.url }));

  const duplicatesSkipped = bookmarks.length - toInsert.length;

  if (toInsert.length > 0) {
    const { error } = await supabase.from('queued_links').insert(toInsert);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ queued: toInsert.length, duplicatesSkipped });
}
