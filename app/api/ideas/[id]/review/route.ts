import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';
import { schedule, Grade } from '@/lib/spacedRepetition';
import { getOrCreateSubscription, isEntitled } from '@/lib/entitlement';

// POST /api/ideas/:id/review  { grade: 'again' | 'hard' | 'good' | 'easy' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const sub = await getOrCreateSubscription(user.id);
  if (!isEntitled(sub)) {
    return NextResponse.json({ error: 'Your trial has ended. Subscribe to keep reviewing.' }, { status: 403 });
  }

  const { grade } = (await req.json()) as { grade: Grade };

  const { data: idea, error: fetchErr } = await supabase
    .from('ideas')
    .select('*')
    .eq('id', params.id)
    .single();

  if (fetchErr || !idea) return NextResponse.json({ error: 'Idea not found' }, { status: 404 });

  const updated = schedule(idea, grade);

  const { data, error } = await supabase
    .from('ideas')
    .update(updated)
    .eq('id', params.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ idea: data });
}
