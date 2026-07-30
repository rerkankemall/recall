import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabaseServer';
import { getOrCreateSubscription, isEntitled } from '@/lib/entitlement';
import { parseKindleClippings, parseReadwiseCSV, ParsedBook } from '@/lib/importParsers';

// POST /api/import  { format: 'kindle' | 'readwise', content: string }
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const sub = await getOrCreateSubscription(user.id);
  if (!isEntitled(sub)) {
    return NextResponse.json({ error: 'Your trial has ended. Subscribe to import highlights.' }, { status: 403 });
  }

  const { format, content } = await req.json();
  if (!content || typeof content !== 'string') {
    return NextResponse.json({ error: 'No file content provided' }, { status: 400 });
  }

  let books: ParsedBook[];
  try {
    if (format === 'kindle') books = parseKindleClippings(content);
    else if (format === 'readwise') books = parseReadwiseCSV(content);
    else return NextResponse.json({ error: 'Unknown import format' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Could not parse this file' }, { status: 400 });
  }

  if (books.length === 0) {
    return NextResponse.json({ error: 'No highlights found in this file' }, { status: 400 });
  }

  const { data: existingEntries } = await supabase
    .from('entries')
    .select('id, title')
    .eq('user_id', user.id);
  const { data: existingIdeas } = await supabase
    .from('ideas')
    .select('entry_id, text')
    .eq('user_id', user.id);

  const entryByTitle = new Map((existingEntries || []).map((e) => [e.title, e.id as string]));
  const existingTextByEntry = new Map<string, Set<string>>();
  (existingIdeas || []).forEach((i) => {
    if (!existingTextByEntry.has(i.entry_id)) existingTextByEntry.set(i.entry_id, new Set());
    existingTextByEntry.get(i.entry_id)!.add(i.text);
  });

  let entriesCreated = 0;
  let ideasImported = 0;
  let duplicatesSkipped = 0;

  for (const book of books) {
    let entryId = entryByTitle.get(book.title);
    if (!entryId) {
      const { data: newEntry, error: entryErr } = await supabase
        .from('entries')
        .insert({ user_id: user.id, title: book.title, type: 'Book' })
        .select()
        .single();
      if (entryErr || !newEntry) continue;
      entryId = newEntry.id as string;
      entryByTitle.set(book.title, entryId);
      existingTextByEntry.set(entryId, new Set());
      entriesCreated++;
    }
    if (!entryId) continue;

    const existingTexts = existingTextByEntry.get(entryId)!;
    const rows = book.highlights
      .filter((h) => !existingTexts.has(h))
      .map((h) => ({ entry_id: entryId, user_id: user.id, text: h }));

    duplicatesSkipped += book.highlights.length - rows.length;

    if (rows.length > 0) {
      const { data: inserted, error: ideasErr } = await supabase.from('ideas').insert(rows).select();
      if (!ideasErr && inserted) {
        ideasImported += inserted.length;
        inserted.forEach((i) => existingTexts.add(i.text));
      }
    }
  }

  return NextResponse.json({ entriesCreated, ideasImported, duplicatesSkipped });
}
