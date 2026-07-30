import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';
import { getOrCreateSubscription, isEntitled } from '@/lib/entitlement';

// GET /api/ideas -> { entries, ideas } for the signed-in user (RLS scopes this)
export async function GET() {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { data: entries, error: e1 } = await supabase
    .from('entries')
    .select('*')
    .order('created_at', { ascending: false });

  const { data: ideas, error: e2 } = await supabase
    .from('ideas')
    .select('*')
    .order('due_date', { ascending: true });

  if (e1 || e2) {
    return NextResponse.json({ error: (e1 || e2)?.message }, { status: 500 });
  }

  return NextResponse.json({ entries, ideas });
}

// POST /api/ideas -> save a new entry plus its list of extracted ideas
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const sub = await getOrCreateSubscription(user.id);
  if (!isEntitled(sub)) {
    return NextResponse.json({ error: 'Your trial has ended. Subscribe to keep saving new ideas.' }, { status: 403 });
  }

  const { title, type, ideas, tags } = await req.json();
  if (!Array.isArray(ideas) || ideas.length === 0) {
    return NextResponse.json({ error: 'No ideas to save' }, { status: 400 });
  }

  const cleanTags = Array.isArray(tags)
    ? Array.from(new Set(tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean)))
    : [];

  const { data: entry, error: entryErr } = await supabase
    .from('entries')
    .insert({ title: title || 'Untitled', type: type || 'Note', user_id: user.id, tags: cleanTags })
    .select()
    .single();

  if (entryErr) return NextResponse.json({ error: entryErr.message }, { status: 500 });

  const rows = ideas
    .filter((t: string) => t && t.trim())
    .map((text: string) => ({
      entry_id: entry.id,
      user_id: user.id,
      text: text.trim(),
    }));

  const { data: savedIdeas, error: ideasErr } = await supabase
    .from('ideas')
    .insert(rows)
    .select();

  if (ideasErr) return NextResponse.json({ error: ideasErr.message }, { status: 500 });

  return NextResponse.json({ entry, ideas: savedIdeas });
}
