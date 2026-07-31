import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';

// PATCH /api/entries/:id  { tags?: string[], title?: string }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { tags, title } = await req.json();
  const update: { tags?: string[]; title?: string } = {};

  if (tags !== undefined) {
    update.tags = Array.isArray(tags)
      ? Array.from(new Set(tags.map((t: string) => t.trim().toLowerCase()).filter(Boolean)))
      : [];
  }
  if (title !== undefined) {
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    if (!cleanTitle) return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    update.title = cleanTitle;
  }

  const { data, error } = await supabase
    .from('entries')
    .update(update)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ entry: data });
}

// DELETE /api/entries/:id  (cascades to its ideas via the DB foreign key)
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const { error } = await supabase.from('entries').delete().eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
